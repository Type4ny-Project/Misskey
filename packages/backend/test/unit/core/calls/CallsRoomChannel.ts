/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import { CallsRoomError } from '@/core/calls/CallsRoomService.js';
import { CallsRoomChannel } from '@/server/api/stream/channels/calls-room.js';

test('leaves the room and revokes media when a stream event detects lost access', async () => {
	const subscriber = { on: vi.fn(), off: vi.fn() };
	const user = { id: 'user-a' };
	const connection = { user, subscriber, sendMessageToWs: vi.fn() };
	const rooms = { getRoom: vi.fn().mockResolvedValue({ revision: 1 }), assertCanAccess: vi.fn().mockResolvedValue(undefined), leave: vi.fn().mockResolvedValue(undefined) };
	const participants = { findOneBy: vi.fn() };
	const entity = { packParticipants: vi.fn() };
	const channel = new CallsRoomChannel({ id: 'channel-a', connection } as never, rooms as never, { assertAccess: vi.fn() } as never, {} as never, participants as never, entity as never);
	expect(await channel.init({ roomId: 'room-a' })).toBe(true);
	rooms.assertCanAccess.mockRejectedValue(new CallsRoomError('access-denied'));
	const handler = subscriber.on.mock.calls[0][1];
	await handler({ type: 'participant', body: { sequence: 1, roomRevision: 1, participantId: 'participant-a', action: 'joined' } });
	expect(rooms.leave).toHaveBeenCalledWith(user, 'room-a');
	expect(participants.findOneBy).not.toHaveBeenCalled();
	expect(entity.packParticipants).not.toHaveBeenCalled();
	expect(subscriber.off.mock.invocationCallOrder[0]).toBeLessThan(rooms.leave.mock.invocationCallOrder[0]);
	expect(connection.sendMessageToWs).toHaveBeenCalledWith('channel', expect.objectContaining({ type: 'revoked' }));
});

test.each(['joined', 'updated'] as const)('includes user data when a participant is %s', async action => {
	const subscriber = { on: vi.fn(), off: vi.fn() };
	const user = { id: 'user-a' };
	const connection = { user, subscriber, sendMessageToWs: vi.fn() };
	const rooms = { getRoom: vi.fn().mockResolvedValue({ revision: 1, moderatorUserIds: ['moderator-a'] }), assertCanAccess: vi.fn().mockResolvedValue(undefined), leave: vi.fn() };
	const participant = { id: 'participant-a', roomId: 'room-a', userId: 'user-b' };
	const packedParticipant = { id: 'participant-a', user: { id: 'user-b', avatarUrl: 'avatar' } };
	const participants = { findOneBy: vi.fn().mockResolvedValue(participant) };
	const entity = { packParticipants: vi.fn().mockResolvedValue([packedParticipant]) };
	const channel = new CallsRoomChannel({ id: 'channel-a', connection } as never, rooms as never, { assertAccess: vi.fn() } as never, {} as never, participants as never, entity as never);
	expect(await channel.init({ roomId: 'room-a' })).toBe(true);
	const handler = subscriber.on.mock.calls[0][1];
	const body = { sequence: 1, roomRevision: 1, occurredAt: new Date().toISOString(), participantId: 'participant-a', action };
	await handler({ type: 'participant', body });
	expect(participants.findOneBy).toHaveBeenCalledWith({ id: 'participant-a', roomId: 'room-a' });
	expect(entity.packParticipants).toHaveBeenCalledWith([participant], user);
	const expectedBody = action === 'updated' ? { ...body, participant: packedParticipant, moderatorUserIds: ['moderator-a'] } : { ...body, participant: packedParticipant };
	expect(connection.sendMessageToWs).toHaveBeenCalledWith('channel', expect.objectContaining({ type: 'participant', body: expectedBody }));
});

test.each(['left', 'removed'] as const)('does not load user data when a participant is %s', async action => {
	const subscriber = { on: vi.fn(), off: vi.fn() };
	const user = { id: 'user-a' };
	const connection = { user, subscriber, sendMessageToWs: vi.fn() };
	const rooms = { getRoom: vi.fn().mockResolvedValue({ revision: 1 }), assertCanAccess: vi.fn().mockResolvedValue(undefined) };
	const participants = { findOneBy: vi.fn() };
	const entity = { packParticipants: vi.fn() };
	const channel = new CallsRoomChannel({ id: 'channel-a', connection } as never, rooms as never, { assertAccess: vi.fn() } as never, {} as never, participants as never, entity as never);
	expect(await channel.init({ roomId: 'room-a' })).toBe(true);
	const handler = subscriber.on.mock.calls[0][1];
	const body = { sequence: 1, roomRevision: 1, occurredAt: new Date().toISOString(), participantId: 'participant-a', action };
	await handler({ type: 'participant', body });
	expect(participants.findOneBy).not.toHaveBeenCalled();
	expect(entity.packParticipants).not.toHaveBeenCalled();
	expect(connection.sendMessageToWs).toHaveBeenCalledWith('channel', expect.objectContaining({ type: 'participant', body }));
});


test('rechecks Watch Together access before sending video state to removed viewers', async () => {
	const subscriber = { on: vi.fn(), off: vi.fn() };
	const user = { id: 'removed-user' };
	const connection = { user, subscriber, sendMessageToWs: vi.fn() };
	const rooms = { getRoom: vi.fn().mockResolvedValue({ revision: 1 }), assertCanAccess: vi.fn(), leave: vi.fn().mockResolvedValue(undefined) };
	const watchTogether = { assertAccess: vi.fn().mockRejectedValue(new CallsRoomError('access-denied')) };
	const channel = new CallsRoomChannel({ id: 'channel-a', connection } as never, rooms as never, watchTogether as never, {} as never, {} as never, {} as never);
	await channel.init({ roomId: 'room-a' });
	await subscriber.on.mock.calls[0][1]({ type: 'watchTogether', body: { sequence: 1, roomRevision: 1, state: { videoId: 'M7lc1UVf-VE' } } });
	expect(watchTogether.assertAccess).toHaveBeenCalledWith(user, 'room-a');
	expect(connection.sendMessageToWs).toHaveBeenCalledWith('channel', expect.objectContaining({ type: 'revoked' }));
	expect(connection.sendMessageToWs).not.toHaveBeenCalledWith('channel', expect.objectContaining({ type: 'watchTogether' }));
});
