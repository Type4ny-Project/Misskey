/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import { CallsRoomError } from '@/core/calls/CallsRoomService.js';
import TransferHost from '@/server/api/endpoints/calls/rooms/transfer-host.js';
import UpdateTitle from '@/server/api/endpoints/calls/rooms/update-title.js';
import type { MiLocalUser } from '@/models/User.js';

const host = { id: 'ownera' } as MiLocalUser;
const params = { roomId: 'rooma', title: 'New title', expectedRevision: 1 };

test('returns the packed room after a title change', async () => {
	const room = { id: params.roomId, title: params.title, revision: 2 };
	const service = { updateTitle: vi.fn().mockResolvedValue(room) };
	const entity = { packRoom: vi.fn().mockResolvedValue(room) };
	const endpoint = new UpdateTitle(service as never, entity as never);
	await expect(endpoint.exec(params, host, null)).resolves.toEqual(room);
	expect(service.updateTitle).toHaveBeenCalledWith(host, params.roomId, params.title, params.expectedRevision);
});

test.each(['', 'a'.repeat(257)])('rejects an invalid title length (%s)', async title => {
	const service = { updateTitle: vi.fn() };
	const endpoint = new UpdateTitle(service as never, {} as never);
	await expect(endpoint.exec({ ...params, title }, host, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
	expect(service.updateTitle).not.toHaveBeenCalled();
});

test('maps a non-host title change to the Calls access error', async () => {
	const endpoint = new UpdateTitle({ updateTitle: vi.fn().mockRejectedValue(new CallsRoomError('access-denied')) } as never, {} as never);
	await expect(endpoint.exec(params, host, null)).rejects.toMatchObject({ code: 'CALLS_ACCESS_DENIED' });
});

test('returns the packed room after transferring the host', async () => {
	const room = { id: params.roomId, ownerUserId: 'target', revision: 2 };
	const service = { transferHost: vi.fn().mockResolvedValue(room) };
	const entity = { packRoom: vi.fn().mockResolvedValue(room) };
	const input = { roomId: params.roomId, participantId: 'participanta', expectedRevision: 1 };
	await expect(new TransferHost(service as never, entity as never).exec(input, host, null)).resolves.toEqual(room);
	expect(service.transferHost).toHaveBeenCalledWith(host, input.roomId, input.participantId, 1);
});
