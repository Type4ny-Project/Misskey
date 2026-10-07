/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getCallsConnectionInfo } from './calls-connection-info.js';
import { detectCallsMediaCapabilities, normalizeCallsMediaError, normalizeCallsStats, preferOpus } from './calls-media-core.js';
import { createCallsNoiseSuppression } from './calls-noise-suppression.js';
import type { CallsConnectionInfo } from './calls-connection-info.js';
import type { CallsNormalizedStats } from './calls-media-core.js';
import type { CallsNoiseSuppression, CallsNoiseSuppressionMode } from './calls-noise-suppression.js';
import { misskeyApi } from '@/utility/misskey-api.js';

export type CallsVideoSource = 'camera' | 'screen';
export type CallsVideoQuality = { height: 480 | 720 | 1080 | 1440 | 2160 | 'source'; frameRate: 15 | 30 | 60 | 90 | 120 | 144 };
export type CallsRemotePublication = { id: string; participantId: string; mediaKind: 'audio' | 'video'; mediaSource: 'microphone' | CallsVideoSource; screenPublicationId?: string };
type CallsLocalTrack = { track: MediaStreamTrack; publicationId?: string; transceiver?: RTCRtpTransceiver };
type CallsLocalVideo = CallsLocalTrack & { source: CallsVideoSource; audio?: CallsLocalTrack };
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
	private localVideos = new Map<string, CallsLocalVideo>();
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
	private noiseSuppression: CallsNoiseSuppressionMode = 'rnnoise';
	private inputSensitivity = -100;
	private inputVolume = 100;
	private autoGainControl = true;
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
			ready?: () => void;
			localTrack: (source: CallsVideoSource, track: MediaStreamTrack | null, id: string) => void;
			microphoneTrack?: (track: MediaStreamTrack | null) => void;
			noiseSuppressionChanged?: (mode: CallsNoiseSuppressionMode) => void;
			inputLevel?: (level: number, transmitting: boolean) => void;
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

	public async getConnectionInfo(): Promise<CallsConnectionInfo | null> {
		const peer = this.peer;
		if (peer == null) return null;
		const report = await peer.getStats();
		if (peer !== this.peer) return null;
		return getCallsConnectionInfo(report, peer.connectionState, peer.getConfiguration().iceServers ?? []);
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
				// Apply browser suppression only in WebRTC mode; echo cancellation stays enabled.
				noiseSuppression: this.noiseSuppression === 'webrtc', autoGainControl: this.autoGainControl,
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
				this.noiseSuppression = 'none';
				this.videoCallbacks?.noiseSuppressionChanged?.('none');
			}, abort.signal, { rnnoise: this.noiseSuppression === 'rnnoise', inputSensitivity: this.inputSensitivity, inputVolume: this.inputVolume, onLevel: (level, transmitting) => { if (this.microphone?.track === track) this.videoCallbacks?.inputLevel?.(level, transmitting && !this.muted); } });
			abort.signal.throwIfAborted();
			await track.applyConstraints({ noiseSuppression: this.noiseSuppression === 'webrtc', autoGainControl: this.autoGainControl });
			await processing.setEnabled(this.noiseSuppression === 'rnnoise');
			processing.setInputSensitivity(this.inputSensitivity);
			processing.setInputVolume(this.inputVolume);
		} catch (error) {
			processing?.close();
			processing = null;
			if (abort.signal.aborted) throw new DOMException('Microphone acquisition cancelled', 'AbortError');
			if (this.inputSensitivity > -100 || this.inputVolume !== 100) { track.stop(); throw error; }
			console.warn('[Calls] Noise suppression unavailable; using unprocessed microphone', error);
			this.noiseSuppression = 'none';
			this.videoCallbacks?.noiseSuppressionChanged?.('none');
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
			await this.ensureCredential();
			this.setState('negotiating');
			const offer = await peer.createOffer();
			await peer.setLocalDescription(offer);
			await this.waitForIceGathering(peer);
			const result = await misskeyApi('calls/media/tracks/publish', {
				roomId: this.roomId, connectionId: this.connectionId, generation: this.generation,
				operationId: crypto.randomUUID(),
				participantId: this.participantId!, mediaCredential: this.mediaCredential!,
				mid: sendTransceiver.mid ?? '0', sessionDescription: { type: 'offer', sdp: peer.localDescription?.sdp ?? offer.sdp ?? '' },
			});
			this.publications.add(result.publicationId);
			await this.applyNegotiation(result.negotiation);
		}
		for (const video of this.localVideos.values()) {
			if (video.track.readyState === 'ended') continue;
			video.publicationId = undefined;
			await this.publishTrack(video.source, video);
			if (video.audio != null && video.audio.track.readyState !== 'ended') {
				video.audio.publicationId = undefined;
				await this.publishTrack('screen', video.audio, video.publicationId);
			}
		}
		const subscribed = await this.reconcileNow();
		// SDP exchanges stay serialized, but receiving need not wait for the sender's transport.
		if (this.localTrack != null || subscribed) {
			await this.waitUntilConnected(peer);
			this.setState('connected');
		}
		if (this.localTrack == null && !subscribed && this.peer === peer) this.setState('connected');
		if (this.peer === peer) this.videoCallbacks?.ready?.();
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
		for (const [id, video] of this.localVideos) {
			if (video.audio?.publicationId != null && !authoritativeOwnIds.has(video.audio.publicationId)) {
				video.audio.track.stop();
				await video.audio.transceiver?.sender.replaceTrack(null);
				this.publications.delete(video.audio.publicationId);
				video.audio = undefined;
			}
			if (video.publicationId == null || authoritativeOwnIds.has(video.publicationId)) continue;
			video.track.stop();
			video.audio?.track.stop();
			this.localVideos.delete(id);
			this.publications.delete(video.publicationId);
			this.videoCallbacks?.localTrack(video.source, null, id);
			await video.transceiver?.sender.replaceTrack(null);
			if (video.audio != null) {
				await video.audio.transceiver?.sender.replaceTrack(null);
				if (video.audio.publicationId != null) this.publications.delete(video.audio.publicationId);
			}
		}
		const authoritativeRemoteIds = new Set(authoritative.publications.filter(publication => publication.participantId !== this.participantId).map(publication => publication.id));
		for (const publicationId of this.subscribedPublications) {
			if (!authoritativeRemoteIds.has(publicationId)) {
				this.subscribedPublications.delete(publicationId);
				this.receivedRemoteTracks.delete(publicationId);
				for (const [mid, publication] of this.remotePublications) {
					if (publication.id !== publicationId) continue;
					// The SFU can reuse this receiver for the next publication; stop() is permanent.
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

	private async waitUntilConnected(peer: RTCPeerConnection): Promise<void> {
		const deadline = Date.now() + 10_000;
		while (Date.now() < deadline) {
			if (peer !== this.peer) throw new DOMException('Calls media operation was replaced', 'AbortError');
			if (peer.connectionState === 'failed') throw new Error('Calls media connection failed');
			if (peer.connectionState === 'connected') return;
			await new Promise(resolve => window.setTimeout(resolve, 250));
		}
		throw new Error('Calls media connection timed out');
	}

	public async startVideo(source: CallsVideoSource, deviceId?: string, quality: CallsVideoQuality = { height: 720, frameRate: 30 }, previewStream?: MediaStream): Promise<void> {
		if (this.role === 'listener' || this.isClosed() || this.peer == null || (source === 'camera' && this.localVideos.has('camera'))) {
			previewStream?.getTracks().forEach(track => track.stop());
			return;
		}
		// Call directly from the click handler so screen capture retains user activation.
		const stream = source === 'camera'
			? previewStream ?? await captureCallsCamera(deviceId, quality)
			: await navigator.mediaDevices.getDisplayMedia({ video: videoConstraints(quality), audio: true });
		const track = stream.getVideoTracks()[0];
		const audio = source === 'screen' ? stream.getAudioTracks()[0] : undefined;
		for (const extra of stream.getTracks()) if (extra !== track && extra !== audio) extra.stop();
		if (this.isClosed() || this.peer == null) { track?.stop(); audio?.stop(); return; }
		if (track == null) { audio?.stop(); throw new DOMException('No video track', 'NotFoundError'); }
		track.contentHint = source === 'screen' ? 'detail' : 'motion';
		const id = source === 'camera' ? 'camera' : crypto.randomUUID();
		const video: CallsLocalVideo = { source, track, audio: audio == null ? undefined : { track: audio } };
		this.localVideos.set(id, video);
		audio?.addEventListener('ended', () => {
			const media = video.audio;
			if (this.localVideos.get(id) !== video || media == null || media.track !== audio) return;
			video.audio = undefined;
			media.track.stop();
			void this.enqueue(() => this.closePublishedTrack(media)).catch(error => this.videoCallbacks?.error(error));
		}, { once: true });
		this.videoCallbacks?.localTrack(source, track, id);
		track.addEventListener('ended', () => {
			if (this.localVideos.get(id)?.track === track) void this.stopVideo(source, id).catch(error => this.videoCallbacks?.error(error));
		}, { once: true });
		try {
			await this.enqueue(async () => {
				await this.publishTrack(source, video);
				if (video.audio != null && this.localVideos.get(id) === video) await this.publishTrack('screen', video.audio, video.publicationId);
			});
		} catch (error) {
			await this.stopVideo(source, id).catch(() => undefined);
			throw error;
		}
	}

	private async publishTrack(source: CallsVideoSource, video: CallsLocalTrack, screenPublicationId?: string): Promise<void> {
		const peer = this.peer;
		if (peer == null || this.isClosed() || video.track.readyState === 'ended') return;
		await this.ensureCredential();
		const transceiver = peer.addTransceiver(video.track, { direction: 'sendonly' });
		video.transceiver = transceiver;
		try {
			// Keep screen/camera encoding consistent across browser and SFU renegotiations.
			const codecs = RTCRtpSender.getCapabilities(video.track.kind)?.codecs.filter(codec => (video.track.kind === 'audio' ? ['audio/opus'] : ['video/vp8', 'video/rtx']).includes(codec.mimeType.toLowerCase()));
			if (codecs?.some(codec => codec.mimeType.toLowerCase() === (video.track.kind === 'audio' ? 'audio/opus' : 'video/vp8')) && typeof transceiver.setCodecPreferences === 'function') transceiver.setCodecPreferences(codecs);
			const offer = await peer.createOffer();
			await peer.setLocalDescription(offer);
			await this.waitForIceGathering(peer);
			if (this.peer !== peer || this.isClosed()) return;
			const result = await misskeyApi('calls/media/tracks/publish', {
				roomId: this.roomId, participantId: this.participantId!, connectionId: this.connectionId,
				generation: this.generation, operationId: crypto.randomUUID(), mediaCredential: this.mediaCredential!,
				mediaSource: source, screenPublicationId, mid: transceiver.mid!, sessionDescription: { type: 'offer', sdp: peer.localDescription?.sdp ?? offer.sdp ?? '' },
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
		if (this.isClosed()) return;
		await this.enqueue(async () => {
			if (this.isClosed()) return;
			for (const video of this.localVideos.values()) {
				if (video.source === source) await video.track.applyConstraints(videoConstraints(quality));
			}
		});
	}

	public async switchCamera(deviceId: string | undefined, quality: CallsVideoQuality = { height: 720, frameRate: 30 }): Promise<void> {
		const video = this.localVideos.get('camera');
		if (video == null) return;
		const stream = await navigator.mediaDevices.getUserMedia({ video: { ...videoConstraints(quality), deviceId: deviceId == null ? undefined : { exact: deviceId } }, audio: false });
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
				this.videoCallbacks?.localTrack('camera', track, 'camera');
				track.addEventListener('ended', () => {
					if (video.track === track) void this.stopVideo('camera').catch(error => this.videoCallbacks?.error(error));
				}, { once: true });
			});
		} catch (error) { track.stop(); throw error; }
	}

	public async stopVideo(source: CallsVideoSource, videoId?: string): Promise<void> {
		const videos = [...this.localVideos].filter(([id, video]) => video.source === source && (videoId == null || id === videoId));
		for (const [id, video] of videos) {
			video.track.stop();
			video.audio?.track.stop();
			this.localVideos.delete(id);
			this.videoCallbacks?.localTrack(source, null, id);
		}
		await this.enqueue(async () => {
			for (const [, video] of videos) {
				for (const media of [video.audio, video]) {
					if (media == null) continue;
					await this.closePublishedTrack(media);
				}
			}
		});
	}

	private async closePublishedTrack(media: CallsLocalTrack): Promise<void> {
		await media.transceiver?.sender.replaceTrack(null);
		if (media.publicationId == null || this.isClosed()) return;
		await this.ensureCredential();
		await misskeyApi('calls/media/tracks/close', {
			roomId: this.roomId, participantId: this.participantId!, connectionId: this.connectionId,
			generation: this.generation, operationId: crypto.randomUUID(), mediaCredential: this.mediaCredential!, publicationId: media.publicationId,
		});
		this.publications.delete(media.publicationId);
	}

	public setMuted(muted: boolean): void {
		this.muted = muted;
		if (this.localTrack != null) this.localTrack.enabled = !muted;
		if (this.microphone != null) this.microphone.track.enabled = !muted;
		this.microphone?.processing?.setMuted(muted);
		if (muted) this.stopStats();
		else if (this.peer?.connectionState === 'connected') this.startStats();
	}

	public async setNoiseSuppression(mode: CallsNoiseSuppressionMode): Promise<void> {
		if (this.microphone == null) { this.noiseSuppression = mode; return; }
		await this.enqueue(async () => {
			if (this.noiseSuppression === mode || this.microphone == null) return;
			if (mode === 'rnnoise' && this.microphone.processing == null) throw new Error('RNNoise is unavailable');
			const previous = this.noiseSuppression;
			await this.microphone.track.applyConstraints({ noiseSuppression: mode === 'webrtc', autoGainControl: this.autoGainControl });
			try {
				await this.microphone.processing?.setEnabled(mode === 'rnnoise');
				this.noiseSuppression = mode;
			} catch (error) {
				await this.microphone.track.applyConstraints({ noiseSuppression: previous === 'webrtc', autoGainControl: this.autoGainControl });
				throw error;
			}
		});
	}

	public async setAutoGainControl(enabled: boolean): Promise<void> {
		if (this.microphone == null) { this.autoGainControl = enabled; return; }
		await this.enqueue(async () => {
			await this.microphone?.track.applyConstraints({ autoGainControl: enabled, noiseSuppression: this.noiseSuppression === 'webrtc' });
			this.autoGainControl = enabled;
		});
	}

	public setInputVolume(volume: number): void {
		if (volume !== 100 && this.microphone != null && this.microphone.processing == null) throw new Error('Audio processing is unavailable');
		this.inputVolume = volume;
		this.microphone?.processing?.setInputVolume(volume);
	}

	public setInputSensitivity(threshold: number): void {
		if (threshold > -100 && this.microphone != null && this.microphone.processing == null) throw new Error('Audio processing is unavailable');
		this.inputSensitivity = threshold;
		this.microphone?.processing?.setInputSensitivity(threshold);
	}

	public async switchMicrophone(deviceId?: string): Promise<void> {
		if (!this.canUseMicrophone) return;
		const oldTrack = this.localTrack;
		const oldMicrophone = this.microphone;
		const microphone = await this.acquireMicrophone(deviceId);
		if (this.isClosed()) { microphone.processing?.close(); microphone.track.stop(); return; }
		this.useMicrophone(microphone);
		if (oldTrack == null && this.peer != null) {
			await this.enqueue(() => this.createConnection());
			return;
		}
		const sender = this.peer?.getSenders().find(item => item.track?.kind === 'audio');
		try {
			await sender?.replaceTrack(this.localTrack);
		} catch (error) {
			microphone.processing?.close();
			microphone.track.stop();
			this.microphone = oldMicrophone;
			this.localTrack = oldTrack;
			await oldMicrophone?.processing?.setEnabled(this.noiseSuppression === 'rnnoise');
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
		// Only the local microphone needs speaking detection; listening needs no polling.
		if (this.statsTimer != null || this.muted || this.localTrack == null || this.onStats == null) return;
		this.lastStatsBytes = 0;
		this.lastStatsAt = performance.now();
		this.statsTimer = window.setInterval(() => void this.sampleStats(), 500);
	}

	private stopStats(): void {
		if (this.statsTimer != null) window.clearInterval(this.statsTimer);
		this.statsTimer = null;
		this.speaking = false;
	}

	private async sampleStats(): Promise<void> {
		if (this.peer == null || this.muted || this.localTrack == null) return;
		const now = performance.now();
		const report = await this.peer.getStats();
		if (this.muted || this.isClosed()) return;
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
		this.stopStats();
		this.reconnectTimer = null;
		this.turnRefreshTimer = null;
		this.cancelMicrophoneRequest();
		this.peer?.close();
		this.peer = null;
		this.subscribedPublications.clear();
		for (const publication of this.remotePublications.values()) this.videoCallbacks?.remoteRemoved(publication.id);
		this.remotePublications.clear();
		this.receivedRemoteTracks.clear();
		if (stopTrack) {
			for (const [id, video] of this.localVideos) {
				video.track.stop();
				video.audio?.track.stop();
				this.videoCallbacks?.localTrack(video.source, null, id);
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
