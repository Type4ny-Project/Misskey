/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
	api: vi.fn(),
	channelHandlers: new Map<string, (event: Record<string, unknown>) => void>(),
	streamHandlers: new Map<string, () => void>(),
	send: vi.fn(),
}));

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api }));
vi.mock('@/i.js', () => ({ $i: { id: 'user-a' } }));
vi.mock('@/stream.js', () => ({
	useStream: () => ({
		useChannel: () => ({
			on: (type: string, handler: (event: Record<string, unknown>) => void) => fixture.channelHandlers.set(type, handler),
			send: fixture.send,
			dispose: vi.fn(),
		}),
		on: (type: string, handler: () => void) => fixture.streamHandlers.set(type, handler),
		off: vi.fn(),
	}),
}));

import { useCallsRoom } from '@/composables/use-calls-room.js';

const snapshot = {
	room: { id: 'room-a', state: 'open', revision: 1 },
	participants: [{ id: 'participant-a', userId: 'user-a', role: 'listener', isMuted: false }],
};

describe('useCallsRoom streaming reconciliation', () => {
	beforeEach(() => {
		fixture.api.mockReset();
		fixture.channelHandlers.clear();
		fixture.streamHandlers.clear();
		fixture.send.mockReset();
		fixture.api.mockImplementation(async (endpoint: string) => endpoint === 'calls/rooms/show' ? structuredClone(snapshot) : { roomRevision: 1, publications: [] });
	});

	test('ignores duplicate events and reconciles a sequence gap before applying the next event', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		fixture.channelHandlers.get('role')?.({ sequence: 1, roomRevision: 2, participantId: 'participant-a', role: 'speaker' });
		await vi.waitFor(() => expect(calls.participants.value[0]?.role).toBe('speaker'));

		fixture.channelHandlers.get('role')?.({ sequence: 1, roomRevision: 2, participantId: 'participant-a', role: 'listener' });
		await Promise.resolve();
		expect(calls.participants.value[0]?.role).toBe('speaker');

		fixture.channelHandlers.get('mute')?.({ sequence: 3, roomRevision: 3, participantId: 'participant-a', isMuted: true });
		await vi.waitFor(() => expect(fixture.api).toHaveBeenCalledWith('calls/media/reconcile', { roomId: 'room-a' }));
		expect(calls.participants.value[0]?.isMuted).toBe(true);
	});

	test('treats a lower sequence with a newer room revision as Redis sequence loss', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		fixture.channelHandlers.get('role')?.({ sequence: 8, roomRevision: 2, participantId: 'participant-a', role: 'speaker' });
		await vi.waitFor(() => expect(calls.participants.value[0]?.role).toBe('speaker'));
		fixture.channelHandlers.get('mute')?.({ sequence: 1, roomRevision: 3, participantId: 'participant-a', isMuted: true });
		await vi.waitFor(() => expect(calls.participants.value[0]?.isMuted).toBe(true));
		expect(fixture.api).toHaveBeenCalledWith('calls/media/reconcile', { roomId: 'room-a' });
	});

	test('does not let an older snapshot regress a WebSocket-applied revision', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		fixture.channelHandlers.get('role')?.({ sequence: 1, roomRevision: 2, participantId: 'participant-a', role: 'speaker' });
		await vi.waitFor(() => expect(calls.room.value?.revision).toBe(2));
		await calls.refresh();
		expect(calls.room.value?.revision).toBe(2);
		expect(calls.participants.value[0]?.role).toBe('speaker');
	});

	test('refreshes authoritative state on WebSocket reconnect and treats channel-wide revoke as local', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		const revoked = vi.fn();
		calls.onRevoked(revoked);
		fixture.streamHandlers.get('_connected_')?.();
		await vi.waitFor(() => expect(fixture.api).toHaveBeenCalledWith('calls/media/reconcile', { roomId: 'room-a' }));

		fixture.channelHandlers.get('revoked')?.({ sequence: 1, roomRevision: 2, reason: 'access' });
		await vi.waitFor(() => expect(revoked).toHaveBeenCalledWith('access'));
		expect(calls.connected.value).toBe(false);
	});
});
