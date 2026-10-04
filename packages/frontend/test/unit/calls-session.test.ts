/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import type { CallsRemotePublication } from '@/utility/calls-media.js';

const fixture = vi.hoisted(() => ({
	policies: { canJoinCalls: true, canSpeakInCalls: true, canPublishCallsVideo: true, canShareCallsScreen: true },
	api: vi.fn(),
	toast: vi.fn(),
	alert: vi.fn(),
	confirm: vi.fn(),
	popupMenu: vi.fn(),
	popup: vi.fn(),
	captureCamera: vi.fn(),
	keepalive: vi.fn(),
	connectionExists: false,
	participantMuted: true,
	microphoneAvailable: true,
	setMuted: vi.fn(),
	heartbeat: vi.fn(),
	role: 'listener' as 'listener' | 'host',
	revoked: [] as Array<(event: { reason: string; connectionId?: string; generation?: number }) => void>,
	connections: [] as Array<{ room: { value: { id: string; title: string; state: string; revision: number } }; endReason: { value: 'host-timeout' | null }; participants: { value: Array<{ id: string; userId: string; role: string; isMuted: boolean; joinedAt?: string }> } }>,
	remoteTrackCallbacks: [] as Array<(track: MediaStreamTrack, publication: CallsRemotePublication) => void>,
	controllers: [] as Array<{ connectionIdentity: { connectionId: string; generation: number }; replaceExisting: boolean; localTrack: { enabled: boolean } | null; setMuted: ReturnType<typeof vi.fn>; switchMicrophone: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; startVideo: ReturnType<typeof vi.fn>; setVideoQuality: ReturnType<typeof vi.fn>; setNoiseSuppression: ReturnType<typeof vi.fn> }>,
}));

vi.mock('@/i.js', () => ({ $i: { id: 'user-a', policies: fixture.policies } }));
vi.mock('@/i18n.js', () => ({ i18n: {
	ts: { somethingHappened: 'Something went wrong', _calls: { videoFailed: 'Video failed', videoResolution: 'Resolution', videoSourceQuality: 'Source quality', videoFrameRate: 'Frame rate', connectedOnAnotherDevice: 'Connected on another device', switchDeviceConfirm: 'Disconnect the other device?', hostLeftRoomEnded: 'Host left; room ended' } },
	tsx: { _calls: { videoResolutionValue: ({ height }: { height: number }) => `${height}p`, videoFrameRateValue: ({ fps }: { fps: number }) => `${fps}fps` } },
} }));
vi.mock('@/os.js', () => ({ toast: fixture.toast, alert: fixture.alert, confirm: fixture.confirm, popupMenu: fixture.popupMenu, popup: fixture.popup }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItemAsJson: () => null, removeItem: vi.fn() } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api, misskeyApiKeepalive: fixture.keepalive }));
vi.mock('@/utility/calls-media-core.js', () => ({ detectCallsMediaCapabilities: () => ({ secureContext: true, peerConnection: true, transceiver: true }) }));
vi.mock('@/composables/use-calls-room.js', async () => {
	const { ref } = await import('vue');
	return {
		createCallsRoomConnection: (roomId: string) => {
			const connection = {
				room: ref({ id: roomId, title: 'Room', state: 'open', revision: 1 }),
				endReason: ref<'host-timeout' | null>(null),
				participants: ref([{ id: 'participant-a', userId: 'user-a', role: fixture.role, isMuted: fixture.participantMuted, joinedAt: new Date().toISOString() }]),
				speakingParticipantIds: ref(new Set()),
				connected: ref(true),
				refresh: vi.fn(), dispose: vi.fn(), setMuted: fixture.setMuted, setSpeaking: vi.fn(), heartbeat: fixture.heartbeat,
				onTrackChange: () => vi.fn(),
				onRevoked: (callback: typeof fixture.revoked[number]) => { fixture.revoked.push(callback); return vi.fn(); },
			};
			fixture.connections.push(connection);
			return connection;
		},
	};
});
vi.mock('@/components/MkCallsScreenWindow.vue', () => ({ default: {} }));
vi.mock('@/components/MkCallsCameraPreviewDialog.vue', () => ({ default: {} }));
vi.mock('@/utility/calls-media.js', () => ({
	captureCallsCamera: fixture.captureCamera,
	CallsMediaController: class {
		public connectionIdentity: { connectionId: string; generation: number };
		public localTrack = fixture.microphoneAvailable ? { enabled: true } : null;
		public switchMicrophone = vi.fn(async () => { this.localTrack = { enabled: false }; });
		public startVideo = vi.fn().mockResolvedValue(undefined);
		public close = vi.fn().mockResolvedValue(undefined);
		public setVideoQuality = vi.fn().mockResolvedValue(undefined);
		public setNoiseSuppression = vi.fn();
		public reconcile = vi.fn().mockResolvedValue(undefined);
		public connect = vi.fn(async () => {
			if (fixture.connectionExists && !this.replaceExisting) throw Object.assign(new Error('Connection exists'), { code: 'CALLS_CONNECTION_EXISTS' });
			this.onState('connected');
		});
		public setMuted = vi.fn();
		constructor(_roomId: string, _role: string, private onState: (state: string) => void, onRemoteTrack: typeof fixture.remoteTrackCallbacks[number], _onStats: unknown, previousConnection?: { connectionId: string; generation: number }, public replaceExisting = false) {
			this.connectionIdentity = previousConnection ?? { connectionId: `device-${fixture.controllers.length}`, generation: 1 };
			fixture.controllers.push(this);
			fixture.remoteTrackCallbacks.push(onRemoteTrack);
		}
	},
}));

