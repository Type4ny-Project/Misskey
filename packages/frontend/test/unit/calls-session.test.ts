/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
	api: vi.fn(),
	toast: vi.fn(),
	confirm: vi.fn(),
	connectionExists: false,
	participantMuted: true,
	setMuted: vi.fn(),
	role: 'listener' as 'listener' | 'host',
	revoked: [] as Array<(event: { reason: string; connectionId?: string; generation?: number }) => void>,
	controllers: [] as Array<{ connectionIdentity: { connectionId: string; generation: number }; replaceExisting: boolean; close: ReturnType<typeof vi.fn> }>,
}));

vi.mock('@/i.js', () => ({ $i: { id: 'user-a' } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _calls: { connectedOnAnotherDevice: 'Connected on another device', switchDeviceConfirm: 'Disconnect the other device?' } } } }));
vi.mock('@/os.js', () => ({ toast: fixture.toast, confirm: fixture.confirm }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItemAsJson: () => null, removeItem: vi.fn() } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api, misskeyApiKeepalive: vi.fn() }));
vi.mock('@/utility/calls-media-core.js', () => ({ detectCallsMediaCapabilities: () => ({ secureContext: true, peerConnection: true, transceiver: true }) }));
vi.mock('@/composables/use-calls-room.js', async () => {
	const { ref } = await import('vue');
	return {
		createCallsRoomConnection: (roomId: string) => ({
			room: ref({ id: roomId, title: 'Room', state: 'open', revision: 1 }),
			participants: ref([{ id: 'participant-a', userId: 'user-a', role: fixture.role, isMuted: fixture.participantMuted }]),
			speakingParticipantIds: ref(new Set()),
			connected: ref(true),
			refresh: vi.fn(), dispose: vi.fn(), setMuted: fixture.setMuted, setSpeaking: vi.fn(), heartbeat: vi.fn(),
			onTrackChange: () => vi.fn(),
			onRevoked: (callback: typeof fixture.revoked[number]) => { fixture.revoked.push(callback); return vi.fn(); },
		}),
	};
});
vi.mock('@/utility/calls-media.js', () => ({
	CallsMediaController: class {
		public connectionIdentity: { connectionId: string; generation: number };
		public close = vi.fn().mockResolvedValue(undefined);
		public connect = vi.fn(async () => {
			if (fixture.connectionExists && !this.replaceExisting) throw { code: 'CALLS_CONNECTION_EXISTS' };
		});
		public setMuted = vi.fn();
		constructor(_roomId: string, _role: string, _onState: unknown, _onRemoteTrack: unknown, _onStats: unknown, previousConnection?: { connectionId: string; generation: number }, public replaceExisting = false) {
			this.connectionIdentity = previousConnection ?? { connectionId: `device-${fixture.controllers.length}`, generation: 1 };
			fixture.controllers.push(this);
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
		fixture.confirm.mockReset().mockResolvedValue({ canceled: true });
		fixture.connectionExists = false;
		fixture.participantMuted = true;
		fixture.setMuted.mockClear();
		fixture.role = 'listener';
		fixture.revoked.length = 0;
		fixture.controllers.length = 0;
		Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: async () => [] } });
		session = (await import('@/utility/calls-session.js')).useCallsSession();
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

	test.each(['host', 'listener'] as const)('explicit %s exit sends its connection identity', async role => {
		fixture.role = role;
		await session.join('room-a', true);
		const identity = fixture.controllers[0].connectionIdentity;
		await session.leave();
		expect(fixture.api).toHaveBeenCalledWith(role === 'host' ? 'calls/rooms/end' : 'calls/rooms/leave', expect.objectContaining({ roomId: 'room-a', ...identity }));
	});
});
