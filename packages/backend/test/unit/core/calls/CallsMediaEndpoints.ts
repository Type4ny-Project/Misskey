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
import { CallsFeatureDisabledError } from '@/core/calls/CallsRoomService.js';
import RoomsList from '@/server/api/endpoints/calls/rooms/list.js';
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
