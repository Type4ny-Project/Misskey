/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { misskeyApi } from '@/utility/misskey-api.js';
import { detectCallsMediaCapabilities, normalizeCallsMediaError, preferOpus } from './calls-media-core.js';

export type CallsMediaState = 'idle' | 'acquiring-media' | 'creating-session' | 'negotiating' | 'connected' | 'reconnecting' | 'leaving' | 'closed' | 'failed';
export type CallsMediaFailure = 'unsupported' | 'permission-denied' | 'device-not-found' | 'hardware-failure' | 'constraint-mismatch' | 'permission-pending' | 'negotiation-failed';

export class CallsMediaController {
	public state: CallsMediaState = 'idle';
	public failure: CallsMediaFailure | null = null;
	public generation = 0;
	public participantId: string | null = null;
	public localTrack: MediaStreamTrack | null = null;
	private peer: RTCPeerConnection | null = null;
	private connectionId = crypto.randomUUID();
	private queue = Promise.resolve();
	private reconnectTimer: number | null = null;
	private publications = new Set<string>();
	private mediaCredential: string | null = null;
	private credentialExpiresAt = 0;

	constructor(
		private roomId: string,
		private role: 'host' | 'speaker' | 'listener',
		private onState?: (state: CallsMediaState, failure: CallsMediaFailure | null) => void,
		private onRemoteTrack?: (track: MediaStreamTrack) => void,
	) {}

	public async connect(deviceId?: string): Promise<void> {
		const capabilities = detectCallsMediaCapabilities();
		if (!capabilities.secureContext || !capabilities.getUserMedia || !capabilities.peerConnection || !capabilities.transceiver) {
			this.fail('unsupported');
			return;
		}
		try {
			if (this.role !== 'listener') await this.acquireMicrophone(deviceId);
			await this.enqueue(() => this.createConnection());
		} catch (error) {
			this.fail(error instanceof DOMException ? normalizeCallsMediaError(error) : 'negotiation-failed');
			throw error;
		}
	}

