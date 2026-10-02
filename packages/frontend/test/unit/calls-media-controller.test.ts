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
	public sender = {
		track: null as MediaStreamTrack | null,
		replaceTrack: vi.fn(async (track: MediaStreamTrack | null) => { this.sender.track = track; }),
	};
	constructor() { super(); FakePeerConnection.instances.push(this); }
	public addTransceiver() {
		return {
			mid: '0',
			sender: this.sender,
			setCodecPreferences: vi.fn(),
		};
	}
	public getSenders() { return [this.sender]; }
	public getConfiguration() { return {}; }
	public close() {}
	public async setRemoteDescription() {}
	public async setLocalDescription(description: RTCSessionDescriptionInit) { this.localDescription = description; }
	public async createOffer() { return { type: 'offer' as const, sdp: 'offer' }; }
	public getStats() {
		return Promise.resolve(new Map([
			['outbound', { type: 'outbound-rtp', kind: 'audio', packetsSent: 1, bytesSent: 1 }],
			['transport', { type: 'transport', dtlsState: 'connected' }],
		]));
	}
	public setConfiguration() {}
}

function installBrowserMedia(getUserMedia: ReturnType<typeof vi.fn>) {
	Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
	Object.defineProperty(navigator, 'mediaDevices', {
		configurable: true,
		value: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([]), addEventListener: vi.fn(), removeEventListener: vi.fn() },
	});
	vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
	vi.stubGlobal('RTCRtpReceiver', { getCapabilities: vi.fn().mockReturnValue({ codecs: [{ mimeType: 'audio/opus', clockRate: 48_000 }] }) });
}

describe('CallsMediaController', () => {
	beforeEach(() => {
		FakePeerConnection.instances = [];
		apiMock.mockReset();
		apiMock.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'calls/media/turn-credentials') return null;
			if (endpoint === 'calls/media/session/create') return { participantId: 'participant-a', generation: 1, canPublish: false, mediaCredential: 'credential', credentialExpiresAt: new Date(Date.now() + 600_000).toISOString() };
			if (endpoint === 'calls/media/reconcile') return { roomRevision: 1, publications: [] };
			throw new Error(`unexpected endpoint: ${endpoint}`);
		});
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
			if (endpoint === 'calls/media/tracks/subscribe') return { requiresImmediateRenegotiation: false, sessionDescription: null, trackErrors: [] };
			throw new Error(`unexpected endpoint: ${endpoint}`);
		});
		const controller = new CallsMediaController('room-a', 'listener');

		await controller.connect();
		await controller.reconcile();

		expect(apiMock.mock.calls.filter(([endpoint]) => endpoint === 'calls/media/tracks/subscribe')).toHaveLength(1);
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

	test('normalizes a denied microphone request and remains retryable', async () => {
		installBrowserMedia(vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')));
		const reports: Array<[string, string | null]> = [];
		const controller = new CallsMediaController('room-a', 'speaker', (state, failure) => reports.push([state, failure]));

		await expect(controller.connect()).rejects.toMatchObject({ name: 'NotAllowedError' });
		expect(reports.at(-1)).toEqual(['failed', 'permission-denied']);
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
		await controller.close();
		resolveSession({ participantId: 'participant-a', generation: 1 });
		await Promise.all([connecting, queued]);
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
