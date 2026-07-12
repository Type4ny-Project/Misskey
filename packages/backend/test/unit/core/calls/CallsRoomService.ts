/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import type { MiCallsRoom, MiUser } from '@/models/_.js';
import { CallsFeatureDisabledError, CallsRoomError, CallsRoomService, isCallsRoomTransitionAllowed } from '@/core/calls/CallsRoomService.js';

function createAccessFixture(options?: { enabled?: boolean; chatMember?: boolean; followings?: Record<string, unknown> }) {
	const chatRooms = { findOneBy: async () => ({ id: 'chat-a' }) };
	const cache = { userFollowingsCache: { fetch: async () => options?.followings ?? {} } };
	const chat = { isRoomMember: async () => options?.chatMember ?? false };
	const role = { isModerator: async () => false };
	const service = new CallsRoomService(
		{ cloudflareRealtime: options?.enabled === false ? undefined : { enabled: true } } as Config,
		{} as never, {} as never, {} as never, chatRooms as never, cache as never, chat as never,
		{} as never, role as never, {} as never, {} as never, {} as never, {} as never,
	);
	return service;
}

const viewer = { id: 'viewer-a', host: null } as MiUser;
const baseRoom = { id: 'room-a', ownerUserId: 'owner-a', attachmentType: 'personal', visibility: 'specified', visibleUserIds: [] } as unknown as MiCallsRoom;

describe('CallsRoomService lifecycle', () => {
	test.each([
		['scheduled', 'open'],
		['scheduled', 'cancelled'],
		['open', 'ended'],
	] as const)('allows %s -> %s', (from, to) => {
		expect(isCallsRoomTransitionAllowed(from, to)).toBe(true);
	});

	test.each([
		['scheduled', 'ended'],
		['open', 'cancelled'],
		['ended', 'open'],
		['cancelled', 'open'],
		['ended', 'ended'],
	] as const)('rejects terminal or invalid %s -> %s', (from, to) => {
		expect(isCallsRoomTransitionAllowed(from, to)).toBe(false);
	});

	test('ends a stale open room without live connections before creating another room for the attachment', async () => {
		const staleRoom = {
			id: 'room-stale', attachmentType: 'personal', ownerUserId: 'owner-a', chatRoomId: null,
			state: 'open', revision: 3, updatedAt: new Date(Date.now() - 120_000),
		} as MiCallsRoom;
		const insertedRoom = { ...staleRoom, id: 'room-next', state: 'scheduled', revision: 0 } as MiCallsRoom;
		const roomInsert = vi.fn(async () => insertedRoom);
		const participantUpdate = vi.fn(async () => undefined);
		const queryBuilder = {
			update: () => queryBuilder,
			set: () => queryBuilder,
			where: () => queryBuilder,
			returning: () => queryBuilder,
			execute: async () => ({ affected: 1, raw: [{ ...staleRoom, state: 'ended', revision: 4 }] }),
		};
		const roomRepository = { createQueryBuilder: () => queryBuilder };
		const transactionManager = {
			getRepository: (entity: { name: string }) => entity.name === 'MiCallsRoom' ? roomRepository : { update: participantUpdate },
		};
		const service = new CallsRoomService(
			{ cloudflareRealtime: { enabled: true } } as Config,
			{ findOneBy: async () => staleRoom, insertOne: roomInsert, manager: { transaction: async (callback: (manager: typeof transactionManager) => Promise<unknown>) => callback(transactionManager) } } as never,
			{ findBy: async () => [{ id: 'participant-host' }], update: participantUpdate, insertOne: async () => ({}) } as never,
			{} as never, {} as never, {} as never, {} as never, { gen: () => 'generated-id' } as never,
			{ isModerator: async () => false } as never, { hasAny: async () => false, withRoomLock: async (_roomId: string, callback: (assertHeld: () => Promise<void>) => Promise<unknown>) => callback(async () => undefined) } as never,
			{ publish: async () => undefined, publishRoomsList: () => undefined } as never,
			{ revokeRoom: async () => undefined } as never, { lifecycle: () => undefined } as never,
		);

		await expect(service.create({ id: 'owner-a', host: null } as MiUser, {
			attachmentType: 'personal', title: 'Next room', visibility: 'public',
		})).resolves.toBe(insertedRoom);
		expect(participantUpdate).toHaveBeenCalledWith(
			{ roomId: staleRoom.id, state: 'active' },
			expect.objectContaining({ state: 'left', isMuted: true }),
		);
		expect(roomInsert).toHaveBeenCalledOnce();
	});
});

describe('CallsRoomService access', () => {
	test('enforces the explicit specified audience without using participant history', async () => {
		await expect(createAccessFixture().assertCanAccess(viewer, baseRoom)).rejects.toMatchObject({ code: 'access-denied' } satisfies Partial<CallsRoomError>);
		await expect(createAccessFixture().assertCanAccess(viewer, { ...baseRoom, visibleUserIds: [viewer.id] })).resolves.toBeUndefined();
	});

	test('accepts public rooms and an actual follower of the owner', async () => {
		await expect(createAccessFixture().assertCanAccess(viewer, { ...baseRoom, visibility: 'public' })).resolves.toBeUndefined();
		await expect(createAccessFixture({ followings: { 'owner-a': {} } }).assertCanAccess(viewer, { ...baseRoom, visibility: 'followers' })).resolves.toBeUndefined();
	});

	test('checks current ChatRoom membership on every access decision', async () => {
		const chatRoom = { ...baseRoom, attachmentType: 'chatRoom', chatRoomId: 'chat-a' } as MiCallsRoom;
		await expect(createAccessFixture({ chatMember: false }).assertCanAccess(viewer, chatRoom)).rejects.toMatchObject({ code: 'access-denied' } satisfies Partial<CallsRoomError>);
		await expect(createAccessFixture({ chatMember: true }).assertCanAccess(viewer, chatRoom)).resolves.toBeUndefined();
	});

	test('feature flag rejects Calls access before room visibility is evaluated', async () => {
		await expect(createAccessFixture({ enabled: false }).assertCanAccess(viewer, { ...baseRoom, visibility: 'public' })).rejects.toBeInstanceOf(CallsFeatureDisabledError);
	});
});
