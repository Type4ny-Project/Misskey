/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import { CallsConnectionExistsError } from '@/core/calls/CallsMediaService.js';
import { CallsOperationInProgressError } from '@/core/calls/CallsOperationGuardService.js';
import SessionCreate from '@/server/api/endpoints/calls/media/session-create.js';
import CredentialRefresh from '@/server/api/endpoints/calls/media/credential-refresh.js';
import { CallsMediaCredentialService } from '@/core/calls/CallsMediaCredentialService.js';
import { StaleCallsConnectionError } from '@/core/calls/CallsLiveConnectionService.js';
import { CallsFeatureDisabledError, CallsRoomError } from '@/core/calls/CallsRoomService.js';
import { CallsEntityService } from '@/core/entities/CallsEntityService.js';
import RoomsList from '@/server/api/endpoints/calls/rooms/list.js';
import RoomsShow from '@/server/api/endpoints/calls/rooms/show.js';
import ActiveRooms from '@/server/api/endpoints/calls/users/active-rooms.js';
import type { Config } from '@/config.js';
import type { MiLocalUser } from '@/models/User.js';

test.each(['list', 'active'] as const)('maps disabled Calls for %s without an internal server error', async kind => {
	const service = {
		listDiscoverable: vi.fn().mockRejectedValue(new CallsFeatureDisabledError()),
		listActiveRoomsForUsers: vi.fn().mockRejectedValue(new CallsFeatureDisabledError()),
	};
	const endpoint = kind === 'list' ? new RoomsList(service as never, {} as never) : new ActiveRooms(service as never);
	await expect(endpoint.exec({ userIds: ['usera'] }, { id: 'usera' } as MiLocalUser, null)).rejects.toMatchObject({ code: 'CALLS_FEATURE_DISABLED' });
});

test.each([
	['service', 'CALLS_CONNECTION_EXISTS'],
	['guard', 'CALLS_OPERATION_IN_PROGRESS'],
])('maps asynchronous %s failures to the declared Calls API error', async (source, code) => {
	const error = source === 'service' ? new CallsConnectionExistsError() : new CallsOperationInProgressError();
	const service = { createSession: vi.fn().mockRejectedValue(error) };
	const guard = { execute: async (_scope: unknown, operation: () => Promise<unknown>) => {
		if (source === 'guard') throw error;
		return operation();
	} };
	const endpoint = new SessionCreate(service as never, { issue: vi.fn() } as never, guard as never);
	await expect(endpoint.exec({ roomId: 'rooma', connectionId: 'connection-a', operationId: 'operation-a' }, { id: 'usera' } as MiLocalUser, null)).rejects.toMatchObject({ code });
});

test('renews an expired credential only while its connection is current', async () => {
	const credentials = new CallsMediaCredentialService({ url: 'https://misskey.example', cloudflareRealtime: { appSecret: 'test-secret' } } as Config);
	const claims = { userId: 'usera', applicationId: 'first-party:usera', roomId: 'rooma', participantId: 'participanta', connectionId: 'connection-a', generation: 1, canPublish: true };
	const issuedAt = Date.now() - 301_000;
	const clock = vi.spyOn(Date, 'now').mockReturnValue(issuedAt);
	const credential = credentials.issue(claims).credential;
	clock.mockRestore();
	const connections = { assertCurrent: vi.fn().mockResolvedValue({}) };
	const guard = { execute: (_scope: unknown, operation: () => Promise<unknown>) => operation() };
	const endpoint = new CredentialRefresh(credentials, { reconcile: vi.fn().mockResolvedValue({}) } as never, guard as never, connections as never);
	const input = { ...claims, operationId: 'refresh-a', mediaCredential: credential };
	const result = await endpoint.exec(input, { id: claims.userId } as MiLocalUser, null);
	expect(credentials.verify(result.mediaCredential, claims)).toMatchObject(claims);
	expect(connections.assertCurrent).toHaveBeenCalledWith(claims.participantId, claims.connectionId, claims.generation);
	connections.assertCurrent.mockRejectedValue(new StaleCallsConnectionError());
	await expect(endpoint.exec(input, { id: claims.userId } as MiLocalUser, null)).rejects.toMatchObject({ code: 'CALLS_STALE_CONNECTION' });
});

test('includes participant UserLite data and follow relations in a room snapshot', async () => {
	const joinedAt = new Date('2026-01-01T00:00:00.000Z');
	const room = {
		id: 'rooma', attachmentType: 'personal', ownerUserId: 'user-a', chatRoomId: null,
		title: 'Room', description: '', moderatorUserIds: [], mode: 'open', visibility: 'public', state: 'open',
		scheduledAt: null, startedAt: joinedAt, endedAt: null, revision: 1, createdAt: joinedAt, updatedAt: joinedAt,
	};
	const participant = {
		id: 'participanta', roomId: 'rooma', userId: 'user-a', role: 'listener', state: 'active', isMuted: false,
		joinedAt, leftAt: null, speakerRequestedAt: null,
	};
	const liteUser = { id: 'user-a', username: 'alice', avatarUrl: 'https://example.com/avatar.png' };
	const userEntityService = {
		packMany: vi.fn().mockResolvedValue([liteUser]),
		getRelations: vi.fn().mockResolvedValue(new Map([['user-a', { isFollowing: true, isFollowed: false }]])),
	};
	const callsEntityService = new CallsEntityService(userEntityService as never);
	const callsRoomService = { snapshot: vi.fn().mockResolvedValue({ room, participants: [participant] }) };
	const endpoint = new RoomsShow(callsRoomService as never, callsEntityService);
	const result = await endpoint.exec({ roomId: 'rooma' }, { id: 'viewer' } as MiLocalUser, null);

	expect(result.participants).toEqual([{
		id: participant.id,
		roomId: participant.roomId,
		userId: participant.userId,
		role: participant.role,
		state: participant.state,
		isMuted: participant.isMuted,
		joinedAt: joinedAt.toISOString(),
		leftAt: null,
		speakerRequestedAt: null,
		user: { ...liteUser, isFollowing: true, isFollowed: false },
	}]);
	expect(userEntityService.packMany).toHaveBeenCalledWith(['user-a'], { id: 'viewer' }, { schema: 'UserLite' });
	expect(userEntityService.getRelations).toHaveBeenCalledWith('viewer', ['user-a']);
});

test('does not load participant users when a room snapshot is denied', async () => {
	const callsRoomService = { snapshot: vi.fn().mockRejectedValue(new CallsRoomError('access-denied')) };
	const callsEntityService = { packRoom: vi.fn(), packParticipants: vi.fn() };
	const endpoint = new RoomsShow(callsRoomService as never, callsEntityService as never);

	await expect(endpoint.exec({ roomId: 'rooma' }, { id: 'viewer' } as MiLocalUser, null)).rejects.toMatchObject({ code: 'CALLS_ACCESS_DENIED' });
	expect(callsEntityService.packParticipants).not.toHaveBeenCalled();
});
