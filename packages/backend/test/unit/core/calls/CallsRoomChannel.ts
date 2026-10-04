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
	const channel = new CallsRoomChannel({ id: 'channel-a', connection } as never, rooms as never, {} as never);
	expect(await channel.init({ roomId: 'room-a' })).toBe(true);
	rooms.assertCanAccess.mockRejectedValue(new CallsRoomError('access-denied'));
	const handler = subscriber.on.mock.calls[0][1];
	await handler({ type: 'mute', body: { sequence: 1, roomRevision: 1 } });
	expect(rooms.leave).toHaveBeenCalledWith(user, 'room-a');
	expect(subscriber.off.mock.invocationCallOrder[0]).toBeLessThan(rooms.leave.mock.invocationCallOrder[0]);
	expect(connection.sendMessageToWs).toHaveBeenCalledWith('channel', expect.objectContaining({ type: 'revoked' }));
});
