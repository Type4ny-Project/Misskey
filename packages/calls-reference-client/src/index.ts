/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Stream, api, calls } from 'misskey-js';
import type { Channels, IChannelConnection } from 'misskey-js';

export class CallsReferenceClient {
	private api: api.APIClient;
	private stream: Stream;
	private channel: IChannelConnection<Channels['callsRoom']> | null = null;
	private peer: RTCPeerConnection | null = null;
	private localTrack: MediaStreamTrack | null = null;
	private participantId: string | null = null;
	private connectionId = crypto.randomUUID();
	private generation = 0;
	private mediaCredential = '';
	private tracker = new calls.CallsEventSequenceTracker();

	constructor(origin: string, credential: string) {
		this.api = new api.APIClient({ origin, credential });
		this.stream = new Stream(origin, { token: credential });
	}

	public async checkCompatibility() {
		const capabilities = await this.api.request('calls/capabilities', {});
		return calls.negotiateCallsCompatibility(capabilities, { requiredExtensions: ['websocket-room-events'] });
	}

	public async join(roomId: string, publishMicrophone = false): Promise<void> {
		const compatibility = await this.checkCompatibility();
		if (!compatibility.compatible) throw new Error(compatibility.reason);
		await this.api.request('calls/rooms/join', { roomId });
		const channel = this.stream.useChannel('callsRoom', { roomId });
		this.channel = channel;
		for (const event of ['lifecycle', 'participant', 'role', 'speakerRequest', 'mute', 'speaking', 'track', 'revoked'] as const) {
			channel.on(event, payload => {
				if (this.tracker.accept(payload.sequence) === 'gap') void this.reconcile(roomId);
				if (event === 'track') void this.reconcile(roomId);
			});
		}

		if (publishMicrophone) {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			this.localTrack = stream.getAudioTracks()[0] ?? null;
		}
		await this.createMediaSession(roomId);
	}

	private async createMediaSession(roomId: string): Promise<void> {
		this.peer?.close();
		const turn = await this.api.request('calls/media/turn-credentials', { roomId }).catch(() => null);
		this.peer = new RTCPeerConnection({ iceServers: turn?.iceServers ?? [] });
		const transceiver = this.peer.addTransceiver('audio', { direction: this.localTrack == null ? 'recvonly' : 'sendrecv' });
		const capabilities = RTCRtpReceiver.getCapabilities('audio');
		if (capabilities != null && typeof transceiver.setCodecPreferences === 'function') transceiver.setCodecPreferences(calls.preferCallsOpus(capabilities.codecs));
		if (this.localTrack != null) await transceiver.sender.replaceTrack(this.localTrack);
		const session = await this.api.request('calls/media/session/create', { roomId, connectionId: this.connectionId });
		this.participantId = session.participantId;
		this.generation = session.generation;
		this.mediaCredential = session.mediaCredential;
		if (this.localTrack != null) {
			const offer = await this.peer.createOffer();
			await this.peer.setLocalDescription(offer);
			const published = await this.api.request('calls/media/tracks/publish', {
				roomId, participantId: this.participantId, connectionId: this.connectionId, generation: this.generation,
				mediaCredential: this.mediaCredential, mid: transceiver.mid ?? '0', sessionDescription: { type: 'offer', sdp: offer.sdp ?? '' },
			});
			await this.applyNegotiation(roomId, published.negotiation);
		}
		await this.reconcile(roomId);
	}

	private async reconcile(roomId: string): Promise<void> {
		if (this.peer == null || this.participantId == null) return;
		const state = await this.api.request('calls/media/reconcile', { roomId });
		const publicationIds = state.publications.filter(publication => publication.participantId !== this.participantId).map(publication => publication.id);
		if (publicationIds.length === 0) return;
		const negotiation = await this.api.request('calls/media/tracks/subscribe', {
			roomId, participantId: this.participantId, connectionId: this.connectionId, generation: this.generation,
			mediaCredential: this.mediaCredential, publicationIds,
		});
		await this.applyNegotiation(roomId, negotiation);
	}

	private async applyNegotiation(roomId: string, negotiation: { sessionDescription: { type: 'offer' | 'answer'; sdp: string } | null; requiresImmediateRenegotiation: boolean }): Promise<void> {
		if (this.peer == null || this.participantId == null || negotiation.sessionDescription == null) return;
		await this.peer.setRemoteDescription(negotiation.sessionDescription);
		if (negotiation.sessionDescription.type === 'offer' || negotiation.requiresImmediateRenegotiation) {
			const answer = await this.peer.createAnswer();
			await this.peer.setLocalDescription(answer);
			await this.api.request('calls/media/renegotiate', {
				roomId, participantId: this.participantId, connectionId: this.connectionId, generation: this.generation,
				mediaCredential: this.mediaCredential, sessionDescription: { type: 'answer', sdp: answer.sdp ?? '' },
			});
		}
	}

	public async close(roomId: string): Promise<void> {
		this.channel?.dispose();
		this.peer?.close();
		this.localTrack?.stop();
		await this.api.request('calls/rooms/leave', { roomId });
	}
}
