/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: apiMock }));

import { CallsMediaController } from '@/utility/calls-media.js';

class FakePeerConnection extends EventTarget {
	public static instances: FakePeerConnection[] = [];
	public connectionState = 'connected';
	public iceGatheringState = 'complete';
	public localDescription: RTCSessionDescriptionInit | null = null;
	public transceivers: RTCRtpTransceiver[] = [];
	public signalingState = 'stable';
	public sender = {
		track: null as MediaStreamTrack | null,
		replaceTrack: vi.fn(async (track: MediaStreamTrack | null) => { this.sender.track = track; }),
	};
	constructor() { super(); FakePeerConnection.instances.push(this); }
	public addTransceiver(trackOrKind: MediaStreamTrack | string) {
		const sender = this.transceivers.length === 0 ? this.sender : {
			track: typeof trackOrKind === 'string' ? null : trackOrKind,
			replaceTrack: vi.fn(async (track: MediaStreamTrack | null) => { sender.track = track; }),
		};
		const transceiver = {
			mid: String(this.transceivers.length), sender,
			receiver: { track: { stop: vi.fn() } },
			setCodecPreferences: vi.fn(), stop: vi.fn(),
		} as unknown as RTCRtpTransceiver;
		this.transceivers.push(transceiver);
		return transceiver;
	}
	public getSenders() { return this.transceivers.map(transceiver => transceiver.sender); }
	public getTransceivers() { return this.transceivers; }
	public getConfiguration() { return {}; }
	public close() {}
	public async setRemoteDescription() {}
	public async setLocalDescription(description: RTCSessionDescriptionInit) { this.localDescription = description; this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable'; }
	public async createOffer() { return { type: 'offer' as const, sdp: 'offer' }; }
	public async createAnswer() { return { type: 'answer' as const, sdp: 'answer' }; }
	public getStats() {
		return Promise.resolve(new Map([
			['outbound', { type: 'outbound-rtp', kind: 'audio', packetsSent: 1, bytesSent: 1 }],
			['transport', { type: 'transport', dtlsState: 'connected' }],
		]));
	}
	public setConfiguration() {}
}

function installBrowserMedia(getUserMedia: ReturnType<typeof vi.fn>, getDisplayMedia = vi.fn()) {
	Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
	Object.defineProperty(navigator, 'mediaDevices', {
		configurable: true,
		value: { getUserMedia, getDisplayMedia, enumerateDevices: vi.fn().mockResolvedValue([]), addEventListener: vi.fn(), removeEventListener: vi.fn() },
	});
	vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
	vi.stubGlobal('RTCRtpReceiver', { getCapabilities: vi.fn().mockReturnValue({ codecs: [{ mimeType: 'audio/opus', clockRate: 48_000 }] }) });
	vi.stubGlobal('RTCRtpSender', { getCapabilities: vi.fn().mockReturnValue({ codecs: [
		{ mimeType: 'video/VP8', clockRate: 90_000 },
		{ mimeType: 'video/rtx', clockRate: 90_000 },
		{ mimeType: 'video/H264', clockRate: 90_000 },
	] }) });
}

describe('CallsMediaController', () => {
	beforeEach(() => {
		FakePeerConnection.instances = [];
		apiMock.mockReset();
		apiMock.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'calls/media/turn-credentials') return null;
			if (endpoint === 'calls/media/session/create') return { participantId: 'participant-a', generation: 1, canPublish: false, mediaCredential: 'credential', credentialExpiresAt: new Date(Date.now() + 600_000).toISOString() };
			if (endpoint === 'calls/media/reconcile') return { roomRevision: 1, publications: [] };
			if (endpoint === 'calls/media/tracks/publish') return { publicationId: `publication-${apiMock.mock.calls.length}`, negotiation: { requiresImmediateRenegotiation: false, sessionDescription: null, trackErrors: [] } };
			if (endpoint === 'calls/media/tracks/close') return { requiresImmediateRenegotiation: false, sessionDescription: null, trackErrors: [] };
			throw new Error(`unexpected endpoint: ${endpoint}`);
		});
	});

	function makeTrack(kind: 'audio' | 'video'): MediaStreamTrack {
		return Object.assign(new EventTarget(), { kind, enabled: true, readyState: 'live', stop: vi.fn(), applyConstraints: vi.fn().mockResolvedValue(undefined), contentHint: '', getSettings: () => ({ deviceId: 'microphone-a' }) }) as unknown as MediaStreamTrack;
	}

	function stream(track: MediaStreamTrack): MediaStream {
		return { getAudioTracks: () => track.kind === 'audio' ? [track] : [], getVideoTracks: () => track.kind === 'video' ? [track] : [], getTracks: () => [track] } as MediaStream;
	}

	test('publishes camera and screen separately and browser stop sharing preserves camera and microphone', async () => {
		const audio = makeTrack('audio');
		const camera = makeTrack('video');
		const screen = makeTrack('video');
		const getUserMedia = vi.fn().mockResolvedValueOnce(stream(audio)).mockResolvedValueOnce(stream(camera));
		const getDisplayMedia = vi.fn().mockResolvedValue(stream(screen));
		installBrowserMedia(getUserMedia, getDisplayMedia);
		const localTrack = vi.fn();
		const controller = new CallsMediaController('room-a', 'speaker', undefined, undefined, undefined, undefined, false, { localTrack, remoteRemoved: vi.fn(), error: vi.fn() });
		await controller.connect();
		expect(getUserMedia).toHaveBeenCalledTimes(1);
		expect(getDisplayMedia).not.toHaveBeenCalled();
		await controller.startVideo('camera');
		await controller.startVideo('screen');
		for (const transceiver of FakePeerConnection.instances[0].transceivers.slice(1)) {
			expect(transceiver.setCodecPreferences).toHaveBeenCalledWith([
				{ mimeType: 'video/VP8', clockRate: 90_000 },
				{ mimeType: 'video/rtx', clockRate: 90_000 },
			]);
		}
		expect(apiMock).toHaveBeenCalledWith('calls/media/tracks/publish', expect.objectContaining({ mediaSource: 'camera', mid: '1' }));
		expect(apiMock).toHaveBeenCalledWith('calls/media/tracks/publish', expect.objectContaining({ mediaSource: 'screen', mid: '2' }));
		screen.dispatchEvent(new Event('ended'));
		await vi.waitFor(() => expect(apiMock).toHaveBeenCalledWith('calls/media/tracks/close', expect.anything()));
		expect(localTrack).toHaveBeenCalledWith('screen', null);
		expect(camera.stop).not.toHaveBeenCalled();
		expect(audio.stop).not.toHaveBeenCalled();
		await controller.close();
		expect(camera.stop).toHaveBeenCalled();
		expect(audio.stop).toHaveBeenCalled();
	});

	test.each(['camera', 'screen'] as const)('stops local %s capture when moderation removes its publication', async source => {
		const audio = makeTrack('audio');
		const camera = makeTrack('video');
		const screen = makeTrack('video');
		installBrowserMedia(vi.fn().mockResolvedValueOnce(stream(audio)).mockResolvedValueOnce(stream(camera)), vi.fn().mockResolvedValue(stream(screen)));
		const localTrack = vi.fn();
		const controller = new CallsMediaController('room-a', 'speaker', undefined, undefined, undefined, undefined, false, { localTrack, remoteRemoved: vi.fn(), error: vi.fn() });
		await controller.connect();
		await controller.startVideo('camera');
		await controller.startVideo('screen');
		const publishCalls = apiMock.mock.calls.filter(([endpoint]) => endpoint === 'calls/media/tracks/publish');
		const publications = publishCalls.map(([, input]) => ({ id: `publication-${apiMock.mock.calls.findIndex(call => call[1] === input) + 1}`, participantId: 'participant-a', mediaKind: 'video', mediaSource: input.mediaSource }));
		apiMock.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'calls/media/reconcile') return { roomRevision: 2, publications: publications.filter(publication => publication.mediaSource !== source) };
			return {};
		});
		await controller.reconcile();
		expect((source === 'camera' ? camera : screen).stop).toHaveBeenCalledOnce();
		expect((source === 'camera' ? screen : camera).stop).not.toHaveBeenCalled();
		expect(audio.stop).not.toHaveBeenCalled();
		expect(localTrack).toHaveBeenCalledWith(source, null);
		expect(apiMock).not.toHaveBeenCalledWith('calls/media/tracks/close', expect.anything());
		await controller.close();
	});

	test('toggles noise suppression without reconnecting and retains it when switching microphones', async () => {
		const tracks = Array.from({ length: 4 }, () => makeTrack('audio'));
		const getUserMedia = vi.fn();
		for (const track of tracks) getUserMedia.mockResolvedValueOnce(stream(track));
		installBrowserMedia(getUserMedia);
		const controller = new CallsMediaController('room-a', 'speaker');
		await controller.connect();
		const sessionCalls = apiMock.mock.calls.filter(([endpoint]) => endpoint === 'calls/media/session/create').length;
		await controller.setNoiseSuppression(false);
		expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ audio: expect.objectContaining({ noiseSuppression: { exact: false }, deviceId: { exact: 'microphone-a' } }) }));
		expect(tracks[0].stop).toHaveBeenCalled();
		await controller.switchMicrophone('other-mic');
		expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ audio: expect.objectContaining({ noiseSuppression: { exact: false } }) }));
		await controller.setNoiseSuppression(true);
		expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ audio: expect.objectContaining({ noiseSuppression: { exact: true } }) }));
		expect(apiMock.mock.calls.filter(([endpoint]) => endpoint === 'calls/media/session/create')).toHaveLength(sessionCalls);
		await controller.close();
	});

	test.each(['camera', 'screen'] as const)('changes %s quality on the existing track without republishing', async source => {
		const audio = makeTrack('audio');
		const video = makeTrack('video');
		const getUserMedia = vi.fn().mockResolvedValueOnce(stream(audio)).mockResolvedValue(stream(video));
		const getDisplayMedia = vi.fn().mockResolvedValue(stream(video));
		installBrowserMedia(getUserMedia, getDisplayMedia);
		const controller = new CallsMediaController('room-a', 'speaker');
		await controller.connect();
		await controller.startVideo(source, undefined, { height: 1080, frameRate: 60 });
		const capture = source === 'camera' ? getUserMedia : getDisplayMedia;
		expect(capture).toHaveBeenLastCalledWith(expect.objectContaining({ video: expect.objectContaining({
			width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 60, max: 60 },
		}) }));
		const publicationCount = apiMock.mock.calls.filter(([endpoint]) => endpoint === 'calls/media/tracks/publish').length;
		await controller.setVideoQuality(source, { height: 480, frameRate: 15 });
		expect(video.applyConstraints).toHaveBeenCalledWith({ width: { ideal: 854, max: 854 }, height: { ideal: 480, max: 480 }, frameRate: { ideal: 15, max: 15 } });
		await controller.setVideoQuality(source, { height: 2160, frameRate: 144 });
		expect(video.applyConstraints).toHaveBeenLastCalledWith({ width: { ideal: 3840, max: 3840 }, height: { ideal: 2160, max: 2160 }, frameRate: { ideal: 144, max: 144 } });
		await controller.setVideoQuality(source, { height: 'source', frameRate: 144 });
		expect(video.applyConstraints).toHaveBeenLastCalledWith({ frameRate: { ideal: 144, max: 144 } });
		expect(apiMock.mock.calls.filter(([endpoint]) => endpoint === 'calls/media/tracks/publish')).toHaveLength(publicationCount);
		expect(capture).toHaveBeenCalledTimes(source === 'camera' ? 2 : 1);
		expect(video.stop).not.toHaveBeenCalled();
		await controller.close();
	});

	test('publishes the previewed camera stream without capturing a second camera stream', async () => {
		const audio = makeTrack('audio');
		const camera = makeTrack('video');
		const getUserMedia = vi.fn().mockResolvedValue(stream(audio));
		installBrowserMedia(getUserMedia);
		const controller = new CallsMediaController('room-a', 'speaker');
		await controller.connect();
		await controller.startVideo('camera', undefined, { height: 720, frameRate: 30 }, stream(camera));
		expect(getUserMedia).toHaveBeenCalledTimes(1);
		expect(apiMock).toHaveBeenCalledWith('calls/media/tracks/publish', expect.objectContaining({ mediaSource: 'camera' }));
		expect(camera.stop).not.toHaveBeenCalled();
		await controller.close();
	});

	test('switches the active camera without republishing or interrupting microphone audio', async () => {
		const audio = makeTrack('audio');
		const camera = makeTrack('video');
		const replacement = makeTrack('video');
		const localTrack = vi.fn();
		const getUserMedia = vi.fn().mockResolvedValueOnce(stream(audio)).mockResolvedValueOnce(stream(camera)).mockResolvedValueOnce(stream(replacement));
		installBrowserMedia(getUserMedia);
		const controller = new CallsMediaController('room-a', 'speaker', undefined, undefined, undefined, undefined, false, { localTrack, remoteRemoved: vi.fn(), error: vi.fn() });
		await controller.connect();
		await controller.startVideo('camera');
		await controller.switchCamera('camera-b');
		expect(FakePeerConnection.instances[0].transceivers[1].sender.track).toBe(replacement);
		expect(camera.stop).toHaveBeenCalled();
		expect(audio.stop).not.toHaveBeenCalled();
		expect(localTrack).toHaveBeenLastCalledWith('camera', replacement);
		expect(apiMock.mock.calls.filter(([endpoint]) => endpoint === 'calls/media/tracks/publish')).toHaveLength(2);
		expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ video: expect.objectContaining({ deviceId: { exact: 'camera-b' } }), audio: false }));
		await controller.close();
		expect(replacement.stop).toHaveBeenCalled();
	});

	test('stops capture granted after leaving without publishing it', async () => {
		const audio = makeTrack('audio');
		const camera = makeTrack('video');
		let grantCapture!: (value: MediaStream) => void;
		installBrowserMedia(vi.fn().mockResolvedValueOnce(stream(audio)).mockImplementationOnce(() => new Promise(resolve => { grantCapture = resolve; })));
		const controller = new CallsMediaController('room-a', 'speaker');
		await controller.connect();
		const starting = controller.startVideo('camera');
		await controller.close();
		grantCapture(stream(camera));
		await starting;
		expect(camera.stop).toHaveBeenCalled();
		expect(apiMock.mock.calls.filter(([endpoint]) => endpoint === 'calls/media/tracks/publish')).toHaveLength(1);
	});

	test.each(['local description', 'publication'] as const)('video %s failure stops capture and leaves microphone usable', async stage => {
		const audio = makeTrack('audio');
		const camera = makeTrack('video');
		installBrowserMedia(vi.fn().mockResolvedValueOnce(stream(audio)).mockResolvedValueOnce(stream(camera)));
		const controller = new CallsMediaController('room-a', 'speaker');
		await controller.connect();
		const description = stage === 'local description' ? vi.spyOn(FakePeerConnection.prototype, 'setLocalDescription').mockRejectedValueOnce(new Error('video unavailable')) : null;
		if (stage === 'publication') apiMock.mockRejectedValueOnce(new Error('video unavailable'));
		await expect(controller.startVideo('camera')).rejects.toThrow('video unavailable');
		expect(camera.stop).toHaveBeenCalled();
		expect(audio.stop).not.toHaveBeenCalled();
		expect(FakePeerConnection.instances[0]?.signalingState).toBe('stable');
		expect(FakePeerConnection.instances[0].transceivers[1].stop).toHaveBeenCalledOnce();
		description?.mockRestore();
		await controller.close();
	});

	test('routes remote video through the negotiated mid and removes a closed publication', async () => {
		installBrowserMedia(vi.fn());
		const remote = makeTrack('video');
		const publication = { id: 'screen-id', participantId: 'participant-b', mediaKind: 'video', mediaSource: 'screen' };
		let available = true;
		const fallback = apiMock.getMockImplementation()!;
		apiMock.mockImplementation(async (endpoint, input) => {
			if (endpoint === 'calls/media/reconcile') return { roomRevision: 1, publications: available ? [publication] : [] };
			if (endpoint === 'calls/media/tracks/subscribe') return { subscriptions: [{ publicationId: 'screen-id', mid: '7' }], sessionDescription: { type: 'answer', sdp: 'answer' }, requiresImmediateRenegotiation: false, trackErrors: [] };
			return fallback(endpoint, input);
		});
		const description = vi.spyOn(FakePeerConnection.prototype, 'setRemoteDescription').mockImplementation(async function (this: FakePeerConnection) {
			this.dispatchEvent(Object.assign(new Event('track'), { track: remote, transceiver: { mid: '7' } }));
		});
		const onRemoteTrack = vi.fn();
		const remoteRemoved = vi.fn();
		const controller = new CallsMediaController('room-a', 'listener', undefined, onRemoteTrack, undefined, undefined, false, { localTrack: vi.fn(), remoteRemoved, error: vi.fn() });
		await controller.connect();
		expect(onRemoteTrack).toHaveBeenCalledWith(remote, publication);
		available = false;
		await controller.reconcile();
		expect(remoteRemoved).toHaveBeenCalledWith('screen-id');
		await controller.close();
		description.mockRestore();
	});

	test('a host receives a late speaker on the receiver already created while publishing', async () => {
		const microphone = makeTrack('audio');
		const remote = makeTrack('audio');
		installBrowserMedia(vi.fn().mockResolvedValue(stream(microphone)));
		const publication = { id: 'speaker-audio', participantId: 'participant-b', mediaKind: 'audio', mediaSource: 'microphone' };
		let available = false;
		const fallback = apiMock.getMockImplementation()!;
		apiMock.mockImplementation(async (endpoint, input) => {
			if (endpoint === 'calls/media/reconcile') return { roomRevision: 1, publications: available ? [publication] : [] };
			if (endpoint === 'calls/media/tracks/publish') return { publicationId: 'host-audio', negotiation: { requiresImmediateRenegotiation: false, sessionDescription: { type: 'answer', sdp: 'publish-answer' }, trackErrors: [] } };
			if (endpoint === 'calls/media/tracks/subscribe') return { subscriptions: [{ publicationId: publication.id, mid: '0' }], sessionDescription: { type: 'offer', sdp: 'subscribe-offer' }, requiresImmediateRenegotiation: true, trackErrors: [] };
			if (endpoint === 'calls/media/renegotiate') return { requiresImmediateRenegotiation: false, sessionDescription: null, trackErrors: [] };
			return fallback(endpoint, input);
		});
		const description = vi.spyOn(FakePeerConnection.prototype, 'setRemoteDescription').mockImplementation(async function (this: FakePeerConnection, input?: RTCSessionDescriptionInit) {
			if (input?.sdp !== 'publish-answer') return;
			const transceiver = this.transceivers[0];
			Object.assign(transceiver.receiver, { track: remote });
			this.dispatchEvent(Object.assign(new Event('track'), { track: remote, transceiver }));
		});
		const onRemoteTrack = vi.fn();
		const controller = new CallsMediaController('room-a', 'host', undefined, onRemoteTrack);
		await controller.connect();
		expect(onRemoteTrack).not.toHaveBeenCalled();
		available = true;
		await controller.reconcile();
		expect(onRemoteTrack).toHaveBeenCalledWith(remote, publication);
		await controller.reconcile();
		expect(onRemoteTrack).toHaveBeenCalledTimes(1);
		await controller.close();
		description.mockRestore();
	});

	test('listener connects without requesting microphone permission', async () => {
		const getUserMedia = vi.fn();
		installBrowserMedia(getUserMedia);
		const states: string[] = [];
		const controller = new CallsMediaController('room-a', 'listener', state => states.push(state));

		await controller.connect();

		expect(getUserMedia).not.toHaveBeenCalled();
		expect(apiMock).toHaveBeenCalledWith('calls/media/session/create', expect.objectContaining({ roomId: 'room-a' }));
		expect(states).toContain('creating-session');
		expect(controller.state).toBe('connected');
	});

	test('recovery identifies the connection generation it is replacing', async () => {
		installBrowserMedia(vi.fn());
		const controller = new CallsMediaController('room-a', 'listener', undefined, undefined, undefined, { connectionId: 'existing-device', generation: 7 });
		await controller.connect();
		expect(apiMock).toHaveBeenCalledWith('calls/media/session/create', expect.objectContaining({ connectionId: 'existing-device', expectedGeneration: 7, replaceExisting: false }));
		await controller.close();
	});

	test('an unconfirmed handoff does not rotate the existing device TURN credentials', async () => {
		installBrowserMedia(vi.fn());
		apiMock.mockRejectedValue({ code: 'CALLS_CONNECTION_EXISTS' });
		const controller = new CallsMediaController('room-a', 'listener');
		await expect(controller.connect()).rejects.toMatchObject({ code: 'CALLS_CONNECTION_EXISTS' });
		expect(apiMock).not.toHaveBeenCalledWith('calls/media/turn-credentials', expect.anything());
		expect(FakePeerConnection.instances).toHaveLength(0);
	});

	test('does not subscribe to the same remote publication twice', async () => {
		installBrowserMedia(vi.fn());
		apiMock.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'calls/media/turn-credentials') return null;
			if (endpoint === 'calls/media/session/create') return { participantId: 'participant-a', generation: 1, canPublish: false, mediaCredential: 'credential', credentialExpiresAt: new Date(Date.now() + 600_000).toISOString() };
			if (endpoint === 'calls/media/reconcile') return { roomRevision: 1, publications: [{ id: 'publication-b', participantId: 'participant-b' }] };
			if (endpoint === 'calls/media/tracks/subscribe') return { subscriptions: [{ publicationId: 'publication-b', mid: '1' }], requiresImmediateRenegotiation: false, sessionDescription: null, trackErrors: [] };
			throw new Error(`unexpected endpoint: ${endpoint}`);
		});
		const controller = new CallsMediaController('room-a', 'listener');

		await controller.connect();
		await controller.reconcile();

		expect(apiMock.mock.calls.filter(([endpoint]) => endpoint === 'calls/media/tracks/subscribe')).toHaveLength(1);
	});

	test('subscribes to more than 64 remote publications in sequential API batches', async () => {
		installBrowserMedia(vi.fn());
		const publications = Array.from({ length: 65 }, (_, index) => ({ id: `publication-${index}`, participantId: `speaker-${index}`, mediaKind: 'audio', mediaSource: 'microphone' }));
		const fallback = apiMock.getMockImplementation()!;
		const operations: string[] = [];
		apiMock.mockImplementation(async (endpoint, input) => {
			if (endpoint === 'calls/media/reconcile') return { roomRevision: 1, publications };
			if (endpoint === 'calls/media/tracks/subscribe') {
				expect(input.publicationIds.length).toBeLessThanOrEqual(64);
				operations.push('subscribe');
				return { subscriptions: input.publicationIds.map((id: string) => ({ publicationId: id, mid: id })), sessionDescription: { type: 'offer', sdp: 'subscribe-offer' }, requiresImmediateRenegotiation: true, trackErrors: [] };
			}
			if (endpoint === 'calls/media/renegotiate') {
				operations.push('renegotiate');
				return { sessionDescription: null, requiresImmediateRenegotiation: false, trackErrors: [] };
			}
			return fallback(endpoint, input);
		});
		const controller = new CallsMediaController('room-a', 'listener');
		await controller.connect();
		await controller.reconcile();
		const batches = apiMock.mock.calls.filter(([endpoint]) => endpoint === 'calls/media/tracks/subscribe').map(([, input]) => input.publicationIds);
		expect(batches.map(batch => batch.length)).toEqual([64, 1]);
		expect(batches.flat()).toEqual(publications.map(publication => publication.id));
		expect(operations).toEqual(['subscribe', 'renegotiate', 'subscribe', 'renegotiate']);
		await controller.close();
	});

	test('serializes concurrent connection operations and reports state transitions', async () => {
		installBrowserMedia(vi.fn());
		let activeSessionCreates = 0;
		let maxActiveSessionCreates = 0;
		let releaseFirst!: () => void;
		const firstPending = new Promise<void>(resolve => { releaseFirst = resolve; });
		let sessionCreates = 0;
		apiMock.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'calls/media/turn-credentials') return null;
			if (endpoint === 'calls/media/session/create') {
				sessionCreates++;
				activeSessionCreates++;
				maxActiveSessionCreates = Math.max(maxActiveSessionCreates, activeSessionCreates);
				if (sessionCreates === 1) await firstPending;
				activeSessionCreates--;
				return { participantId: 'participant-a', generation: sessionCreates, canPublish: false, mediaCredential: 'credential', credentialExpiresAt: new Date(Date.now() + 600_000).toISOString() };
			}
			if (endpoint === 'calls/media/reconcile') return { roomRevision: 1, publications: [] };
			throw new Error(`unexpected endpoint: ${endpoint}`);
		});
		const states: string[] = [];
		const controller = new CallsMediaController('room-a', 'listener', state => states.push(state));
		const first = controller.connect();
		const second = controller.connect();
		await vi.waitFor(() => expect(sessionCreates).toBe(1));
		releaseFirst();
		await Promise.all([first, second]);

		expect(sessionCreates).toBe(2);
		expect(maxActiveSessionCreates).toBe(1);
		expect(states).toEqual(expect.arrayContaining(['creating-session', 'reconnecting']));
	});

	test.each([
		['host', 'NotFoundError'],
		['speaker', 'NotReadableError'],
		['host', 'NotAllowedError'],
	] as const)('%s joins without a microphone when capture fails with %s, then can enable it', async (role, errorName) => {
		const microphone = makeTrack('audio');
		installBrowserMedia(vi.fn().mockRejectedValueOnce(new DOMException('Microphone unavailable', errorName)).mockResolvedValue(stream(microphone)));
		const controller = new CallsMediaController('room-a', role);

		await expect(controller.connect()).resolves.toBeUndefined();
		expect(controller.state).toBe('connected');
		expect(controller.localTrack).toBeNull();
		expect(apiMock).not.toHaveBeenCalledWith('calls/media/tracks/publish', expect.anything());
		await controller.switchMicrophone();
		expect(controller.localTrack).toBe(microphone);
		expect(apiMock).toHaveBeenCalledWith('calls/media/tracks/publish', expect.objectContaining({ roomId: 'room-a' }));
		await controller.close();
	});

	test('a host joins when the browser provides no capture API', async () => {
		installBrowserMedia(vi.fn());
		Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
		const controller = new CallsMediaController('room-a', 'host');
		await controller.connect();
		expect(controller.state).toBe('connected');
		expect(controller.localTrack).toBeNull();
		expect(apiMock).toHaveBeenCalledWith('calls/media/session/create', expect.objectContaining({ roomId: 'room-a' }));
		await controller.close();
	});

	test('cancels a pending microphone request without creating a provider session', async () => {
		installBrowserMedia(vi.fn(() => new Promise<MediaStream>(() => {})));
		const controller = new CallsMediaController('room-a', 'speaker');
		const connecting = controller.connect();
		await Promise.resolve();
		controller.cancelMicrophoneRequest();

		await expect(connecting).resolves.toBeUndefined();
		expect(controller.state).toBe('idle');
		expect(apiMock).not.toHaveBeenCalledWith('calls/media/session/create', expect.anything());
	});

	test('closing during a session request prevents queued recovery from reconnecting', async () => {
		installBrowserMedia(vi.fn());
		let resolveSession!: (value: unknown) => void;
		apiMock.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'calls/media/turn-credentials') return null;
			if (endpoint === 'calls/media/session/create') return new Promise(resolve => { resolveSession = resolve; });
			throw new Error(`unexpected endpoint: ${endpoint}`);
		});
		const controller = new CallsMediaController('room-a', 'listener');
		const connecting = controller.connect();
		const queued = controller.connect();
		await vi.waitFor(() => expect(resolveSession).toBeTypeOf('function'));
		const closing = controller.close();
		expect(controller.state).toBe('leaving');
		resolveSession({ participantId: 'participant-a', generation: 1 });
		await Promise.all([connecting, queued, closing]);
		expect(controller.state).toBe('closed');
		expect(apiMock.mock.calls.filter(([endpoint]) => endpoint === 'calls/media/session/create')).toHaveLength(1);
	});

	test('switches microphone with replaceTrack and stops the previous device', async () => {
		const oldTrack = { kind: 'audio', enabled: true, stop: vi.fn(), addEventListener: vi.fn() } as unknown as MediaStreamTrack;
		const newTrack = { kind: 'audio', enabled: true, stop: vi.fn(), addEventListener: vi.fn() } as unknown as MediaStreamTrack;
		const stream = (track: MediaStreamTrack) => ({ getAudioTracks: () => [track], getTracks: () => [track] }) as MediaStream;
		const getUserMedia = vi.fn().mockResolvedValueOnce(stream(oldTrack)).mockResolvedValueOnce(stream(newTrack));
		installBrowserMedia(getUserMedia);
		apiMock.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'calls/media/turn-credentials') return null;
			if (endpoint === 'calls/media/session/create') return { participantId: 'participant-a', generation: 1, canPublish: true, mediaCredential: 'credential', credentialExpiresAt: new Date(Date.now() + 600_000).toISOString() };
			if (endpoint === 'calls/media/tracks/publish') return { publicationId: 'publication-a', negotiation: { requiresImmediateRenegotiation: false, sessionDescription: null, trackErrors: [] } };
			if (endpoint === 'calls/media/reconcile') return { roomRevision: 1, publications: [] };
			throw new Error(`unexpected endpoint: ${endpoint}`);
		});
		const controller = new CallsMediaController('room-a', 'speaker');
		controller.setMuted(true);
		await controller.connect();
		expect(oldTrack.enabled).toBe(false);
		await controller.switchMicrophone('new-device');

		expect(FakePeerConnection.instances[0]?.sender.track).toBe(newTrack);
		expect(oldTrack.stop).toHaveBeenCalled();
		expect(newTrack.enabled).toBe(false);
		expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ audio: expect.objectContaining({ deviceId: { exact: 'new-device' } }) }));
	});

	test('stops acquired media when provider session creation fails', async () => {
		const track = { kind: 'audio', enabled: true, stop: vi.fn(), addEventListener: vi.fn() } as unknown as MediaStreamTrack;
		installBrowserMedia(vi.fn().mockResolvedValue({ getAudioTracks: () => [track], getTracks: () => [track] }));
		apiMock.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'calls/media/turn-credentials') return null;
			if (endpoint === 'calls/media/session/create') throw new Error('provider unavailable');
			throw new Error(`unexpected endpoint: ${endpoint}`);
		});
		const controller = new CallsMediaController('room-a', 'speaker');

		await expect(controller.connect()).rejects.toThrow('provider unavailable');
		expect(track.stop).toHaveBeenCalled();
		expect(controller.state).toBe('failed');
		expect(controller.failure).toBe('negotiation-failed');
	});
});
