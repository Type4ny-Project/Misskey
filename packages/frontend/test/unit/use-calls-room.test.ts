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
	room: { id: 'room-a', title: 'Original title', state: 'open', revision: 1, startedAt: '2026-10-04T00:00:00.000Z', endedAt: null as string | null },
	participants: [{ id: 'participant-a', userId: 'user-a', role: 'listener', isMuted: false, user: { id: 'user-a', username: 'Alice', avatarUrl: 'https://example.invalid/alice.png', isFollowing: true, isFollowed: false } }],
};

const endedSnapshot = {
	room: { ...snapshot.room, state: 'ended', revision: 2, endedAt: '2026-10-04T00:12:34.000Z' },
	participants: [],
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

	test('keeps a shared connection alive while a card and session reference overlap', async () => {
		const card = retainCallsRoomConnection('shared-room');
		const session = retainCallsRoomConnection('shared-room');
		await Promise.all([card.load(), session.load()]);
		expect(fixture.useChannel).toHaveBeenCalledTimes(1);
		expect(fixture.api).toHaveBeenCalledTimes(1);

		session.dispose();
		expect(fixture.dispose).not.toHaveBeenCalled();
		fixture.channelHandlers.get('role')?.({ sequence: 1, roomRevision: 2, participantId: 'participant-a', role: 'speaker' });
		await vi.waitFor(() => expect(card.participants.value[0]?.role).toBe('speaker'));

		card.dispose();
		expect(fixture.dispose).toHaveBeenCalledTimes(1);
	});

	test('refreshes the local participant identity when a shared connection is reused', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		calls.setSpeaking(true);

		fixture.api.mockResolvedValueOnce({
			room: snapshot.room,
			participants: [{ ...snapshot.participants[0], id: 'participant-b' }],
		});
		await calls.refresh();
		calls.setSpeaking(true);

		expect(fixture.send.mock.calls.filter(([type]) => type === 'speaking')).toHaveLength(2);
		calls.dispose();
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

	test('ends immediately and loads authoritative timestamps from the room snapshot', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		const pending = Promise.withResolvers<typeof endedSnapshot>();
		fixture.api.mockReturnValueOnce(pending.promise);
		fixture.channelHandlers.get('lifecycle')?.({ sequence: 1, roomRevision: 2, state: 'ended' });

		expect(calls.room.value).toMatchObject({ state: 'ended', revision: 2, endedAt: null });
		expect(fixture.api).toHaveBeenLastCalledWith('calls/rooms/show', { roomId: 'room-a' });
		expect(fixture.api).toHaveBeenCalledTimes(2);
		pending.resolve(endedSnapshot);
		await vi.waitFor(() => expect(calls.room.value).toEqual(endedSnapshot.room));
		expect(calls.participants.value).toEqual([]);
	});

	test('rejects an older snapshot while the initial load races with the end event', async () => {
		const calls = useCallsRoom('room-a');
		const initial = Promise.withResolvers<typeof snapshot>();
		const ended = Promise.withResolvers<typeof endedSnapshot>();
		fixture.api.mockReturnValueOnce(initial.promise).mockReturnValueOnce(ended.promise);
		const loading = calls.refresh();
		fixture.channelHandlers.get('lifecycle')?.({ sequence: 1, roomRevision: 2, state: 'ended', reason: 'host-timeout' });
		initial.resolve(snapshot);
		await loading;

		expect(calls.room.value).toBeNull();
		expect(calls.participants.value).toEqual([]);
		ended.resolve(endedSnapshot);
		await vi.waitFor(() => expect(calls.room.value).toEqual(endedSnapshot.room));
		expect(calls.endReason.value).toBe('host-timeout');
	});

	test('does not let an in-flight open snapshot undo the immediate ended state', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		const stale = Promise.withResolvers<typeof snapshot>();
		const ended = Promise.withResolvers<typeof endedSnapshot>();
		fixture.api.mockReturnValueOnce(stale.promise).mockReturnValueOnce(ended.promise);
		const loading = calls.refresh();
		fixture.channelHandlers.get('lifecycle')?.({ sequence: 1, roomRevision: 2, state: 'ended' });
		stale.resolve(snapshot);
		await loading;
		expect(calls.room.value).toMatchObject({ state: 'ended', revision: 2, endedAt: null });
		ended.resolve(endedSnapshot);
		await vi.waitFor(() => expect(calls.room.value).toEqual(endedSnapshot.room));
	});

	test('ignores duplicate and older lifecycle events without refetching or clearing the end reason', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		fixture.api.mockResolvedValueOnce(endedSnapshot);
		fixture.channelHandlers.get('lifecycle')?.({ sequence: 2, roomRevision: 2, state: 'ended', reason: 'host-timeout' });
		await vi.waitFor(() => expect(calls.room.value).toEqual(endedSnapshot.room));
		fixture.channelHandlers.get('lifecycle')?.({ sequence: 2, roomRevision: 2, state: 'ended' });
		fixture.channelHandlers.get('lifecycle')?.({ sequence: 3, roomRevision: 1, state: 'open' });
		fixture.channelHandlers.get('lifecycle')?.({ sequence: 1, roomRevision: 2, state: 'ended' });
		expect(calls.room.value).toEqual(endedSnapshot.room);
		expect(calls.endReason.value).toBe('host-timeout');
		expect(fixture.api).toHaveBeenCalledTimes(2);
	});

	test('loads an already ended room with its timestamps and rejects an older open event', async () => {
		fixture.api.mockResolvedValueOnce(endedSnapshot);
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		fixture.channelHandlers.get('lifecycle')?.({ sequence: 1, roomRevision: 1, state: 'open' });
		expect(calls.room.value).toEqual(endedSnapshot.room);
		expect(fixture.api).toHaveBeenCalledTimes(1);
	});

	test('keeps the ended state after a failed timestamp fetch and recovers on reconnect', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		const tracksChanged = vi.fn();
		calls.onTrackChange(tracksChanged);
		fixture.api.mockRejectedValueOnce(new Error('Temporary network failure'));
		fixture.channelHandlers.get('lifecycle')?.({ sequence: 1, roomRevision: 2, state: 'ended', reason: 'host-timeout' });
		// Let the background rejection settle before reconnecting.
		await new Promise(resolve => window.setTimeout(resolve, 0));
		expect(calls.room.value).toMatchObject({ state: 'ended', revision: 2, endedAt: null });
		expect(calls.endReason.value).toBe('host-timeout');

		fixture.api.mockResolvedValueOnce(endedSnapshot);
		fixture.streamHandlers.get('_connected_')?.();
		await vi.waitFor(() => expect(calls.room.value).toEqual(endedSnapshot.room));
		expect(calls.endReason.value).toBe('host-timeout');
		expect(tracksChanged).not.toHaveBeenCalled();
		expect(fixture.api).toHaveBeenCalledTimes(3);
	});

	test('loads end timestamps when a room ended while disconnected', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		const tracksChanged = vi.fn();
		calls.onTrackChange(tracksChanged);
		fixture.streamHandlers.get('_disconnected_')?.();
		fixture.api.mockResolvedValueOnce(endedSnapshot);
		fixture.streamHandlers.get('_connected_')?.();
		await vi.waitFor(() => expect(calls.room.value).toEqual(endedSnapshot.room));
		expect(tracksChanged).not.toHaveBeenCalled();
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

	test('clears a muted speaker and ignores stale speaking lists until they unmute', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		const speaking = fixture.channelHandlers.get('speaking')!;
		const mute = fixture.channelHandlers.get('mute')!;
		speaking({ sequence: 1, roomRevision: 1, participantIds: ['participant-a', 'participant-b'] });
		mute({ sequence: 2, roomRevision: 2, participantId: 'participant-a', isMuted: true });
		expect([...calls.speakingParticipantIds.value]).toEqual(['participant-b']);
		expect(calls.participants.value[0]?.isMuted).toBe(true);
		const mutedSpeaking = calls.speakingParticipantIds.value;
		speaking({ sequence: 3, roomRevision: 2, participantIds: ['participant-a', 'participant-b'] });
		expect(calls.speakingParticipantIds.value).toBe(mutedSpeaking);
		mute({ sequence: 4, roomRevision: 3, participantId: 'participant-a', isMuted: false });
		expect(calls.speakingParticipantIds.value).toBe(mutedSpeaking);
		speaking({ sequence: 5, roomRevision: 3, participantIds: ['participant-a', 'participant-b'] });
		expect([...calls.speakingParticipantIds.value]).toEqual(['participant-a', 'participant-b']);
	});

	test('throttles repeated speaking notifications while refreshing active speakers', () => {
		const calls = useCallsRoom('room-a');
		let now = 10_000;
		const performanceNow = vi.spyOn(performance, 'now').mockImplementation(() => now);
		const speakingSends = () => fixture.send.mock.calls.filter(([type]) => type === 'speaking');

		try {
			calls.setSpeaking(true);
			now += 500;
			calls.setSpeaking(true);
			now += 499;
			calls.setSpeaking(true);
			now += 500;
			calls.setSpeaking(false);
			now += 500;
			calls.setSpeaking(false);
			now += 499;
			calls.setSpeaking(false);
			calls.setSpeaking(true);

			expect(speakingSends().map(([, speaking]) => speaking)).toEqual([true, true, false, false, true]);
		} finally {
			performanceNow.mockRestore();
			calls.dispose();
		}
	});

	test('resets the speaking notification gate for own mute and stream reconnect', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		let now = 10_000;
		const performanceNow = vi.spyOn(performance, 'now').mockImplementation(() => now);
		const speakingSends = () => fixture.send.mock.calls.filter(([type]) => type === 'speaking');

		try {
			calls.setSpeaking(true);
			now += 100;
			fixture.channelHandlers.get('mute')?.({ sequence: 1, roomRevision: 2, participantId: 'participant-b', isMuted: true });
			calls.setSpeaking(true);
			expect(speakingSends()).toHaveLength(1);
			fixture.channelHandlers.get('mute')?.({ sequence: 2, roomRevision: 3, participantId: 'participant-a', isMuted: false });
			calls.setSpeaking(true);
			calls.setMuted(false);
			calls.setSpeaking(true);
			fixture.streamHandlers.get('_disconnected_')?.();
			calls.setSpeaking(true);
			fixture.streamHandlers.get('_connected_')?.();
			calls.setSpeaking(true);

			expect(speakingSends().map(([, speaking]) => speaking)).toEqual([true, true, true, true, true]);
		} finally {
			performanceNow.mockRestore();
			calls.dispose();
		}
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

	test('preserves reactive references for repeated and reordered speaking events', async () => {
		const calls = useCallsRoom('room-a');
		await calls.refresh();
		let roomInvalidations = 0;
		let speakingInvalidations = 0;
		const stopRoom = watch(calls.room, () => roomInvalidations++, { flush: 'sync' });
		const stopSpeaking = watch(calls.speakingParticipantIds, () => speakingInvalidations++, { flush: 'sync' });
		const speaking = fixture.channelHandlers.get('speaking')!;
		speaking({ sequence: 1, roomRevision: 1, participantIds: ['participant-a', 'participant-b'] });
		await vi.waitFor(() => expect([...calls.speakingParticipantIds.value]).toEqual(['participant-a', 'participant-b']));
		roomInvalidations = 0;
		speakingInvalidations = 0;
		const initialRoom = calls.room.value;
		const initialSpeaking = calls.speakingParticipantIds.value;
		for (let sequence = 2; sequence <= 101; sequence++) {
			speaking({ sequence, roomRevision: 1, participantIds: ['participant-a', 'participant-b'] });
		}
		speaking({ sequence: 102, roomRevision: 1, participantIds: ['participant-b', 'participant-a'] });
		expect(roomInvalidations).toBe(0);
		expect(speakingInvalidations).toBe(0);
		expect(calls.room.value).toBe(initialRoom);
		expect(calls.speakingParticipantIds.value).toBe(initialSpeaking);

		speaking({ sequence: 104, roomRevision: 1, participantIds: ['participant-a', 'participant-c'] });
		await vi.waitFor(() => expect([...calls.speakingParticipantIds.value].sort()).toEqual(['participant-a', 'participant-c']));
		expect(roomInvalidations).toBe(0);
		expect(speakingInvalidations).toBe(1);

		speaking({ sequence: 104, roomRevision: 1, participantIds: ['participant-a', 'participant-b'] });
		await new Promise(resolve => setTimeout(resolve, 0));
		expect([...calls.speakingParticipantIds.value].sort()).toEqual(['participant-a', 'participant-c']);
		expect(speakingInvalidations).toBe(1);
		stopRoom();
		stopSpeaking();
	});
});
