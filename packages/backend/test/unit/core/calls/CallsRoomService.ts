/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
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
		{} as never, role as never, {} as never, {} as never, {} as never,
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