let session: ReturnType<typeof import('@/utility/calls-session.js')['useCallsSession']>;

describe('Calls session device handoff', () => {
	beforeEach(async () => {
		vi.resetModules();
		vi.useFakeTimers();
		fixture.api.mockReset().mockResolvedValue({});
		fixture.toast.mockClear();
		fixture.alert.mockClear();
		fixture.popupMenu.mockClear();
		fixture.popup.mockReset().mockReturnValue({ dispose: vi.fn() });
		fixture.captureCamera.mockReset();
		fixture.keepalive.mockClear();
		fixture.confirm.mockReset().mockResolvedValue({ canceled: true });
		fixture.connectionExists = false;
		fixture.participantMuted = true;
		fixture.microphoneAvailable = true;
		fixture.setMuted.mockClear();
		fixture.heartbeat.mockClear();
		fixture.role = 'listener';
		Object.assign(fixture.policies, { canJoinCalls: true, canSpeakInCalls: true, canPublishCallsVideo: true, canShareCallsScreen: true });
		fixture.revoked.length = 0;
		fixture.controllers.length = 0;
		fixture.connections.length = 0;
		fixture.remoteTrackCallbacks.length = 0;
		Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: async () => [] } });
		session = (await import('@/utility/calls-session.js')).useCallsSession();
	});

	test.each(['camera', 'screen'] as const)('a denied %s permission prevents capture and publication', async source => {
		fixture.role = 'host';
		fixture.policies[source === 'camera' ? 'canPublishCallsVideo' : 'canShareCallsScreen'] = false;
		await session.join('room-a', false);
		await session.toggleVideo(source);
		expect(fixture.captureCamera).not.toHaveBeenCalled();
		expect(fixture.controllers[0].startVideo).not.toHaveBeenCalled();
		expect(session.controls.value[source === 'camera' ? 'canPublishVideo' : 'canShareScreen']).toBe(false);
	});

	test('a host without speaking permission keeps video controls but cannot unmute', async () => {
		fixture.role = 'host';
		fixture.policies.canSpeakInCalls = false;
		await session.join('room-a', false);
		expect(session.controls.value.canSpeak).toBe(false);
		expect(session.controls.value.canPublishVideo).toBe(true);
		await session.toggleMute();
		expect(fixture.setMuted).not.toHaveBeenCalled();
	});

	test('keeps elapsed time from joining through reconnection and resets it after leaving', async () => {
		const startedAt = new Date('2026-10-05T00:00:00Z');
		vi.setSystemTime(startedAt);
		expect(session.elapsedTime.value).toBeNull();
		const idleTimerCount = vi.getTimerCount();
		await session.join('room-a', false);
		expect(session.elapsedTime.value).toBe('00:00');
		await vi.advanceTimersByTimeAsync(59_000);
		expect(session.elapsedTime.value).toBe('00:59');
		await vi.advanceTimersByTimeAsync(1000);
		expect(session.elapsedTime.value).toBe('01:00');

		const connection = fixture.connections[0];
		connection.participants.value = connection.participants.value.map(participant => ({ ...participant, isMuted: false }));
		await nextTick();
		fixture.revoked[0]({ reason: 'stale-generation', ...fixture.controllers[0].connectionIdentity });
		await vi.advanceTimersByTimeAsync(0);
		expect(fixture.controllers).toHaveLength(2);
		expect(session.elapsedTime.value).toBe('01:00');
		// The next tick catches up after a background tab's timers are delayed.
		vi.setSystemTime(startedAt.getTime() + 3_660_000);
		await vi.advanceTimersByTimeAsync(1000);
		expect(session.elapsedTime.value).toBe('01:01:01');

		await session.leave();
		await nextTick();
		expect(session.elapsedTime.value).toBeNull();
		expect(vi.getTimerCount()).toBe(idleTimerCount);
		await session.join('room-b', false);
		expect(session.elapsedTime.value).toBe('00:00');
	});

	test('closes only a removed video window and closes all remaining windows on leaving', async () => {
		const { nextTick } = await import('vue');
		fixture.popup.mockImplementation(() => ({ dispose: vi.fn() }));
		await session.join('room-a', false);
		const first = new MediaStream();
		const second = new MediaStream();
		session.localVideos.value = new Map([['camera', first], ['screen', second]]);
		await nextTick();
		await session.showScreenWindow(first, 'Camera');
		await session.showScreenWindow(second, 'Screen');
		const [firstWindow, secondWindow] = fixture.popup.mock.results.map(result => result.value);
		session.localVideos.value = new Map([['screen', second]]);
		await nextTick();
		expect(session.screenWindows.has(first)).toBe(false);
		expect(session.screenWindows.has(second)).toBe(true);
		expect(firstWindow.dispose).toHaveBeenCalledOnce();
		expect(secondWindow.dispose).not.toHaveBeenCalled();
		await session.leave();
		expect(session.screenWindows.size).toBe(0);
		expect(secondWindow.dispose).toHaveBeenCalledOnce();
	});

	test('does not fetch user profiles on joining or participant updates', async () => {
		await session.join('room-a', false);
		const connection = fixture.connections[0];
		connection.participants.value = connection.participants.value.map(participant => ({ ...participant, isMuted: false }));
		connection.participants.value.push({ id: 'participant-b', userId: 'user-b', role: 'listener', isMuted: true });
		await nextTick();
		expect(fixture.api.mock.calls.filter(([endpoint]) => endpoint === 'users/show')).toHaveLength(0);
	});

	test('applies moderator mute updates to the microphone and still allows self unmute', async () => {
		fixture.role = 'host';
		fixture.participantMuted = false;
		await session.join('room-a', false);
		const controller = fixture.controllers[0];
		const connection = fixture.connections[0];
		connection.participants.value = connection.participants.value.map(participant => ({ ...participant, isMuted: true }));
		await nextTick();
		expect(session.muted.value).toBe(true);
		expect(controller.setMuted).toHaveBeenLastCalledWith(true);
		await session.toggleMute();
		expect(controller.setMuted).toHaveBeenLastCalledWith(false);
		expect(fixture.setMuted).toHaveBeenLastCalledWith(false);
	});

	test('joins with zero capture devices muted and retries capture when unmuting', async () => {
		fixture.role = 'host';
		fixture.participantMuted = false;
		fixture.microphoneAvailable = false;
		await session.join('room-a', false);
		expect(session.isActive.value).toBe(true);
		expect(session.mediaState.value).toBe('connected');
		expect(session.microphones.value).toEqual([]);
		expect(session.muted.value).toBe(true);
		expect(fixture.setMuted).toHaveBeenCalledWith(true);
		fixture.controllers[0].switchMicrophone.mockRejectedValueOnce(new DOMException('No microphone', 'NotFoundError'));
		await session.toggleMute();
		expect(session.muted.value).toBe(true);
		expect(session.isActive.value).toBe(true);
		expect(fixture.alert).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
		await session.toggleMute();
		expect(fixture.controllers[0].switchMicrophone).toHaveBeenCalledTimes(2);
		expect(session.muted.value).toBe(false);
		expect(fixture.setMuted).toHaveBeenLastCalledWith(false);
	});

	test('adjusts only the selected user audio, retains volume for replacement tracks and clears it on leaving', async () => {
		const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
		const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
		try {
			await session.join('room-a', false);
			session.participants.value.push(
				{ ...session.participants.value[0], id: 'participant-b', userId: 'user-b' },
				{ ...session.participants.value[0], id: 'participant-c', userId: 'user-c' },
			);
			const receive = (id: string, participantId: string) => {
				const track = Object.assign(new EventTarget(), { kind: 'audio' }) as MediaStreamTrack;
				fixture.remoteTrackCallbacks[0](track, { id, participantId, mediaKind: 'audio', mediaSource: 'microphone' });
				return document.querySelectorAll('audio')[document.querySelectorAll('audio').length - 1];
			};
			const audioB = receive('publication-b', 'participant-b');
			const audioC = receive('publication-c', 'participant-c');
			expect(audioB.volume).toBe(1);
			session.setParticipantVolume('user-b', 25);
			expect(audioB.volume).toBe(0.25);
			expect(audioC.volume).toBe(1);
			const replacementB = receive('publication-b', 'participant-b');
			expect(replacementB.volume).toBe(0.25);
			expect(audioB.isConnected).toBe(false);
			session.setParticipantVolume('user-b', 0);
			expect(audioC.volume).toBe(1);
			expect(session.getParticipantVolume('user-b')).toBe(0);
			expect(replacementB.volume).toBe(0);
			await session.resumeAudio();
			expect(replacementB.volume).toBe(0);
			session.setParticipantVolume('user-b', 100);
			expect(replacementB.volume).toBe(1);
			await session.leave();
			expect(document.querySelector('audio')).toBeNull();
			expect(session.getParticipantVolume('user-b')).toBe(100);
		} finally {
			play.mockRestore();
			pause.mockRestore();
		}
	});

	test('sends a heartbeat with the current connection every 30 seconds and stops after leaving', async () => {
		await session.join('room-a', false);
		await vi.advanceTimersByTimeAsync(29_999);
		expect(fixture.heartbeat).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(fixture.heartbeat).toHaveBeenCalledWith('device-0', 1);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(fixture.heartbeat).toHaveBeenCalledTimes(2);
		await session.leave();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(fixture.heartbeat).toHaveBeenCalledTimes(2);
	});

	test('notifies participants and closes media when the host timeout ends the room', async () => {
		await session.join('room-a', false);
		const target = session.room.value!;
		// The lifecycle event applies its reason before the ended state.
		fixture.connections[0].endReason.value = 'host-timeout';
		fixture.connections[0].room.value = { ...target, state: 'ended' };
		await vi.waitFor(() => expect(session.currentRoomId.value).toBeNull());
		expect(fixture.toast).toHaveBeenCalledWith('Host left; room ended');
		expect(fixture.controllers[0].close).toHaveBeenCalled();
	});

	test.each([false, true])('camera is only published after preview confirmation (confirmed: %s)', async confirmed => {
		fixture.role = 'host';
		await session.join('room-a', true);
		const track = { stop: vi.fn() };
		const stream = { getTracks: () => [track] };
		fixture.captureCamera.mockResolvedValue(stream);
		const enabling = session.toggleVideo('camera');
		await vi.waitFor(() => expect(fixture.popup).toHaveBeenCalled());
		expect(fixture.controllers[0].startVideo).not.toHaveBeenCalled();
		fixture.popup.mock.calls[0][2].done(confirmed);
		await enabling;
		if (confirmed) {
			expect(fixture.controllers[0].startVideo).toHaveBeenCalledWith('camera', undefined, { height: 720, frameRate: 30 }, stream);
			expect(track.stop).not.toHaveBeenCalled();
		} else {
			expect(fixture.controllers[0].startVideo).not.toHaveBeenCalled();
			expect(track.stop).toHaveBeenCalled();
		}
	});

	test('leaving while previewing stops the camera without publishing it', async () => {
		fixture.role = 'host';
		await session.join('room-a', true);
		const track = { stop: vi.fn() };
		fixture.captureCamera.mockResolvedValue({ getTracks: () => [track] });
		const enabling = session.toggleVideo('camera');
		await vi.waitFor(() => expect(fixture.popup).toHaveBeenCalled());
		await session.leave();
		await enabling;
		expect(track.stop).toHaveBeenCalled();
		expect(fixture.controllers[0].startVideo).not.toHaveBeenCalled();
	});

	test('reconnecting while previewing stops the camera and closes the preview', async () => {
		fixture.role = 'host';
		await session.join('room-a', true);
		const track = { stop: vi.fn() };
		const dispose = vi.fn();
		fixture.popup.mockReturnValue({ dispose });
		fixture.captureCamera.mockResolvedValue({ getTracks: () => [track] });
		const enabling = session.toggleVideo('camera');
		await vi.waitFor(() => expect(fixture.popup).toHaveBeenCalled());
		fixture.revoked[0]({ reason: 'stale-generation', ...fixture.controllers[0].connectionIdentity });
		await enabling;
		await vi.waitFor(() => expect(fixture.controllers).toHaveLength(2));
		expect(track.stop).toHaveBeenCalled();
		expect(dispose).toHaveBeenCalled();
		expect(fixture.controllers[0].startVideo).not.toHaveBeenCalled();
		expect(session.controls.value.busy).toBe(false);
	});

	test('microphone settings toggle noise suppression and keep the old choice on failure', async () => {
		fixture.role = 'host';
		await session.join('room-a', true);
		await session.openDeviceMenu('microphone', new MouseEvent('click'));
		const toggle = fixture.popupMenu.mock.calls[0][0].at(-1);
		expect(toggle.type).toBe('switch');
		expect(toggle.ref.value).toBe(true);
		toggle.ref.value = false;
		await vi.waitFor(() => expect(session.noiseSuppression.value).toBe(false));
		expect(fixture.controllers[0].setNoiseSuppression).toHaveBeenLastCalledWith(false);
		const error = new Error('Unsupported audio constraint');
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		fixture.controllers[0].setNoiseSuppression.mockImplementationOnce(() => { throw error; });
		toggle.ref.value = true;
		await vi.waitFor(() => expect(fixture.alert).toHaveBeenCalledWith({ type: 'error', text: 'Something went wrong' }));
		expect(toggle.ref.value).toBe(false);
		expect(log).toHaveBeenCalledWith('[Calls] Noise suppression change failed', error);
		log.mockRestore();
	});

	test('microphone suppression switch reflects rapid toggles immediately', async () => {
		fixture.role = 'host';
		await session.join('room-a', true);
		await session.openDeviceMenu('microphone', new MouseEvent('click'));
		const toggle = fixture.popupMenu.mock.calls[0][0].at(-1);
		for (const enabled of [false, true, false, true]) {
			toggle.ref.value = enabled;
			expect(toggle.ref.value).toBe(enabled);
			expect(fixture.controllers[0].setNoiseSuppression).toHaveBeenLastCalledWith(enabled);
		}
	});

	test('screen quality menu updates the sender and retains the previous selection on failure', async () => {
		fixture.role = 'host';
		await session.join('room-a', true);
		session.openScreenSettings(new MouseEvent('click'));
		await fixture.popupMenu.mock.calls[0][0][0].children[0].action();
		expect(fixture.controllers[0].setVideoQuality).toHaveBeenCalledWith('screen', { height: 480, frameRate: 30 });
		expect(session.videoQuality.value.screen).toEqual({ height: 480, frameRate: 30 });
		session.openScreenSettings(new MouseEvent('click'));
		const qualityMenu = fixture.popupMenu.mock.calls[1][0];
		expect(qualityMenu[0].children[5].text).toBe('Source quality');
		await qualityMenu[0].children[5].action();
		await qualityMenu[1].children[5].action();
		expect(fixture.controllers[0].setVideoQuality).toHaveBeenLastCalledWith('screen', { height: 'source', frameRate: 144 });
		expect(session.videoQuality.value.screen).toEqual({ height: 'source', frameRate: 144 });
		const error = new Error('Constraints not supported');
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		fixture.controllers[0].setVideoQuality.mockRejectedValueOnce(error);
		session.openScreenSettings(new MouseEvent('click'));
		await fixture.popupMenu.mock.calls[2][0][0].children[2].action();
		expect(session.videoQuality.value.screen).toEqual({ height: 'source', frameRate: 144 });
		expect(fixture.alert).toHaveBeenCalledWith({ type: 'error', text: 'Video failed' });
		expect(log).toHaveBeenCalledWith('[Calls] screen quality change failed', error);
		log.mockRestore();
	});

	test.each(['host', 'listener'] as const)('page-close leaves as %s with the current device identity', async role => {
		fixture.role = role;
		await session.join('room-a', true);
		window.dispatchEvent(new Event('pagehide'));
		expect(fixture.keepalive).toHaveBeenCalledWith('calls/rooms/leave', expect.objectContaining({ roomId: 'room-a', ...fixture.controllers[0].connectionIdentity }));
		const params = fixture.keepalive.mock.calls.at(-1)![1];
		expect(params.reconnectToken).toEqual(expect.any(String));
	});

	test('a failed server leave reports the error while keeping local media disconnected', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		fixture.role = 'host';
		await session.join('room-a', true);
		const error = new Error('Unable to leave');
		fixture.api.mockRejectedValueOnce(error);
		await session.leave();
		expect(session.currentRoomId.value).toBeNull();
		expect(fixture.controllers[0].close).toHaveBeenCalledOnce();
		expect(fixture.alert).toHaveBeenCalledWith({ type: 'error', text: 'Something went wrong' });
		expect(log).toHaveBeenCalledWith('[Calls] Disconnect request failed', error);
		log.mockRestore();
	});

	test('leave returns with media disconnected while server and media cleanup are still pending', async () => {
		fixture.role = 'host';
		await session.join('room-a', true);
		let finishServer!: (value: unknown) => void;
		let finishCleanup!: () => void;
		fixture.api.mockImplementationOnce(() => new Promise(resolve => { finishServer = resolve; }));
		fixture.controllers[0].close.mockImplementationOnce(() => new Promise<void>(resolve => { finishCleanup = resolve; }));
		await session.leave();
		expect(session.currentRoomId.value).toBeNull();
		expect(session.isActive.value).toBe(false);
		expect(fixture.controllers[0].close).toHaveBeenCalledOnce();
		finishServer({});
		finishCleanup();
	});

	test.each([true, false])('only replaces the existing device when confirmation is accepted (canceled: %s)', async canceled => {
		fixture.connectionExists = true;
		fixture.role = 'host';
		fixture.participantMuted = false;
		fixture.confirm.mockResolvedValue({ canceled });
		session.replacedRoomId.value = 'room-a';
		await session.join('room-a', true, undefined, true);
		expect(fixture.confirm).toHaveBeenCalledWith({ type: 'warning', text: 'Disconnect the other device?' });
		expect(session.isActive.value).toBe(!canceled);
		expect(session.replacedRoomId.value).toBe(canceled ? 'room-a' : null);
		expect(fixture.controllers).toHaveLength(canceled ? 1 : 2);
		if (!canceled) expect(fixture.controllers[1].replaceExisting).toBe(true);
		expect(fixture.setMuted).toHaveBeenCalledTimes(canceled ? 0 : 1);
		expect(fixture.api).not.toHaveBeenCalledWith('calls/rooms/leave', expect.anything());
	});

	afterEach(async () => {
		await session.leave();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	test('the old device stops locally without leaving or ending the shared room', async () => {
		fixture.role = 'host';
		await session.join('room-a', true);
		const controller = fixture.controllers[0];
		fixture.api.mockClear();
		fixture.revoked[0]({ reason: 'replaced', ...controller.connectionIdentity });
		await Promise.resolve();
		expect(session.isActive.value).toBe(false);
		expect(session.currentRoomId.value).toBeNull();
		expect(session.replacedRoomId.value).toBe('room-a');
		expect(controller.close).toHaveBeenCalledOnce();
		expect(fixture.controllers).toHaveLength(1);
		expect(fixture.api).not.toHaveBeenCalled();
		expect(fixture.toast).toHaveBeenCalledWith('Connected on another device');
	});

	test('the new device ignores revocation addressed to an old connection', async () => {
		await session.join('room-a', true);
		fixture.revoked[0]({ reason: 'replaced', connectionId: 'old-device', generation: 1 });
		expect(session.isActive.value).toBe(true);
		expect(fixture.controllers[0].close).not.toHaveBeenCalled();
		expect(fixture.toast).not.toHaveBeenCalled();
	});

	test('reconnecting clears stopped video previews and pending video controls', async () => {
		await session.join('room-a', true);
		session.localVideos.value = new Map([['camera', {} as MediaStream], ['screen', {} as MediaStream]]);
		session.videoBusy.value = true;
		fixture.revoked[0]({ reason: 'stale-generation', ...fixture.controllers[0].connectionIdentity });
		await vi.waitFor(() => expect(fixture.controllers).toHaveLength(2));
		expect(session.localVideos.value.size).toBe(0);
		expect(session.videoBusy.value).toBe(false);
	});

	test('lost live state recovers with the existing connection identity', async () => {
		await session.join('room-a', true);
		const identity = fixture.controllers[0].connectionIdentity;
		fixture.revoked[0]({ reason: 'stale-generation', ...identity });
		await vi.waitFor(() => expect(fixture.controllers).toHaveLength(2));
		expect(fixture.controllers[1].connectionIdentity).toEqual(identity);
		expect(session.isActive.value).toBe(true);
		expect(session.replacedRoomId.value).toBeNull();
	});

	test('a listener receiving the host reconnects media and can end the room', async () => {
		await session.join('room-a', false);
		const connection = fixture.connections[fixture.connections.length - 1];
		connection.participants.value = connection.participants.value.map(participant => ({ ...participant, role: 'host' }));
		await vi.waitFor(() => expect(fixture.controllers).toHaveLength(2));
		expect(session.isHost.value).toBe(true);
		await session.leave();
		expect(fixture.api).toHaveBeenCalledWith('calls/rooms/end', expect.objectContaining({ roomId: 'room-a' }));
	});

	test('the previous host leaves without ending the room after transfer', async () => {
		fixture.role = 'host';
		await session.join('room-a', false);
		const connection = fixture.connections[fixture.connections.length - 1];
		connection.participants.value = connection.participants.value.map(participant => ({ ...participant, role: 'speaker' }));
		await nextTick();
		expect(session.isHost.value).toBe(false);
		await session.leave();
		expect(fixture.api).toHaveBeenCalledWith('calls/rooms/leave', expect.objectContaining({ roomId: 'room-a' }));
		expect(fixture.api).not.toHaveBeenCalledWith('calls/rooms/end', expect.anything());
	});

	test.each(['host', 'listener'] as const)('explicit %s exit sends its connection identity', async role => {
		fixture.role = role;
		await session.join('room-a', true);
		const identity = fixture.controllers[0].connectionIdentity;
		await session.leave();
		const endpoint = role === 'host' ? 'calls/rooms/end' : 'calls/rooms/leave';
		expect(fixture.api).toHaveBeenCalledWith(endpoint, { roomId: 'room-a', ...identity, ...(role === 'host' ? { expectedRevision: 1 } : {}) });
		const leaveCallIndex = fixture.api.mock.calls.findIndex(([calledEndpoint]) => calledEndpoint === endpoint);
		expect(fixture.controllers[0].close.mock.invocationCallOrder[0]).toBeLessThan(fixture.api.mock.invocationCallOrder[leaveCallIndex]);
	});
});
