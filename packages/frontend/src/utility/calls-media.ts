/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { detectCallsMediaCapabilities, normalizeCallsMediaError, normalizeCallsStats, preferOpus } from './calls-media-core.js';
import type { CallsNormalizedStats } from './calls-media-core.js';
import { createCallsNoiseSuppression } from './calls-noise-suppression.js';
import type { CallsNoiseSuppression } from './calls-noise-suppression.js';
import { misskeyApi } from '@/utility/misskey-api.js';

export type CallsVideoSource = 'camera' | 'screen';
export type CallsVideoQuality = { height: 480 | 720 | 1080 | 1440 | 2160 | 'source'; frameRate: 15 | 30 | 60 | 90 | 120 | 144 };
export type CallsRemotePublication = { id: string; participantId: string; mediaKind: 'audio' | 'video'; mediaSource: 'microphone' | CallsVideoSource };
type CallsMicrophone = { track: MediaStreamTrack; processing: CallsNoiseSuppression | null };

function videoConstraints(quality: CallsVideoQuality): MediaTrackConstraints {
	if (quality.height === 'source') return { frameRate: { ideal: quality.frameRate, max: quality.frameRate } };
	const width = { 480: 854, 720: 1280, 1080: 1920, 1440: 2560, 2160: 3840 }[quality.height];
	return { width: { ideal: width, max: width }, height: { ideal: quality.height, max: quality.height }, frameRate: { ideal: quality.frameRate, max: quality.frameRate } };
}

export async function captureCallsCamera(deviceId: string | undefined, quality: CallsVideoQuality): Promise<MediaStream> {
	return navigator.mediaDevices.getUserMedia({ video: { ...videoConstraints(quality), deviceId: deviceId == null ? undefined : { exact: deviceId } }, audio: false });
}

export type CallsMediaState = 'idle' | 'acquiring-media' | 'creating-session' | 'negotiating' | 'connected' | 'reconnecting' | 'leaving' | 'closed' | 'failed';
export type CallsMediaFailure = 'unsupported' | 'permission-denied' | 'device-not-found' | 'hardware-failure' | 'constraint-mismatch' | 'permission-pending' | 'negotiation-failed';

