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
	room: { id: 'room-a', title: 'Original title', state: 'open', revision: 1 },
	participants: [{ id: 'participant-a', userId: 'user-a', role: 'listener', isMuted: false, user: { id: 'user-a', username: 'Alice', avatarUrl: 'https://example.invalid/alice.png', isFollowing: true, isFollowed: false } }],
};

describe('useCallsRoom streaming updates', () => {
	beforeEach(() => {
		fixture.api.mockReset();
		fixture.channelHandlers.clear();
		fixture.streamHandlers.clear();
		fixture.send.mockReset();
		fixture.useChannel.mockClear();
		fixture.dispose.mockClear();
		fixture.api.mockImplementation(async (endpoint: string) => endpoint === 'calls/rooms/show' ? structuredClone(snapshot) : { roomRevision: 1, publications: [] });
	});

	test('recognizes a provisional participant for revocation without displaying it', async () => {
		fixture.api.mockResolvedValueOnce({ ...snapshot, participants: [] });
		const calls = useCallsRoom('room-a');
		calls.identifyParticipant('participant-a');
		await calls.refresh();
		const revoked = vi.fn();
		calls.onRevoked(revoked);
		fixture.channelHandlers.get('revoked')?.({ sequence: 1, roomRevision: 2, participantId: 'participant-a', reason: 'access' });
		expect(revoked).toHaveBeenCalledOnce();
		expect(calls.participants.value).toEqual([]);
		calls.ready('device-a', 1);
		expect(fixture.send).toHaveBeenCalledWith('ready', { connectionId: 'device-a', generation: 1 });
		calls.dispose();
	});

	test('shares room loading and updates across five cards until the last card is disposed', async () => {
		const cards = Array.from({ length: 5 }, () => retainCallsRoomConnection('shared-room'));
		await Promise.all(cards.map(card => card.load()));
		expect(cards[0].participants.value[0]?.user).toMatchObject(snapshot.participants[0].user);
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

	test('refreshes ownership and both roles when a new host is announced', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		const updated = { room: { ...snapshot.room, revision: 2, attachment: { type: 'personal', ownerUserId: 'new-host' } }, participants: [{ ...snapshot.participants[0], role: 'speaker' }, { ...snapshot.participants[0], id: 'new-participant', userId: 'new-host', role: 'host' }] };
		fixture.api.mockResolvedValueOnce(updated);
		fixture.channelHandlers.get('participant')?.({ sequence: 1, roomRevision: 2, participantId: 'new-participant', action: 'updated', participant: updated.participants[1] });
		await vi.waitFor(() => expect(calls.room.value).toEqual(updated.room));
		expect(calls.participants.value).toEqual(updated.participants);
		expect(fixture.api).toHaveBeenCalledTimes(2);
	});

	test('applies moderator and speaker request changes without fetching the room or user', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		fixture.channelHandlers.get('participant')?.({ sequence: 1, roomRevision: 2, participantId: 'participant-a', action: 'updated', participant: snapshot.participants[0], moderatorUserIds: ['user-a'] });
		expect(calls.room.value?.moderatorUserIds).toEqual(['user-a']);
		const occurredAt = '2026-10-04T00:00:00.000Z';
		fixture.channelHandlers.get('speakerRequest')?.({ sequence: 2, roomRevision: 3, occurredAt, participantId: 'participant-a', requested: true });
		expect(calls.participants.value[0]?.speakerRequestedAt).toBe(occurredAt);
		fixture.channelHandlers.get('speakerRequest')?.({ sequence: 3, roomRevision: 4, occurredAt, participantId: 'participant-a', requested: false });
		expect(calls.participants.value[0]?.speakerRequestedAt).toBeNull();
		expect(fixture.api).toHaveBeenCalledTimes(1);
	});

	test('applies a title change to the room without regressing to an older snapshot', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		fixture.channelHandlers.get('title')?.({ sequence: 1, roomRevision: 2, title: 'New title' });
		await vi.waitFor(() => expect(calls.room.value?.title).toBe('New title'));
		expect(calls.room.value?.revision).toBe(2);
		await calls.refresh();
		expect(calls.room.value?.title).toBe('New title');
	});

	test('ignores duplicate events and applies later events without refetching', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		fixture.channelHandlers.get('role')?.({ sequence: 1, roomRevision: 2, participantId: 'participant-a', role: 'speaker' });
		await vi.waitFor(() => expect(calls.participants.value[0]?.role).toBe('speaker'));

		fixture.channelHandlers.get('role')?.({ sequence: 1, roomRevision: 2, participantId: 'participant-a', role: 'listener' });
		await Promise.resolve();
		expect(calls.participants.value[0]?.role).toBe('speaker');

		fixture.channelHandlers.get('mute')?.({ sequence: 3, roomRevision: 3, participantId: 'participant-a', isMuted: true });
		await vi.waitFor(() => expect(calls.participants.value[0]?.isMuted).toBe(true));
		expect(fixture.api).toHaveBeenCalledTimes(1);
	});

	test('applies a newer room revision without refetching when the sequence resets', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		fixture.channelHandlers.get('role')?.({ sequence: 8, roomRevision: 2, participantId: 'participant-a', role: 'speaker' });
		await vi.waitFor(() => expect(calls.participants.value[0]?.role).toBe('speaker'));
		fixture.channelHandlers.get('mute')?.({ sequence: 1, roomRevision: 3, participantId: 'participant-a', isMuted: true });
		await vi.waitFor(() => expect(calls.participants.value[0]?.isMuted).toBe(true));
		expect(fixture.api).toHaveBeenCalledTimes(1);
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

	test.each([1, 10])('preserves the timeout reason with sequence %s', async sequence => {
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

	test('video stop events trigger media reconciliation without revoking the participant', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		const reconcile = vi.fn();
		const revoked = vi.fn();
		calls.onTrackChange(reconcile);
		calls.onRevoked(revoked);
		fixture.channelHandlers.get('videoStopped')?.({ sequence: 1, roomRevision: 2, participantId: 'participant-a', mediaSource: 'camera' });
		expect(reconcile).toHaveBeenCalledTimes(1);
		expect(calls.room.value?.revision).toBe(2);
		expect(revoked).not.toHaveBeenCalled();
	});

	test('refreshes room and media state on reconnect and treats channel-wide revoke as local', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		const revoked = vi.fn();
		calls.onRevoked(revoked);
		const tracksChanged = vi.fn();
		calls.onTrackChange(tracksChanged);
		fixture.streamHandlers.get('_connected_')?.();
		expect(calls.connected.value).toBe(true);
		await vi.waitFor(() => expect(tracksChanged).toHaveBeenCalledOnce());
		expect(fixture.api).toHaveBeenCalledTimes(2);
		expect(fixture.api).toHaveBeenLastCalledWith('calls/rooms/show', { roomId: 'room-a' });

		fixture.channelHandlers.get('revoked')?.({ sequence: 1, roomRevision: 2, reason: 'access' });
		await vi.waitFor(() => expect(revoked).toHaveBeenCalledWith(expect.objectContaining({ reason: 'access' })));
		expect(calls.connected.value).toBe(false);
	});
});
