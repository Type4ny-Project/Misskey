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
	public connectionState = 'new';
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
	public getStats() { return Promise.resolve(new Map()); }
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
		await controller.connect();
		await controller.switchMicrophone('new-device');

		expect(FakePeerConnection.instances[0]?.sender.track).toBe(newTrack);
		expect(oldTrack.stop).toHaveBeenCalled();
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