export class CallsMediaController {
	public state: CallsMediaState = 'idle';
	public failure: CallsMediaFailure | null = null;
	public generation = 0;
	public participantId: string | null = null;
	public localTrack: MediaStreamTrack | null = null;
	private microphone: CallsMicrophone | null = null;
	private peer: RTCPeerConnection | null = null;
	private localVideos = new Map<CallsVideoSource, { track: MediaStreamTrack; publicationId?: string; transceiver?: RTCRtpTransceiver }>();
	private remotePublications = new Map<string, CallsRemotePublication>();
	private receivedRemoteTracks = new Map<string, MediaStreamTrack>();
	private connectionId: string = crypto.randomUUID();
	private queue = Promise.resolve();
	private reconnectTimer: number | null = null;
	private reconnectPromise: Promise<void> | null = null;
	private publications = new Set<string>();
	private subscribedPublications = new Set<string>();
	private mediaCredential: string | null = null;
	private credentialExpiresAt = 0;
	private turnRefreshTimer: number | null = null;
	private cancelAcquisition: (() => void) | null = null;
	private statsTimer: number | null = null;
	private lastStatsBytes = 0;
	private lastStatsAt = 0;
	private speaking = false;
	private muted = false;
	private noiseSuppression = true;
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
		private onRemoteTrack?: (track: MediaStreamTrack, publication: CallsRemotePublication) => void,
		private onStats?: (stats: CallsNormalizedStats, speaking: boolean) => void,
		previousConnection?: { connectionId: string; generation: number },
		private replaceExisting = false,
		private videoCallbacks?: {
			localTrack: (source: CallsVideoSource, track: MediaStreamTrack | null) => void;
			microphoneTrack?: (track: MediaStreamTrack | null) => void;
			noiseSuppressionChanged?: (enabled: boolean) => void;
			remoteRemoved: (publicationId: string) => void;
			error: (error: unknown) => void;
		},
		private canUseMicrophone = true,
	) {
		if (previousConnection != null) {
			this.connectionId = previousConnection.connectionId;
			this.generation = previousConnection.generation;
		}
	}

	public async connect(deviceId?: string): Promise<void> {
		const capabilities = detectCallsMediaCapabilities();
		if (!capabilities.secureContext || !capabilities.peerConnection || !capabilities.transceiver) {
			this.fail('unsupported');
			return;
		}
		try {
			if (this.role !== 'listener' && this.canUseMicrophone && capabilities.getUserMedia) {
				this.setState('acquiring-media');
				try {
					const microphone = await this.acquireMicrophone(deviceId);
					this.useMicrophone(microphone);
				} catch (error) {
					if (!(error instanceof DOMException) || !['NotFoundError', 'NotReadableError', 'NotAllowedError', 'SecurityError'].includes(error.name)) throw error;
					console.warn('[Calls] Joining without microphone:', error.name);
				}
			}
			await this.enqueue(() => this.createConnection());
		} catch (error) {
			if (this.isClosed()) return;
			if (error instanceof DOMException && error.name === 'AbortError') {
				this.setState('idle');
				return;
			}
			this.cleanupPeer(true);
			this.fail(error instanceof DOMException ? normalizeCallsMediaError(error) : 'negotiation-failed');
			throw error;
		}
	}

	private async acquireMicrophone(deviceId?: string): Promise<CallsMicrophone> {
		const mediaRequest = navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: deviceId == null ? undefined : { exact: deviceId },
				channelCount: { ideal: 1 }, echoCancellation: { ideal: true },
				// RNNoise owns noise suppression. Preserve browser echo cancellation and gain control.
				noiseSuppression: false, autoGainControl: { ideal: true },
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
		const track = stream.getAudioTracks()[0];
		if (track == null) throw new DOMException('No audio track', 'NotFoundError');
		if (this.isClosed()) { track.stop(); throw new DOMException('Call ended', 'AbortError'); }
		track.enabled = !this.muted;
		const abort = new AbortController();
		this.cancelAcquisition = () => { track.stop(); abort.abort(); };
		let processing: CallsNoiseSuppression | null = null;
		try {
			processing = await createCallsNoiseSuppression(stream, error => {
				if (this.microphone?.track !== track) return;
				console.warn('[Calls] Noise suppression failed', error);
				this.noiseSuppression = false;
				this.videoCallbacks?.noiseSuppressionChanged?.(false);
			}, abort.signal);
			abort.signal.throwIfAborted();
			processing.setEnabled(this.noiseSuppression);
		} catch (error) {
			processing?.close();
			processing = null;
			if (abort.signal.aborted) throw new DOMException('Microphone acquisition cancelled', 'AbortError');
			console.warn('[Calls] Noise suppression unavailable; using unprocessed microphone', error);
			this.noiseSuppression = false;
			this.videoCallbacks?.noiseSuppressionChanged?.(false);
		} finally {
			this.cancelAcquisition = null;
		}
		return { track, processing };
	}

	private useMicrophone(microphone: CallsMicrophone): void {
		this.microphone = microphone;
		this.localTrack = microphone.processing?.track ?? microphone.track;
		this.setMuted(this.muted);
		this.videoCallbacks?.microphoneTrack?.(this.localTrack);
		microphone.track.addEventListener('ended', () => {
			if (this.microphone === microphone) void this.recoverFromDeviceLoss();
		});
	}

	public cancelMicrophoneRequest(): void {
		const cancel = this.cancelAcquisition;
		this.cancelAcquisition = null;
		cancel?.();
	}

	private async createConnection(): Promise<void> {
		if (this.isClosed()) return;
		this.cleanupPeer(false);
		this.publications.clear();
		this.setState(this.generation === 0 ? 'creating-session' : 'reconnecting');
		const session = await misskeyApi('calls/media/session/create', { roomId: this.roomId, connectionId: this.connectionId, expectedGeneration: this.generation || undefined, replaceExisting: this.replaceExisting, operationId: crypto.randomUUID() });
		if (this.isClosed()) return;
		this.generation = session.generation;
		this.participantId = session.participantId;
		this.mediaCredential = session.mediaCredential;
		this.credentialExpiresAt = Date.parse(session.credentialExpiresAt);
		const turn = await misskeyApi('calls/media/turn-credentials', { roomId: this.roomId }).catch(() => null);
		if (this.isClosed()) return;
		const peer = new RTCPeerConnection({ iceServers: turn?.iceServers ?? [{ urls: ['stun:stun.cloudflare.com:3478'] }] });
		this.peer = peer;
		if (turn != null) this.scheduleTurnRefresh(Date.parse(turn.expiresAt));
		peer.addEventListener('track', event => {
			this.deliverRemoteTrack(event.transceiver.mid, event.track);
		});
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

		const sendTransceiver = peer.addTransceiver('audio', { direction: this.localTrack == null ? 'recvonly' : 'sendrecv' });
		const capabilities = RTCRtpReceiver.getCapabilities('audio');
		if (capabilities != null && typeof sendTransceiver.setCodecPreferences === 'function') {
			sendTransceiver.setCodecPreferences(preferOpus(capabilities.codecs));
		}
		if (this.localTrack != null) await sendTransceiver.sender.replaceTrack(this.localTrack);

		if (this.peer !== peer) return;
		if (session.sessionDescription != null) await peer.setRemoteDescription(session.sessionDescription);

		if (this.localTrack != null) {
			await this.publishMicrophone(peer, sendTransceiver);
		}
		for (const [source, video] of this.localVideos) {
			if (video.track.readyState === 'ended') continue;
			video.publicationId = undefined;
			await this.publishVideo(source, video);
		}
		const subscribed = await this.reconcileNow();
		if (this.localTrack == null && !subscribed && this.peer === peer) this.setState('connected');
	}

	private async publishMicrophone(peer: RTCPeerConnection, transceiver: RTCRtpTransceiver): Promise<void> {
		await this.ensureCredential();
		this.setState('negotiating');
		const offer = await peer.createOffer();
		await peer.setLocalDescription(offer);
		await this.waitForIceGathering(peer);
		const result = await misskeyApi('calls/media/tracks/publish', {
			roomId: this.roomId, connectionId: this.connectionId, generation: this.generation,
			operationId: crypto.randomUUID(),
			participantId: this.participantId!, mediaCredential: this.mediaCredential!,
			mid: transceiver.mid ?? '0', sessionDescription: { type: 'offer', sdp: peer.localDescription?.sdp ?? offer.sdp ?? '' },
		});
		this.publications.add(result.publicationId);
		await this.applyNegotiation(result.negotiation);
		await this.waitUntilPublishing(peer);
	}

	public reconcile(): Promise<boolean> {
		if (this.reconnectPromise != null) return this.reconnectPromise.then(() => false);
		if (!this.isClosed() && this.generation !== 0 && (this.state === 'failed' || this.peer?.connectionState === 'failed' || this.peer?.connectionState === 'disconnected')) {
			return this.scheduleReconnect(this.peer?.connectionState === 'disconnected' ? 'disconnected' : 'failed').then(() => false);
		}
		return this.enqueue(() => this.reconcileNow());
	}

	private deliverRemoteTrack(mid: string | null, track: MediaStreamTrack): void {
		const publication = this.remotePublications.get(mid ?? '');
		if (publication == null || this.receivedRemoteTracks.get(publication.id) === track) return;
		this.receivedRemoteTracks.set(publication.id, track);
		this.onRemoteTrack?.(track, publication);
	}

	private async reconcileNow(): Promise<boolean> {
		if (this.peer == null || this.generation === 0) return false;
		await this.ensureCredential();
		const authoritative = await misskeyApi('calls/media/reconcile', { roomId: this.roomId });
		const authoritativeOwnIds = new Set(authoritative.publications.filter(publication => publication.participantId === this.participantId).map(publication => publication.id));
		for (const [source, video] of this.localVideos) {
			if (video.publicationId == null || authoritativeOwnIds.has(video.publicationId)) continue;
			video.track.stop();
			this.localVideos.delete(source);
			this.publications.delete(video.publicationId);
			this.videoCallbacks?.localTrack(source, null);
			await video.transceiver?.sender.replaceTrack(null);
		}
		const authoritativeRemoteIds = new Set(authoritative.publications.filter(publication => publication.participantId !== this.participantId).map(publication => publication.id));
		for (const publicationId of this.subscribedPublications) {
			if (!authoritativeRemoteIds.has(publicationId)) {
				this.subscribedPublications.delete(publicationId);
				this.receivedRemoteTracks.delete(publicationId);
				for (const [mid, publication] of this.remotePublications) {
					if (publication.id !== publicationId) continue;
					this.peer.getTransceivers().find(transceiver => transceiver.mid === mid)?.receiver.track.stop();
					this.remotePublications.delete(mid);
				}
				this.videoCallbacks?.remoteRemoved(publicationId);
			}
		}
		const remoteIds = [...authoritativeRemoteIds].filter(publicationId => !this.subscribedPublications.has(publicationId));
		if (remoteIds.length === 0) return false;
		// The subscribe API accepts at most 64 publications per request.
		for (let offset = 0; offset < remoteIds.length; offset += 64) {
			const negotiation = await misskeyApi('calls/media/tracks/subscribe', {
				roomId: this.roomId, connectionId: this.connectionId, generation: this.generation, publicationIds: remoteIds.slice(offset, offset + 64),
				operationId: crypto.randomUUID(),
				participantId: this.participantId!, mediaCredential: this.mediaCredential!,
			});
			for (const subscription of negotiation.subscriptions ?? []) {
				const publication = authoritative.publications.find(item => item.id === subscription.publicationId);
				if (publication != null) this.remotePublications.set(subscription.mid, publication);
			}
			await this.applyNegotiation(negotiation);
			// Publishing may already have fired the track event for a reused receiver.
			for (const transceiver of this.peer?.getTransceivers() ?? []) {
				this.deliverRemoteTrack(transceiver.mid, transceiver.receiver.track);
			}
			for (const subscription of negotiation.subscriptions) this.subscribedPublications.add(subscription.publicationId);
		}
		return true;
	}

	private async applyNegotiation(negotiation: { sessionDescription: { type: 'offer' | 'answer'; sdp: string } | null; requiresImmediateRenegotiation: boolean }): Promise<void> {
		if (this.peer == null || negotiation.sessionDescription == null) return;
		await this.peer.setRemoteDescription(negotiation.sessionDescription);
		if (negotiation.sessionDescription.type === 'offer' || negotiation.requiresImmediateRenegotiation) {
			await this.ensureCredential();
			const answer = await this.peer.createAnswer();
			await this.peer.setLocalDescription(answer);
			await this.waitForIceGathering(this.peer);
			const result = await misskeyApi('calls/media/renegotiate', {
				roomId: this.roomId, connectionId: this.connectionId, generation: this.generation,
				operationId: crypto.randomUUID(),
				participantId: this.participantId!, mediaCredential: this.mediaCredential!,
				sessionDescription: { type: 'answer', sdp: this.peer.localDescription?.sdp ?? answer.sdp ?? '' },
			});
			if (result.requiresImmediateRenegotiation) await this.applyNegotiation(result);
		}
	}

	private async waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
		if (peer.iceGatheringState == null || peer.iceGatheringState === 'complete') return;
		await new Promise<void>(resolve => {
			const timeout = window.setTimeout(finish, 5000);

			function finish() {
				window.clearTimeout(timeout);
				peer.removeEventListener('icegatheringstatechange', handleChange);
				resolve();
			}

			function handleChange() { if (peer.iceGatheringState === 'complete') finish(); }

			peer.addEventListener('icegatheringstatechange', handleChange);
		});
	}

	private async waitUntilPublishing(peer: RTCPeerConnection): Promise<void> {
		const deadline = Date.now() + 10_000;
		while (Date.now() < deadline) {
			if (peer !== this.peer) throw new DOMException('Calls media operation was replaced', 'AbortError');
			if (peer.connectionState === 'failed') throw new Error('Publisher connection failed before sending audio packets');
			const report = await peer.getStats();
			let outboundReady = false;
			let transportReady = false;
			report.forEach(value => {
				if (value.type === 'outbound-rtp' && value.kind === 'audio' && (value.packetsSent ?? 0) > 0 && (value.bytesSent ?? 0) > 0) outboundReady = true;
				if (value.type === 'transport' && value.dtlsState === 'connected') transportReady = true;
			});
			if (peer.connectionState === 'connected' && outboundReady && transportReady) return;
			await new Promise(resolve => window.setTimeout(resolve, 250));
		}
		throw new Error('Publisher is not actually sending audio packets');
	}

	public async startVideo(source: CallsVideoSource, deviceId?: string, quality: CallsVideoQuality = { height: 720, frameRate: 30 }, previewStream?: MediaStream): Promise<void> {
		if (this.role === 'listener' || this.isClosed() || this.peer == null || this.localVideos.has(source)) {
			previewStream?.getTracks().forEach(track => track.stop());
			return;
		}
		// Call directly from the click handler so screen capture retains user activation.
		const stream = source === 'camera'
			? previewStream ?? await captureCallsCamera(deviceId, quality)
			: await navigator.mediaDevices.getDisplayMedia({ video: videoConstraints(quality), audio: false });
		const track = stream.getVideoTracks()[0];
		for (const extra of stream.getTracks()) if (extra !== track) extra.stop();
		if (this.isClosed() || this.peer == null) { track?.stop(); return; }
		if (track == null) throw new DOMException('No video track', 'NotFoundError');
		track.contentHint = source === 'screen' ? 'detail' : 'motion';
		const video = { track };
		this.localVideos.set(source, video);
		this.videoCallbacks?.localTrack(source, track);
		track.addEventListener('ended', () => {
			if (this.localVideos.get(source)?.track === track) void this.stopVideo(source).catch(error => this.videoCallbacks?.error(error));
		}, { once: true });
		try {
			await this.enqueue(() => this.publishVideo(source, video));
		} catch (error) {
			await this.stopVideo(source).catch(() => undefined);
			throw error;
		}
	}

	private async publishVideo(source: CallsVideoSource, video: { track: MediaStreamTrack; publicationId?: string; transceiver?: RTCRtpTransceiver }): Promise<void> {
		const peer = this.peer;
		if (peer == null || this.isClosed() || video.track.readyState === 'ended') return;
		await this.ensureCredential();
		const transceiver = peer.addTransceiver(video.track, { direction: 'sendonly' });
		video.transceiver = transceiver;
		try {
			// Keep screen/camera encoding consistent across browser and SFU renegotiations.
			const codecs = RTCRtpSender.getCapabilities('video')?.codecs.filter(codec => ['video/vp8', 'video/rtx'].includes(codec.mimeType.toLowerCase()));
			if (codecs?.some(codec => codec.mimeType.toLowerCase() === 'video/vp8') && typeof transceiver.setCodecPreferences === 'function') transceiver.setCodecPreferences(codecs);
			const offer = await peer.createOffer();
			await peer.setLocalDescription(offer);
			await this.waitForIceGathering(peer);
			if (this.peer !== peer || this.isClosed()) return;
			const result = await misskeyApi('calls/media/tracks/publish', {
				roomId: this.roomId, participantId: this.participantId!, connectionId: this.connectionId,
				generation: this.generation, operationId: crypto.randomUUID(), mediaCredential: this.mediaCredential!,
				mediaSource: source, mid: transceiver.mid!, sessionDescription: { type: 'offer', sdp: peer.localDescription?.sdp ?? offer.sdp ?? '' },
			});
			video.publicationId = result.publicationId;
			this.publications.add(result.publicationId);
			if (this.peer === peer) await this.applyNegotiation(result.negotiation);
		} catch (error) {
			if (this.peer === peer && peer.signalingState === 'have-local-offer') await peer.setLocalDescription({ type: 'rollback' });
			transceiver.stop();
			throw error;
		}
	}

	public async setVideoQuality(source: CallsVideoSource, quality: CallsVideoQuality): Promise<void> {
		const video = this.localVideos.get(source);
		if (video == null || this.isClosed()) return;
		await this.enqueue(async () => {
			if (this.isClosed() || this.localVideos.get(source) !== video) return;
			await video.track.applyConstraints(videoConstraints(quality));
		});
	}

	public async switchCamera(deviceId: string, quality: CallsVideoQuality = { height: 720, frameRate: 30 }): Promise<void> {
		const video = this.localVideos.get('camera');
		if (video == null) return;
		const stream = await navigator.mediaDevices.getUserMedia({ video: { ...videoConstraints(quality), deviceId: { exact: deviceId } }, audio: false });
		const track = stream.getVideoTracks()[0];
		for (const extra of stream.getTracks()) if (extra !== track) extra.stop();
		if (track == null) throw new DOMException('No video track', 'NotFoundError');
		if (this.isClosed() || this.localVideos.get('camera') !== video) { track.stop(); return; }
		try {
			await this.enqueue(async () => {
				if (this.isClosed() || this.localVideos.get('camera') !== video) { track.stop(); return; }
				await video.transceiver?.sender.replaceTrack(track);
				video.track.stop();
				video.track = track;
				track.contentHint = 'motion';
				this.videoCallbacks?.localTrack('camera', track);
				track.addEventListener('ended', () => {
					if (video.track === track) void this.stopVideo('camera').catch(error => this.videoCallbacks?.error(error));
				}, { once: true });
			});
		} catch (error) { track.stop(); throw error; }
	}

	public async stopVideo(source: CallsVideoSource): Promise<void> {
		const video = this.localVideos.get(source);
		if (video == null) return;
		video.track.stop();
		this.localVideos.delete(source);
		this.videoCallbacks?.localTrack(source, null);
		await this.enqueue(async () => {
			await video.transceiver?.sender.replaceTrack(null);
			if (video.publicationId == null || this.isClosed()) return;
			await this.ensureCredential();
			await misskeyApi('calls/media/tracks/close', {
				roomId: this.roomId, participantId: this.participantId!, connectionId: this.connectionId,
				generation: this.generation, operationId: crypto.randomUUID(), mediaCredential: this.mediaCredential!, publicationId: video.publicationId,
			});
			this.publications.delete(video.publicationId);
		});
	}

	public setRole(role: 'host' | 'speaker'): void {
		this.role = role;
		// Refresh the listener credential before publishing with the new role.
		this.credentialExpiresAt = 0;
	}

	public setMuted(muted: boolean): void {
		this.muted = muted;
		if (this.localTrack != null) this.localTrack.enabled = !muted;
		if (this.microphone != null) this.microphone.track.enabled = !muted;
	}

	public setNoiseSuppression(enabled: boolean): void {
		if (this.noiseSuppression === enabled) return;
		if (enabled && this.microphone != null && this.microphone.processing == null) throw new Error('RNNoise is unavailable');
		this.microphone?.processing?.setEnabled(enabled);
		this.noiseSuppression = enabled;
	}

	public async switchMicrophone(deviceId?: string): Promise<void> {
		if (!this.canUseMicrophone) return;
		const oldTrack = this.localTrack;
		const oldMicrophone = this.microphone;
		const microphone = await this.acquireMicrophone(deviceId);
		if (this.isClosed()) { microphone.processing?.close(); microphone.track.stop(); return; }
		this.useMicrophone(microphone);
		try {
			if (oldTrack == null && this.peer != null) {
				await this.enqueue(async () => {
					const peer = this.peer;
					if (peer == null || this.isClosed()) return;
					const transceiver = peer.getTransceivers()[0];
					transceiver.direction = 'sendrecv';
					await transceiver.sender.replaceTrack(this.localTrack);
					await this.publishMicrophone(peer, transceiver);
					this.setState('connected');
				});
			} else {
				const sender = this.peer?.getSenders().find(item => item.track?.kind === 'audio');
				await sender?.replaceTrack(this.localTrack);
			}
		} catch (error) {
			microphone.processing?.close();
			microphone.track.stop();
			this.microphone = oldMicrophone;
			this.localTrack = oldTrack;
			oldMicrophone?.processing?.setEnabled(this.noiseSuppression);
			this.setMuted(this.muted);
			this.videoCallbacks?.microphoneTrack?.(oldTrack);
			throw error;
		}
		oldMicrophone?.processing?.close();
		oldMicrophone?.track.stop();
	}

	private async recoverFromDeviceLoss(): Promise<void> {
		if (this.role === 'listener' || !this.canUseMicrophone || this.state === 'leaving' || this.state === 'closed') return;
		try {
			await this.switchMicrophone();
			this.scheduleReconnect('failed');
		} catch (error) {
			this.fail(error instanceof DOMException ? normalizeCallsMediaError(error) : 'hardware-failure');
		}
	}

	public async close(): Promise<void> {
		this.setState('leaving');
		this.cleanupPeer(true);
		await this.queue;
		await this.ensureCredential().catch(() => undefined);
		for (const publicationId of this.publications) {
			await misskeyApi('calls/media/tracks/close', { roomId: this.roomId, participantId: this.participantId!, connectionId: this.connectionId, generation: this.generation, operationId: crypto.randomUUID(), mediaCredential: this.mediaCredential!, publicationId }).catch(() => undefined);
		}
		this.publications.clear();
		this.subscribedPublications.clear();
		this.setState('closed');
	}

	private isClosed(): boolean { return this.state === 'leaving' || this.state === 'closed'; }

	private scheduleReconnect(reason: Exclude<CallsNormalizedStats['reconnectReason'], null>): Promise<void> {
		if (this.isClosed()) return Promise.resolve();
		if (this.reconnectPromise != null) return this.reconnectPromise;
		this.reconnectReason = reason;
		this.reconnectStartedAt = performance.now();
		this.recoveryTimeMs = null;
		this.setState('reconnecting');
		this.reconnectPromise = this.enqueue(() => this.createConnection()).catch(error => {
			console.error('[Calls] Media reconnection failed', error);
			if (!this.isClosed()) this.fail('negotiation-failed');
		}).finally(() => {
			this.reconnectPromise = null;
		});
		return this.reconnectPromise;
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
		this.subscribedPublications.clear();
		for (const publication of this.remotePublications.values()) this.videoCallbacks?.remoteRemoved(publication.id);
		this.remotePublications.clear();
		this.receivedRemoteTracks.clear();
		if (stopTrack) {
			for (const [source, video] of this.localVideos) {
				video.track.stop();
				this.videoCallbacks?.localTrack(source, null);
			}
			this.localVideos.clear();
		}
		if (stopTrack) {
			this.microphone?.processing?.close();
			this.microphone?.track.stop();
			this.microphone = null;
			this.localTrack = null;
			this.videoCallbacks?.microphoneTrack?.(null);
		}
	}

	private setState(state: CallsMediaState): void { this.state = state; this.failure = null; this.onState?.(state, null); }
	private fail(failure: CallsMediaFailure): void { this.state = 'failed'; this.failure = failure; this.onState?.('failed', failure); }
}