	private async acquireMicrophone(deviceId?: string): Promise<void> {
		this.setState('acquiring-media');
		this.localTrack?.stop();
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: deviceId == null ? undefined : { exact: deviceId },
				channelCount: { ideal: 1 }, echoCancellation: { ideal: true },
				noiseSuppression: { ideal: true }, autoGainControl: { ideal: true },
			},
		});
		this.localTrack = stream.getAudioTracks()[0] ?? null;
		if (this.localTrack == null) throw new DOMException('No audio track', 'NotFoundError');
		this.localTrack.addEventListener('ended', () => this.scheduleReconnect());
	}

	private async createConnection(): Promise<void> {
		this.cleanupPeer(false);
		this.setState(this.generation === 0 ? 'creating-session' : 'reconnecting');
		const turn = await misskeyApi('calls/media/turn-credentials', { roomId: this.roomId }).catch(() => null);
		const peer = new RTCPeerConnection({ iceServers: turn?.iceServers ?? [{ urls: ['stun:stun.cloudflare.com:3478'] }] });
		this.peer = peer;
		peer.addEventListener('track', event => this.onRemoteTrack?.(event.track));
		peer.addEventListener('connectionstatechange', () => {
			if (peer !== this.peer) return;
			if (peer.connectionState === 'connected') this.setState('connected');
			if (peer.connectionState === 'failed') this.scheduleReconnect();
			if (peer.connectionState === 'disconnected') {
				if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer);
				this.reconnectTimer = window.setTimeout(() => this.scheduleReconnect(), 5000);
			}
		});

		const sendTransceiver = peer.addTransceiver('audio', { direction: this.role === 'listener' ? 'recvonly' : 'sendrecv' });
		const capabilities = RTCRtpReceiver.getCapabilities('audio');
		if (capabilities != null && typeof sendTransceiver.setCodecPreferences === 'function') {
			sendTransceiver.setCodecPreferences(preferOpus(capabilities.codecs));
		}
		if (this.localTrack != null) await sendTransceiver.sender.replaceTrack(this.localTrack);

		const session = await misskeyApi('calls/media/session/create', { roomId: this.roomId, connectionId: this.connectionId });
		this.generation = session.generation;
		this.participantId = session.participantId;
		this.mediaCredential = session.mediaCredential;
		this.credentialExpiresAt = Date.parse(session.credentialExpiresAt);
		if (session.sessionDescription != null) await peer.setRemoteDescription(session.sessionDescription);

		if (this.localTrack != null) {
			await this.ensureCredential();
			this.setState('negotiating');
			const offer = await peer.createOffer();
			await peer.setLocalDescription(offer);
			const result = await misskeyApi('calls/media/tracks/publish', {
				roomId: this.roomId, connectionId: this.connectionId, generation: this.generation,
				participantId: this.participantId!, mediaCredential: this.mediaCredential!,
				mid: sendTransceiver.mid ?? '0', sessionDescription: { type: 'offer', sdp: offer.sdp ?? '' },
			});
			this.publications.add(result.publicationId);
			await this.applyNegotiation(result.negotiation);
		}
		await this.reconcile();
	}

	public async reconcile(): Promise<void> {
		if (this.peer == null || this.generation === 0) return;
		await this.ensureCredential();
		const authoritative = await misskeyApi('calls/media/reconcile', { roomId: this.roomId });
		const remoteIds = authoritative.publications.filter(publication => publication.participantId !== this.participantId).map(publication => publication.id);
		if (remoteIds.length === 0) return;
		const negotiation = await misskeyApi('calls/media/tracks/subscribe', {
			roomId: this.roomId, connectionId: this.connectionId, generation: this.generation, publicationIds: remoteIds,
			participantId: this.participantId!, mediaCredential: this.mediaCredential!,
		});
		await this.applyNegotiation(negotiation);
	}

	private async applyNegotiation(negotiation: { sessionDescription: { type: 'offer' | 'answer'; sdp: string } | null; requiresImmediateRenegotiation: boolean }): Promise<void> {
		if (this.peer == null || negotiation.sessionDescription == null) return;
		await this.peer.setRemoteDescription(negotiation.sessionDescription);
		if (negotiation.sessionDescription.type === 'offer' || negotiation.requiresImmediateRenegotiation) {
			await this.ensureCredential();
			const answer = await this.peer.createAnswer();
			await this.peer.setLocalDescription(answer);
			const result = await misskeyApi('calls/media/renegotiate', {
				roomId: this.roomId, connectionId: this.connectionId, generation: this.generation,
				participantId: this.participantId!, mediaCredential: this.mediaCredential!,
				sessionDescription: { type: 'answer', sdp: answer.sdp ?? '' },
			});
			if (result.requiresImmediateRenegotiation) await this.applyNegotiation(result);
		}
	}

	public setMuted(muted: boolean): void { if (this.localTrack != null) this.localTrack.enabled = !muted; }

	public async switchMicrophone(deviceId: string): Promise<void> {
		const oldTrack = this.localTrack;
		await this.acquireMicrophone(deviceId);
		const sender = this.peer?.getSenders().find(item => item.track?.kind === 'audio');
		await sender?.replaceTrack(this.localTrack);
		oldTrack?.stop();
	}

	public async close(): Promise<void> {
		this.setState('leaving');
		await this.ensureCredential().catch(() => undefined);
		for (const publicationId of this.publications) {
			await misskeyApi('calls/media/tracks/close', { roomId: this.roomId, participantId: this.participantId!, connectionId: this.connectionId, generation: this.generation, mediaCredential: this.mediaCredential!, publicationId }).catch(() => undefined);
		}
		this.publications.clear();
		this.cleanupPeer(true);
		this.setState('closed');
	}

	private scheduleReconnect(): void {
		if (this.state === 'leaving' || this.state === 'closed' || this.state === 'reconnecting') return;
		this.setState('reconnecting');
		void this.enqueue(() => this.createConnection()).catch(() => this.fail('negotiation-failed'));
	}

	private async ensureCredential(): Promise<void> {
		if (this.mediaCredential == null || this.participantId == null) throw new Error('Calls media credential is not initialized');
		if (Date.now() < this.credentialExpiresAt - 60_000) return;
		const refreshed = await misskeyApi('calls/media/credential/refresh', {
			roomId: this.roomId, participantId: this.participantId, connectionId: this.connectionId,
			generation: this.generation, mediaCredential: this.mediaCredential,
		});
		this.mediaCredential = refreshed.mediaCredential;
		this.credentialExpiresAt = Date.parse(refreshed.credentialExpiresAt);
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.queue.then(operation, operation);
		this.queue = result.then(() => undefined, () => undefined);
		return result;
	}

	private cleanupPeer(stopTrack: boolean): void {
		if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
		this.peer?.close();
		this.peer = null;
		if (stopTrack) { this.localTrack?.stop(); this.localTrack = null; }
	}

	private setState(state: CallsMediaState): void { this.state = state; this.failure = null; this.onState?.(state, null); }
	private fail(failure: CallsMediaFailure): void { this.state = 'failed'; this.failure = failure; this.onState?.('failed', failure); }
}
