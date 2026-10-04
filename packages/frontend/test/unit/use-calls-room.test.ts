/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { watch } from 'vue';

const fixture = vi.hoisted(() => ({
	api: vi.fn(),
	channelHandlers: new Map<string, (event: Record<string, unknown>) => void>(),
	streamHandlers: new Map<string, () => void>(),
	send: vi.fn(),
	useChannel: vi.fn(),
	dispose: vi.fn(),
}));

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api }));
vi.mock('@/i.js', () => ({ $i: { id: 'user-a' } }));
vi.mock('@/stream.js', () => ({
	useStream: () => ({
		useChannel: fixture.useChannel.mockImplementation(() => ({
			on: (type: string, handler: (event: Record<string, unknown>) => void) => fixture.channelHandlers.set(type, handler),
			send: fixture.send,
			dispose: fixture.dispose,
		})),
		on: (type: string, handler: () => void) => fixture.streamHandlers.set(type, handler),
		off: vi.fn(),
	}),
}));

import { retainCallsRoomConnection, useCallsRoom } from '@/composables/use-calls-room.js';

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
		fixture.useChannel.mockClear();
		fixture.dispose.mockClear();
		fixture.api.mockImplementation(async (endpoint: string) => endpoint === 'calls/rooms/show' ? structuredClone(snapshot) : { roomRevision: 1, publications: [] });
	});

	test('shares room loading and updates across five cards until the last card is disposed', async () => {
		const cards = Array.from({ length: 5 }, () => retainCallsRoomConnection('shared-room'));
		await Promise.all(cards.map(card => card.load()));
		expect(fixture.useChannel).toHaveBeenCalledTimes(1);
		expect(fixture.api).toHaveBeenCalledTimes(1);
		const lateCard = retainCallsRoomConnection('shared-room');
		await lateCard.load();
		expect(fixture.api).toHaveBeenCalledTimes(1);
		cards[0].dispose();
		expect(fixture.dispose).not.toHaveBeenCalled();
		fixture.channelHandlers.get('role')?.({ sequence: 1, roomRevision: 2, participantId: 'participant-a', role: 'speaker' });
		await vi.waitFor(() => expect(lateCard.participants.value[0]?.role).toBe('speaker'));
		for (const card of cards.slice(1)) {
			expect(card.participants.value[0]?.role).toBe('speaker');
			card.dispose();
		}
		expect(fixture.dispose).not.toHaveBeenCalled();
		lateCard.dispose();
		expect(fixture.dispose).toHaveBeenCalledTimes(1);
		const reopened = retainCallsRoomConnection('shared-room');
		await reopened.load();
		expect(fixture.useChannel).toHaveBeenCalledTimes(2);
		expect(fixture.api).toHaveBeenCalledTimes(2);
		reopened.dispose();
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

	test.each([1, 10])('preserves the timeout reason when sequence %s requires a refresh', async sequence => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		fixture.channelHandlers.get('role')?.({ sequence: 8, roomRevision: 2, participantId: 'participant-a', role: 'speaker' });
		await vi.waitFor(() => expect(calls.room.value?.revision).toBe(2));
		const ended = vi.fn();
		const stop = watch(() => calls.room.value?.state, state => {
			if (state === 'ended') ended(calls.endReason.value);
		}, { flush: 'sync' });
		fixture.api.mockResolvedValue({ ...snapshot, room: { ...snapshot.room, state: 'ended', revision: 3 } });
		fixture.channelHandlers.get('lifecycle')?.({ sequence, roomRevision: 3, state: 'ended', reason: 'host-timeout' });
		await vi.waitFor(() => expect(ended).toHaveBeenCalledWith('host-timeout'));
		expect(fixture.api).not.toHaveBeenCalledWith('calls/media/reconcile', { roomId: 'room-a' });
		stop();
	});

	test('keeps the room revision current after mute changes for subsequent moderation', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		fixture.channelHandlers.get('mute')?.({ sequence: 1, roomRevision: 2, participantId: 'participant-a', isMuted: true });
		await vi.waitFor(() => expect(calls.participants.value[0]?.isMuted).toBe(true));
		expect(calls.room.value?.revision).toBe(2);
		await calls.refresh();
		expect(calls.room.value?.revision).toBe(2);
		expect(calls.participants.value[0]?.isMuted).toBe(true);
	});

	test('refreshes authoritative state on WebSocket reconnect and treats channel-wide revoke as local', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		const revoked = vi.fn();
		calls.onRevoked(revoked);
		fixture.streamHandlers.get('_connected_')?.();
		await vi.waitFor(() => expect(fixture.api).toHaveBeenCalledWith('calls/media/reconcile', { roomId: 'room-a' }));

		fixture.channelHandlers.get('revoked')?.({ sequence: 1, roomRevision: 2, reason: 'access' });
		await vi.waitFor(() => expect(revoked).toHaveBeenCalledWith(expect.objectContaining({ reason: 'access' })));
		expect(calls.connected.value).toBe(false);
	});
});
