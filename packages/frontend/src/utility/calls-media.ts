/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { misskeyApi } from '@/utility/misskey-api.js';
import { detectCallsMediaCapabilities, normalizeCallsMediaError, normalizeCallsStats, preferOpus, type CallsNormalizedStats } from './calls-media-core.js';

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
	private turnRefreshTimer: number | null = null;
	private cancelAcquisition: (() => void) | null = null;
	private statsTimer: number | null = null;
	private lastStatsBytes = 0;
	private lastStatsAt = 0;
	private speaking = false;
	private reconnectReason: CallsNormalizedStats['reconnectReason'] = null;
	private reconnectStartedAt = 0;
	private recoveryTimeMs: number | null = null;

	public get connectionIdentity(): { connectionId: string; generation: number } | null {
		return this.generation === 0 ? null : { connectionId: this.connectionId, generation: this.generation };
	}

	constructor(
		private roomId: string,
		private role: 'host' | 'speaker' | 'listener',
		private onState?: (state: CallsMediaState, failure: CallsMediaFailure | null) => void,
		private onRemoteTrack?: (track: MediaStreamTrack) => void,
		private onStats?: (stats: CallsNormalizedStats, speaking: boolean) => void,
	) {}

	public async connect(deviceId?: string): Promise<void> {
		const capabilities = detectCallsMediaCapabilities();
		if (!capabilities.secureContext || (this.role !== 'listener' && !capabilities.getUserMedia) || !capabilities.peerConnection || !capabilities.transceiver) {
			this.fail('unsupported');
			return;
		}
		try {
			if (this.role !== 'listener') await this.acquireMicrophone(deviceId);
			await this.enqueue(() => this.createConnection());
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				this.setState('idle');
				return;
			}
			this.cleanupPeer(true);
			this.fail(error instanceof DOMException ? normalizeCallsMediaError(error) : 'negotiation-failed');
			throw error;
		}
	}

	private async acquireMicrophone(deviceId?: string): Promise<void> {
		this.setState('acquiring-media');
		this.localTrack?.stop();
		const mediaRequest = navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: deviceId == null ? undefined : { exact: deviceId },
				channelCount: { ideal: 1 }, echoCancellation: { ideal: true },
				noiseSuppression: { ideal: true }, autoGainControl: { ideal: true },
			},
		});
		const stream = await new Promise<MediaStream>((resolve, reject) => {
			const timeout = window.setTimeout(() => {
				this.cancelAcquisition = null;
				reject(new DOMException('Microphone permission is still pending', 'TimeoutError'));
			}, 30_000);
			this.cancelAcquisition = () => reject(new DOMException('Microphone acquisition cancelled', 'AbortError'));
			void mediaRequest.then(value => {
				window.clearTimeout(timeout);
				if (this.cancelAcquisition == null) {
					for (const track of value.getTracks()) track.stop();
					return;
				}
				this.cancelAcquisition = null;
				resolve(value);
			}, error => {
				window.clearTimeout(timeout);
				this.cancelAcquisition = null;
				reject(error);
			});
		});
		this.localTrack = stream.getAudioTracks()[0] ?? null;
		if (this.localTrack == null) throw new DOMException('No audio track', 'NotFoundError');
		this.localTrack.addEventListener('ended', () => void this.recoverFromDeviceLoss());
	}

	public cancelMicrophoneRequest(): void {
		const cancel = this.cancelAcquisition;
		this.cancelAcquisition = null;
		cancel?.();
	}

	private async createConnection(): Promise<void> {
		this.cleanupPeer(false);
		this.setState(this.generation === 0 ? 'creating-session' : 'reconnecting');
		const turn = await misskeyApi('calls/media/turn-credentials', { roomId: this.roomId }).catch(() => null);
		const peer = new RTCPeerConnection({ iceServers: turn?.iceServers ?? [{ urls: ['stun:stun.cloudflare.com:3478'] }] });
		this.peer = peer;
		if (turn != null) this.scheduleTurnRefresh(Date.parse(turn.expiresAt));
		peer.addEventListener('track', event => this.onRemoteTrack?.(event.track));
		peer.addEventListener('connectionstatechange', () => {
			if (peer !== this.peer) return;
			if (peer.connectionState === 'connected') {
				if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer);
				this.reconnectTimer = null;
				if (this.reconnectStartedAt !== 0) this.recoveryTimeMs = performance.now() - this.reconnectStartedAt;
				this.setState('connected');
				this.startStats();
			}
			if (peer.connectionState === 'failed') this.scheduleReconnect('failed');
			if (peer.connectionState === 'disconnected') {
				if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer);
				this.reconnectTimer = window.setTimeout(() => this.scheduleReconnect('disconnected'), 5000);
			}
		});

		const sendTransceiver = peer.addTransceiver('audio', { direction: this.role === 'listener' ? 'recvonly' : 'sendrecv' });
		const capabilities = RTCRtpReceiver.getCapabilities('audio');
		if (capabilities != null && typeof sendTransceiver.setCodecPreferences === 'function') {
			sendTransceiver.setCodecPreferences(preferOpus(capabilities.codecs));
		}
		if (this.localTrack != null) await sendTransceiver.sender.replaceTrack(this.localTrack);

		const session = await misskeyApi('calls/media/session/create', { roomId: this.roomId, connectionId: this.connectionId, operationId: crypto.randomUUID() });
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
				operationId: crypto.randomUUID(),
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
			operationId: crypto.randomUUID(),
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
				operationId: crypto.randomUUID(),
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

	private async recoverFromDeviceLoss(): Promise<void> {
		if (this.role === 'listener' || this.state === 'leaving' || this.state === 'closed') return;
		try {
			await this.acquireMicrophone();
			this.scheduleReconnect('failed');
		} catch (error) {
			this.fail(error instanceof DOMException ? normalizeCallsMediaError(error) : 'hardware-failure');
		}
	}

	public async close(): Promise<void> {
		this.setState('leaving');
		await this.ensureCredential().catch(() => undefined);
		for (const publicationId of this.publications) {
			await misskeyApi('calls/media/tracks/close', { roomId: this.roomId, participantId: this.participantId!, connectionId: this.connectionId, generation: this.generation, operationId: crypto.randomUUID(), mediaCredential: this.mediaCredential!, publicationId }).catch(() => undefined);
		}
		this.publications.clear();
		this.cleanupPeer(true);
		this.setState('closed');
	}

	private scheduleReconnect(reason: Exclude<CallsNormalizedStats['reconnectReason'], null>): void {
		if (this.state === 'leaving' || this.state === 'closed' || this.state === 'reconnecting') return;
		this.reconnectReason = reason;
		this.reconnectStartedAt = performance.now();
		this.recoveryTimeMs = null;
		this.setState('reconnecting');
		void this.enqueue(() => this.createConnection()).catch(() => this.fail('negotiation-failed'));
	}

	private async ensureCredential(): Promise<void> {
		if (this.mediaCredential == null || this.participantId == null) throw new Error('Calls media credential is not initialized');
		if (Date.now() < this.credentialExpiresAt - 60_000) return;
		const refreshed = await misskeyApi('calls/media/credential/refresh', {
			roomId: this.roomId, participantId: this.participantId, connectionId: this.connectionId,
			generation: this.generation, operationId: crypto.randomUUID(), mediaCredential: this.mediaCredential,
		});
		this.mediaCredential = refreshed.mediaCredential;
		this.credentialExpiresAt = Date.parse(refreshed.credentialExpiresAt);
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.queue.then(operation, operation);
		this.queue = result.then(() => undefined, () => undefined);
		return result;
	}

	private scheduleTurnRefresh(expiresAt: number): void {
		if (this.turnRefreshTimer != null) window.clearTimeout(this.turnRefreshTimer);
		const delay = Math.max(1_000, expiresAt - Date.now() - 60_000);
		this.turnRefreshTimer = window.setTimeout(() => {
			void this.refreshTurnCredentials().catch(() => {
				if (this.peer == null || this.state === 'closed' || this.state === 'leaving') return;
				this.turnRefreshTimer = window.setTimeout(() => {
					void this.refreshTurnCredentials().catch(() => undefined);
				}, 15_000);
			});
		}, delay);
	}

	private async refreshTurnCredentials(): Promise<void> {
		if (this.peer == null || this.state === 'closed' || this.state === 'leaving') return;
		const turn = await misskeyApi('calls/media/turn-credentials', { roomId: this.roomId });
		if (this.peer == null) return;
		this.peer.setConfiguration({ ...this.peer.getConfiguration(), iceServers: turn.iceServers });
		this.scheduleTurnRefresh(Date.parse(turn.expiresAt));
	}

	private startStats(): void {
		if (this.statsTimer != null) return;
		this.lastStatsAt = performance.now();
		this.statsTimer = window.setInterval(() => void this.sampleStats(), 500);
	}

	private async sampleStats(): Promise<void> {
		if (this.peer == null) return;
		const now = performance.now();
		const report = await this.peer.getStats();
		const normalized = normalizeCallsStats(report, this.lastStatsBytes, Math.max((now - this.lastStatsAt) / 1000, 0.001), { reason: this.reconnectReason, recoveryTimeMs: this.recoveryTimeMs });
		this.lastStatsAt = now;
		let bytes = 0;
		report.forEach(value => {
			if (value.type === 'inbound-rtp' && typeof value.bytesReceived === 'number') bytes += value.bytesReceived;
			if (value.type === 'outbound-rtp' && typeof value.bytesSent === 'number') bytes += value.bytesSent;
		});
		this.lastStatsBytes = bytes;
		const speaking = !this.speaking && (normalized.audioLevel ?? 0) >= 0.03 ? true : this.speaking && (normalized.audioLevel ?? 0) > 0.015;
		this.speaking = speaking;
		this.onStats?.(normalized, speaking);
		if (this.recoveryTimeMs != null) {
			this.reconnectReason = null;
			this.reconnectStartedAt = 0;
			this.recoveryTimeMs = null;
		}
	}

	private cleanupPeer(stopTrack: boolean): void {
		if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer);
		if (this.turnRefreshTimer != null) window.clearTimeout(this.turnRefreshTimer);
		if (this.statsTimer != null) window.clearInterval(this.statsTimer);
		this.reconnectTimer = null;
		this.turnRefreshTimer = null;
		this.statsTimer = null;
		this.speaking = false;
		this.cancelMicrophoneRequest();
		this.peer?.close();
		this.peer = null;
		if (stopTrack) { this.localTrack?.stop(); this.localTrack = null; }
	}

	private setState(state: CallsMediaState): void { this.state = state; this.failure = null; this.onState?.(state, null); }
	private fail(failure: CallsMediaFailure): void { this.state = 'failed'; this.failure = failure; this.onState?.('failed', failure); }
}
