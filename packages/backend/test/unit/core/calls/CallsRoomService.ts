/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { QueryFailedError } from 'typeorm';
import { DEFAULT_POLICIES } from '@/core/RoleService.js';
import type { Config } from '@/config.js';
import type { MiCallsRoom, MiUser } from '@/models/_.js';
import { MiChannel } from '@/models/Channel.js';
import { CallsMediaRevocationService } from '@/core/calls/CallsMediaRevocationService.js';
import { CallsFeatureDisabledError, CallsRoomError, CallsRoomService, isCallsRoomTransitionAllowed } from '@/core/calls/CallsRoomService.js';

function createAccessFixture(options?: { enabled?: boolean; chatMember?: boolean; followings?: Record<string, unknown> }) {
	const chatRooms = { findOneBy: async () => ({ id: 'chat-a' }) };
	const cache = { userFollowingsCache: { fetch: async () => options?.followings ?? {} } };
	const chat = { isRoomMember: async () => options?.chatMember ?? false };
	const role = { isModerator: async () => false, getUserPolicies: async () => ({ ...DEFAULT_POLICIES }) };
	const service = new CallsRoomService(
		{ cloudflareRealtime: options?.enabled === false ? undefined : { enabled: true } } as Config,
		{} as never, {} as never, {} as never, chatRooms as never, cache as never, chat as never,
		{} as never, role as never, {} as never, {} as never, {} as never, {} as never,
		{} as never, {} as never,
	);
	return service;
}

const viewer = { id: 'viewer-a', host: null } as MiUser;
const baseRoom = { id: 'room-a', ownerUserId: 'owner-a', attachmentType: 'personal', visibility: 'specified', visibleUserIds: [], moderatorUserIds: [] } as unknown as MiCallsRoom;

function createConnectionFixture(role: 'host' | 'listener') {
	const room = { ...baseRoom, state: 'open', revision: 1 } as MiCallsRoom;
	const participant = { id: 'participant-a', roomId: room.id, userId: 'owner-a', role, state: 'active' };
	const update = vi.fn();
	const execute = vi.fn(async () => ({ affected: 1, raw: [{ ...room, state: 'ended', revision: 2 }] }));
	const queryBuilder = { update: () => queryBuilder, set: () => queryBuilder, where: () => queryBuilder, returning: () => queryBuilder, execute };
	const live = { removeHostDeadline: vi.fn(), clear: vi.fn().mockResolvedValue(true), isReconnectTokenConsumed: vi.fn().mockResolvedValue(false), get: vi.fn().mockResolvedValue({ connectionId: 'new-device', generation: 2 }), withRoomLock: async (_roomId: string, callback: () => Promise<unknown>) => callback() };
	const revokeRoom = vi.fn();
	const revokeParticipant = vi.fn();
	const revokeDisconnectedGeneration = vi.fn().mockResolvedValue({ participantId: 'participant-a', generation: 2 });
	const service = new CallsRoomService(
		{ cloudflareRealtime: { enabled: true } } as Config,
		{ findOneBy: async () => room, createQueryBuilder: () => queryBuilder } as never,
		{ findOneBy: async () => participant, update } as never,
		{} as never, {} as never, {} as never, {} as never, {} as never,
		{ isModerator: async () => false, getUserPolicies: async () => ({ ...DEFAULT_POLICIES }) } as never, live as never,
		{ publish: vi.fn(), publishRoomsList: vi.fn() } as never,
		{ revokeRoom, revokeParticipant, revokeDisconnectedGeneration, closeGeneration: vi.fn() } as never, { lifecycle: vi.fn() } as never,
		{} as never, {} as never,
	);
	return { service, room, live, update, execute, revokeRoom, revokeParticipant, revokeDisconnectedGeneration };
}

describe('CallsRoomService lifecycle', () => {
	test.each(['public', 'followers', 'specified'] as const)('creates a hidden chat channel only for public Calls (visibility: %s)', async visibility => {
		const service = createAccessFixture();
		const saveChannel = vi.fn(async (channel: object) => channel);
		const saveRoom = vi.fn(async (room: object) => room);
		const saveParticipant = vi.fn();
		const followOrRequest = vi.fn();
		Object.assign(service, {
			callsRoomsRepository: { target: 'rooms', findOneBy: async () => null, manager: {
				transaction: async (callback: (manager: unknown) => Promise<unknown>) => callback({
					getRepository: (target: unknown) => ({ save: target === MiChannel ? saveChannel : target === 'rooms' ? saveRoom : saveParticipant }),
				}),
			} },
			channelsRepository: { findOneByOrFail: async () => ({ id: 'created' }) },
			channelFollowingService: { followOrRequest },
			idService: { gen: () => 'created' },
			callsEventService: { publishRoomsList: vi.fn() },
			callsTelemetryService: { lifecycle: vi.fn() },
		});
		const room = await service.create(viewer, { attachmentType: 'personal', title: 'Call chat', visibility });
		expect(room.channelId).toBe(visibility === 'public' ? 'created' : null);
		if (visibility === 'public') {
			expect(saveChannel).toHaveBeenCalledWith(expect.objectContaining({ name: 'Call chat', isUnlisted: true, isLocalOnly: true, allowRenoteToExternal: false }));
			expect(followOrRequest).toHaveBeenCalledWith(viewer, { id: 'created' }, true);
		} else {
			expect(saveChannel).not.toHaveBeenCalled();
			expect(followOrRequest).not.toHaveBeenCalled();
		}
		expect(saveParticipant).toHaveBeenCalledWith(expect.objectContaining({ role: 'host', userId: viewer.id }));
	});

	test.each([false, true])('automatically follows the Calls channel when a listener joins, including reconnects (active: %s)', async active => {
		const service = createAccessFixture();
		const room = { ...baseRoom, state: 'open', mode: 'stage', visibility: 'public', channelId: 'channel-a' };
		const participant = { id: 'listener-a', role: 'listener', state: 'active' };
		const followOrRequest = vi.fn().mockResolvedValue(active ? 'alreadyFollowing' : 'following');
		const builder = { update: () => builder, set: () => builder, where: () => builder, returning: () => builder, execute: async () => ({ affected: 1, raw: [{ revision: 1 }] }) };
		Object.assign(service, {
			callsRoomsRepository: { findOneBy: async () => room, createQueryBuilder: () => builder },
			callsParticipantsRepository: { findOneBy: async () => active ? participant : null, findBy: async () => [], insertOne: async () => participant },
			channelsRepository: { findOneByOrFail: async () => ({ id: room.channelId }) },
			channelFollowingService: { followOrRequest },
			callsLiveConnectionService: { withRoomLock: async (_roomId: string, callback: () => Promise<unknown>) => callback() },
			idService: { gen: () => participant.id },
			callsEventService: { publish: vi.fn() },
			callsTelemetryService: { lifecycle: vi.fn() },
		});
		await expect(service.join(viewer, room.id)).resolves.toMatchObject({ role: 'listener' });
		expect(followOrRequest).toHaveBeenCalledWith(viewer, { id: room.channelId }, true);
	});

	test('filters followed hosts and active participants before limiting rooms, preserving access checks', async () => {
		const service = createAccessFixture({ followings: { 'followed-host': {}, 'followed-listener': {} } });
		const hosted = { ...baseRoom, id: 'hosted', ownerUserId: 'followed-host', state: 'open', visibility: 'public' };
		const attended = { ...baseRoom, id: 'attended', state: 'open', visibility: 'public' };
		const privateRoom = { ...baseRoom, id: 'private', state: 'open' };
		const find = vi.fn().mockResolvedValue([hosted, attended, privateRoom]);
		const findBy = vi.fn().mockResolvedValue([{ roomId: 'attended' }, { roomId: 'private' }]);
		Object.assign(service, { callsRoomsRepository: { find }, callsParticipantsRepository: { findBy } });
		await expect(service.listDiscoverable(viewer, 10, undefined, ['open'], true)).resolves.toEqual([hosted, attended]);
		expect(findBy).toHaveBeenCalledWith({ userId: expect.objectContaining({ _value: ['followed-host', 'followed-listener'] }), state: 'active' });
		expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: [
			expect.objectContaining({ ownerUserId: expect.objectContaining({ _value: ['followed-host', 'followed-listener'] }) }),
			expect.objectContaining({ id: expect.objectContaining({ _value: ['attended', 'private'] }) }),
		] }));
	});

	test('returns no followed rooms when the viewer follows nobody', async () => {
		const service = createAccessFixture();
		await expect(service.listDiscoverable(viewer, 10, undefined, ['open'], true)).resolves.toEqual([]);
	});

	test('the background check ends an absent host room at 90 seconds and stops at shutdown', async () => {
		vi.useFakeTimers();
		const fixture = createConnectionFixture('host');
		let deadline = Date.now() + 90_000;
		Object.assign(fixture.service, {
			callsRoomsRepository: { findBy: async () => [fixture.room], findOneBy: async () => fixture.room, createQueryBuilder: () => {
				const builder = { update: () => builder, set: () => builder, where: () => builder, returning: () => builder, execute: fixture.execute };
				return builder;
			} },
			callsLiveConnectionService: { ...fixture.live,
				touchHost: async () => { deadline = Date.now() + 90_000; },
				expiredHostRooms: async () => Date.now() >= deadline ? [fixture.room.id] : [],
				getHostDeadline: async () => deadline,
			},
		});
		try {
			await fixture.service.onModuleInit();
			await vi.advanceTimersByTimeAsync(89_999);
			expect(fixture.execute).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(fixture.execute).toHaveBeenCalledOnce();
			fixture.service.onApplicationShutdown();
			await vi.advanceTimersByTimeAsync(1000);
			expect(fixture.execute).toHaveBeenCalledOnce();
		} finally { fixture.service.onApplicationShutdown(); vi.useRealTimers(); }
	});

	test.each([false, true])('ends the room after the host timeout unless a heartbeat renewed it (renewed: %s)', async renewed => {
		const fixture = createConnectionFixture('host');
		Object.assign(fixture.service, {
			callsLiveConnectionService: {
				...fixture.live,
				expiredHostRooms: async () => [fixture.room.id],
				getHostDeadline: async () => Date.now() + (renewed ? 90_000 : 0),
			},
		});
		await fixture.service.endRoomsWithExpiredHosts();
		if (renewed) {
			expect(fixture.execute).not.toHaveBeenCalled();
			expect(fixture.revokeRoom).not.toHaveBeenCalled();
		} else {
			expect(fixture.execute).toHaveBeenCalledOnce();
			expect(fixture.revokeRoom).toHaveBeenCalledWith(fixture.room.id, 2, 'room-ended');
			expect(fixture.update).toHaveBeenCalledWith({ roomId: fixture.room.id, state: 'active' }, expect.objectContaining({ state: 'left' }));
		}
	});

	test.each(['personal', 'chatRoom'] as const)('only allows personal Calls creation (attachment: %s)', async attachmentType => {
		const insertRoom = vi.fn(async (room: Partial<MiCallsRoom>) => room);
		const insertParticipant = vi.fn();
		const service = new CallsRoomService(
			{ cloudflareRealtime: { enabled: true } } as Config,
			{ findOneBy: async () => null, target: 'rooms', manager: { transaction: async (callback: (manager: unknown) => Promise<unknown>) => callback({ getRepository: (target: string) => ({ save: target === 'rooms' ? insertRoom : insertParticipant }) }) } } as never,
			{ insertOne: insertParticipant } as never,
			{} as never, {} as never, {} as never, {} as never, { gen: () => 'created-a' } as never,
			{ getUserPolicies: async () => ({ ...DEFAULT_POLICIES }) } as never, {} as never, { publishRoomsList: vi.fn() } as never, {} as never, { lifecycle: vi.fn() } as never,
			{} as never, {} as never,
		);
		const operation = service.create(viewer, { attachmentType, chatRoomId: 'chat-a', title: 'Call' });
		if (attachmentType === 'chatRoom') {
			await expect(operation).rejects.toBeInstanceOf(CallsFeatureDisabledError);
			expect(insertRoom).not.toHaveBeenCalled();
			expect(insertParticipant).not.toHaveBeenCalled();
		} else {
			await expect(operation).resolves.toMatchObject({ attachmentType: 'personal', chatRoomId: null });
			expect(insertParticipant).toHaveBeenCalled();
		}
	});

	test.each([
		{ mode: 'open', count: 8, limit: 8, allowed: false, role: 'speaker' },
		{ mode: 'stage', count: 100, limit: 100, allowed: false, role: 'listener' },
		{ mode: 'open', count: 8, limit: 0, allowed: true, role: 'speaker' },
		{ mode: 'stage', count: 100, limit: 0, allowed: true, role: 'listener' },
		{ mode: 'open', count: 8, limit: 9, allowed: true, role: 'speaker' },
	])('applies the owner’s $limit limit to $count connected participants in $mode', async ({ mode, count, limit, allowed, role }) => {
		const room = { ...baseRoom, visibility: 'public', state: 'open', mode };
		const candidates = Array.from({ length: count }, (_, index) => ({ id: `participant-${index}`, joinedAt: new Date(Date.now() - 120_000) }));
		const participants = { findOneBy: vi.fn().mockResolvedValue(null), findBy: vi.fn().mockResolvedValue(candidates), insertOne: vi.fn().mockResolvedValue({ id: 'joined' }) };
		const builder = { update: () => builder, set: () => builder, where: () => builder, returning: () => builder, execute: async () => ({ affected: 1, raw: [{ revision: 2 }] }) };
		const service = new CallsRoomService(
			{ cloudflareRealtime: { enabled: true } } as Config,
			{ findOneBy: async () => room, createQueryBuilder: () => builder } as never, participants as never,
			{} as never, {} as never, {} as never, {} as never, { gen: () => 'joined' } as never,
			{ isModerator: async () => false, getUserPolicies: async (id: string) => ({ ...DEFAULT_POLICIES, callsRoomSpeakerLimit: id === room.ownerUserId ? limit : 0, callsRoomListenerLimit: id === room.ownerUserId ? limit : 0 }) } as never,
			{ withRoomLock: async (_roomId: string, callback: () => Promise<unknown>) => callback(), get: async () => ({}) } as never,
			{ publish: vi.fn() } as never, {} as never, { lifecycle: vi.fn() } as never,
			{} as never, {} as never,
		);
		const operation = service.join(viewer, room.id);
		if (allowed) {
			await expect(operation).resolves.toMatchObject({ id: 'joined' });
			expect(participants.insertOne).toHaveBeenCalledWith(expect.objectContaining({ role, state: 'active' }));
		} else {
			await expect(operation).rejects.toMatchObject({ code: 'room-full' });
			expect(participants.insertOne).not.toHaveBeenCalled();
		}
	});
	test.each(['host', 'listener'] as const)('an old %s device cannot end or leave the current call', async role => {
		const fixture = createConnectionFixture(role);
		const identity = { connectionId: 'old-device', generation: 1 };
		const user = { id: 'owner-a' } as MiUser;
		const operation = role === 'host' ? fixture.service.end(user, fixture.room.id, 1, identity) : fixture.service.leave(user, fixture.room.id, identity);
		await expect(operation).rejects.toMatchObject({ code: 'invalid-state' });
		expect(fixture.update).not.toHaveBeenCalled();
		expect(fixture.execute).not.toHaveBeenCalled();
		expect(fixture.revokeRoom).not.toHaveBeenCalled();
		expect(fixture.revokeParticipant).not.toHaveBeenCalled();
	});

	test.each(['host', 'listener'] as const)('the current %s device can end or leave the call', async role => {
		const fixture = createConnectionFixture(role);
		const identity = { connectionId: 'new-device', generation: 2 };
		const user = { id: 'owner-a' } as MiUser;
		if (role === 'host') {
			await fixture.service.end(user, fixture.room.id, 1, identity);
			expect(fixture.revokeRoom).toHaveBeenCalledWith(fixture.room.id, 2, 'room-ended');
		} else {
			await fixture.service.leave(user, fixture.room.id, identity);
			expect(fixture.update).toHaveBeenCalledWith('participant-a', expect.objectContaining({ state: 'left' }));
			expect(fixture.revokeParticipant).toHaveBeenCalled();
		}
	});
	test.each([false, true])('keeps the room open when the current host leaves (reconnect token: %s)', async reconnect => {
		const fixture = createConnectionFixture('host');
		const identity = { connectionId: 'new-device', generation: 2, ...(reconnect ? { token: crypto.randomUUID() } : {}) };
		await fixture.service.leave({ id: 'owner-a' } as MiUser, fixture.room.id, identity);
		expect(fixture.update).toHaveBeenCalledWith('participant-a', expect.objectContaining({ state: 'left' }));
		expect(fixture.revokeRoom).not.toHaveBeenCalled();
		expect(reconnect ? fixture.revokeDisconnectedGeneration : fixture.revokeParticipant).toHaveBeenCalled();
	});

	test('allows host recovery while the previous provider connection is still closing', async () => {
		const fixture = createConnectionFixture('host');
		let locked = false;
		fixture.live.withRoomLock = async (_roomId, callback) => {
			if (locked) throw new Error('Room is still locked');
			locked = true;
			try { return await callback(); } finally { locked = false; }
		};
		let finishClose!: () => void;
		const closeTracks = vi.fn(() => new Promise<void>(resolve => { finishClose = resolve; }));
		const publication = { providerSessionId: 'old-session', providerMid: '0', providerTrackName: 'old-track', applicationId: 'first-party' };
		const revocation = new CallsMediaRevocationService(
			{} as never, {} as never, fixture.live as never,
			{ listGenerationPublications: async () => [publication], listSubscriptions: async () => [], clearGeneration: vi.fn(), clearSubscriptions: vi.fn() } as never,
			{ closeTracks } as never, { publish: vi.fn() } as never,
			{ revokeParticipant: vi.fn() } as never,
			{ release: vi.fn(), releaseTrack: vi.fn() } as never,
		);
		Object.assign(fixture.service, { callsMediaRevocationService: revocation });
		const leaving = fixture.service.leave({ id: 'owner-a' } as MiUser, fixture.room.id, { connectionId: 'new-device', generation: 2, token: crypto.randomUUID() });
		await vi.waitFor(() => expect(closeTracks).toHaveBeenCalled());
		try {
			expect(locked).toBe(false);
			await expect(fixture.service.join({ id: 'owner-a', host: null } as MiUser, fixture.room.id)).resolves.toMatchObject({ role: 'host' });
		} finally {
			finishClose();
			await leaving;
		}
	});

	test('ignores a delayed host page-close from a replaced device', async () => {
		const fixture = createConnectionFixture('host');
		await fixture.service.leave({ id: 'owner-a' } as MiUser, fixture.room.id, { connectionId: 'old-device', generation: 1, token: crypto.randomUUID() });
		expect(fixture.revokeRoom).not.toHaveBeenCalled();
		expect(fixture.execute).not.toHaveBeenCalled();
	});

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

	test('keeps an existing attachment available for host recovery', async () => {
		const room = { ...baseRoom, state: 'open', revision: 3, updatedAt: new Date(Date.now() - 120_000) } as MiCallsRoom;
		const roomInsert = vi.fn();
		const service = new CallsRoomService(
			{ cloudflareRealtime: { enabled: true } } as Config,
			{ findOneBy: async () => room, find: async () => [room], insertOne: roomInsert } as never,
			{} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
			{ isModerator: async () => false, getUserPolicies: async () => ({ ...DEFAULT_POLICIES }) } as never, {} as never, {} as never, {} as never, {} as never,
			{} as never, {} as never,
		);
		const owner = { id: 'owner-a', host: null } as MiUser;
		await expect(service.create(owner, { attachmentType: 'personal', title: 'Next room' })).rejects.toMatchObject({ code: 'active-attachment' });
		expect(roomInsert).not.toHaveBeenCalled();
		await expect(service.listDiscoverable(owner, 100)).resolves.toEqual([room]);
	});

	test('restores the returning host without a reconnect token', async () => {
		const fixture = createConnectionFixture('host');
		const participant = { id: 'participant-a', role: 'host', state: 'left' };
		const update = vi.fn();
		Object.assign(fixture.service, {
			callsParticipantsRepository: { findOneBy: async () => participant, findBy: async () => [], update, findOneByOrFail: async () => ({ ...participant, role: 'host', state: 'active' }) },
		});
		await expect(fixture.service.join({ id: 'owner-a', host: null } as MiUser, fixture.room.id)).resolves.toMatchObject({ role: 'host', state: 'active' });
		expect(update).toHaveBeenCalledWith(participant.id, expect.objectContaining({ role: 'host', state: 'active' }));
	});

	test.each(['host', 'listener'] as const)('allows a %s to leave temporarily without ending the room', async role => {
		const participant = { id: 'participant-listener', roomId: 'room-a', userId: 'owner-a', role, state: 'active' };
		const participantUpdate = vi.fn(async () => undefined);
		let reconnectConsumed = false;
		const queryBuilder = {
			update: () => queryBuilder,
			set: () => queryBuilder,
			where: () => queryBuilder,
			returning: () => queryBuilder,
			execute: async () => ({ affected: 1, raw: [{ revision: 8 }] }),
		};
		const publish = vi.fn(async () => undefined);
		const connection = { participantId: participant.id, connectionId: 'connection-a', generation: 4, applicationId: 'first-party' };
		const revokeDisconnectedGeneration = vi.fn(async () => ({ participantId: 'participant-a', generation: 2 }));
		const service = new CallsRoomService(
			{ cloudflareRealtime: { enabled: true } } as Config,
			{ createQueryBuilder: () => queryBuilder } as never,
			{ findOneBy: async () => participant, update: participantUpdate } as never,
			{} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
			{ withRoomLock: async (_roomId: string, callback: () => Promise<unknown>) => callback(), isReconnectTokenConsumed: async () => reconnectConsumed, get: async () => connection, clear: async () => true } as never,
			{ publish } as never, { revokeDisconnectedGeneration, closeGeneration: vi.fn() } as never, { lifecycle: () => undefined } as never,
			{} as never, {} as never,
		);

		const reconnect = { token: crypto.randomUUID(), connectionId: connection.connectionId, generation: connection.generation };
		await expect(service.leave({ id: 'owner-a' } as MiUser, 'room-a', reconnect)).resolves.toBeUndefined();
		expect(participantUpdate).toHaveBeenCalledWith(participant.id, expect.objectContaining({ state: 'left' }));
		expect(publish).toHaveBeenCalledWith('room-a', 8, 'participant', { participantId: participant.id, action: 'left' });
		expect(revokeDisconnectedGeneration).toHaveBeenCalled();

		participantUpdate.mockClear();
		reconnectConsumed = true;
		await expect(service.leave({ id: 'owner-a' } as MiUser, 'room-a', reconnect)).resolves.toBeUndefined();
		expect(participantUpdate).not.toHaveBeenCalled();
	});
});

describe('CallsRoomService access', () => {
	test.each(['create', 'join'] as const)('rejects %s before changing room or participant state when the role disallows participation', async operation => {
		const fixture = createConnectionFixture('host');
		const getUserPolicies = vi.fn().mockResolvedValue({ canJoinCalls: false });
		Object.assign(fixture.service, { roleService: { getUserPolicies } });
		const user = { id: 'owner-a', host: null } as MiUser;
		await expect(operation === 'create'
			? fixture.service.create(user, { attachmentType: 'personal', title: 'Call' })
			: fixture.service.join(user, fixture.room.id)).rejects.toMatchObject({ code: 'access-denied' });
		expect(getUserPolicies).toHaveBeenCalledWith(user.id);
		expect(fixture.update).not.toHaveBeenCalled();
		expect(fixture.execute).not.toHaveBeenCalled();
	});

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

function createModerationFixture() {
	const room = { ...baseRoom, visibility: 'public', state: 'open', mode: 'stage', revision: 1, moderatorUserIds: ['moderator-a'] } as MiCallsRoom;
	const participant = { id: 'target-a', roomId: room.id, userId: 'target-user', role: 'speaker', isMuted: false, joinedAt: new Date() };
	const existsBy = vi.fn().mockResolvedValue(true);
	const update = vi.fn();
	const set = vi.fn((_values: Record<string, unknown>) => queryBuilder);
	const execute = vi.fn().mockResolvedValue({ affected: 1, raw: [{ ...room, revision: 2 }] });
	const queryBuilder = { update: () => queryBuilder, set, where: () => queryBuilder, returning: () => queryBuilder, execute };
	const revokeParticipant = vi.fn();
	const stopParticipantVideo = vi.fn();
	const insertLog = vi.fn((_entry: Record<string, unknown>) => undefined);
	const publish = vi.fn();
	const publishRoomsList = vi.fn();
	const config = { cloudflareRealtime: { enabled: true } } as Config;
	const isModerator = vi.fn().mockResolvedValue(false);
	const service = new CallsRoomService(
		config,
		{ findOneBy: async () => room, createQueryBuilder: () => queryBuilder } as never,
		{ findOneBy: async () => participant, findBy: async () => [], existsBy, update } as never,
		{ insert: insertLog } as never, {} as never, {} as never, {} as never,
		{ gen: () => 'log-a' } as never, { isModerator, getUserPolicies: async () => ({ ...DEFAULT_POLICIES }) } as never,
		{ withRoomLock: async (_roomId: string, callback: () => Promise<unknown>) => callback() } as never, { publish, publishRoomsList } as never, { revokeParticipant, stopParticipantVideo } as never, { lifecycle: vi.fn() } as never,
		{} as never, {} as never,
	);
	return { service, config, isModerator, room, participant, existsBy, update, set, execute, revokeParticipant, stopParticipantVideo, insertLog, publish, publishRoomsList };
}

describe('Calls room titles', () => {
	test.each(['scheduled', 'open'] as const)('the host can rename a %s room and notify viewers', async state => {
		const fixture = createModerationFixture();
		fixture.room.state = state;
		fixture.room.channelId = 'channel-a';
		const updateChannel = vi.fn();
		Object.assign(fixture.service, { channelsRepository: { update: updateChannel } });
		fixture.execute.mockResolvedValue({ affected: 1, raw: [{ ...fixture.room, title: 'New title', revision: 2 }] });
		await expect(fixture.service.updateTitle({ id: 'owner-a' } as MiUser, fixture.room.id, ' \u0000New title ', 1)).resolves.toMatchObject({ title: 'New title', revision: 2 });
		expect(updateChannel).toHaveBeenCalledWith('channel-a', { name: 'New title' });
		expect(fixture.set).toHaveBeenCalledWith(expect.objectContaining({ title: 'New title' }));
		expect(fixture.publish).toHaveBeenCalledWith(fixture.room.id, 2, 'title', { title: 'New title' });
		expect(fixture.publishRoomsList).toHaveBeenCalledWith('updated', { roomId: fixture.room.id, action: 'title' });
	});

	test.each(['viewer-a', 'moderator-a'])('%s cannot change the title', async id => {
		const fixture = createModerationFixture();
		await expect(fixture.service.updateTitle({ id } as MiUser, fixture.room.id, 'New title', 1)).rejects.toMatchObject({ code: 'access-denied' });
		expect(fixture.execute).not.toHaveBeenCalled();
	});

	test.each(['ended', 'cancelled'] as const)('a %s room cannot be renamed', async state => {
		const fixture = createModerationFixture();
		fixture.room.state = state;
		await expect(fixture.service.updateTitle({ id: 'owner-a' } as MiUser, fixture.room.id, 'New title', 1)).rejects.toMatchObject({ code: 'invalid-state' });
		expect(fixture.execute).not.toHaveBeenCalled();
	});

	test('rejects a title that is empty after sanitizing', async () => {
		const fixture = createModerationFixture();
		await expect(fixture.service.updateTitle({ id: 'owner-a' } as MiUser, fixture.room.id, ' \u0000 ', 1)).rejects.toMatchObject({ code: 'invalid-metadata' });
		expect(fixture.execute).not.toHaveBeenCalled();
	});

	test('a stale update does not publish a title change', async () => {
		const fixture = createModerationFixture();
		fixture.execute.mockResolvedValue({ affected: 0, raw: [] });
		await expect(fixture.service.updateTitle({ id: 'owner-a' } as MiUser, fixture.room.id, 'New title', 0)).rejects.toMatchObject({ code: 'stale-revision' });
		expect(fixture.publish).not.toHaveBeenCalled();
		expect(fixture.publishRoomsList).not.toHaveBeenCalled();
	});
});

describe('Calls VC moderators', () => {
	test.each(['owner-a', 'moderator-a'])('%s can mute a speaker without changing their role', async id => {
		const fixture = createModerationFixture();
		fixture.room.mode = id === 'owner-a' ? 'stage' : 'open';
		await fixture.service.muteParticipant({ id, host: null } as MiUser, fixture.room.id, fixture.participant.id, 1);
		expect(fixture.update).toHaveBeenCalledWith(fixture.participant.id, { isMuted: true, updatedAt: expect.any(Date) });
		expect(fixture.insertLog).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: id, action: 'mute', previousRole: 'speaker', nextRole: 'speaker', roomRevision: 2 }));
		expect(fixture.publish).toHaveBeenCalledWith(fixture.room.id, 2, 'mute', { participantId: fixture.participant.id, isMuted: true });
		expect(fixture.revokeParticipant).not.toHaveBeenCalled();
	});

	test.each(['camera', 'screen'] as const)('a VC moderator can stop a speaker’s %s', async mediaSource => {
		const fixture = createModerationFixture();
		await fixture.service.stopParticipantVideo({ id: 'moderator-a', host: null } as MiUser, fixture.room.id, fixture.participant.id, mediaSource, 1);
		expect(fixture.stopParticipantVideo).toHaveBeenCalledWith(fixture.participant, mediaSource, 2);
		expect(fixture.update).not.toHaveBeenCalled();
		expect(fixture.revokeParticipant).not.toHaveBeenCalled();
	});

	test('muting an already muted speaker resends the event without another mutation', async () => {
		const fixture = createModerationFixture();
		fixture.participant.isMuted = true;
		await fixture.service.muteParticipant({ id: 'moderator-a', host: null } as MiUser, fixture.room.id, fixture.participant.id, 1);
		expect(fixture.execute).not.toHaveBeenCalled();
		expect(fixture.publish).toHaveBeenCalledWith(fixture.room.id, 1, 'mute', { participantId: fixture.participant.id, isMuted: true });
		expect(fixture.update).not.toHaveBeenCalled();
		expect(fixture.insertLog).not.toHaveBeenCalled();
	});

	test('retries a failed mute notification after the database has been updated', async () => {
		const fixture = createModerationFixture();
		const actor = { id: 'owner-a', host: null } as MiUser;
		fixture.publish.mockRejectedValueOnce(new Error('publish failed'));
		fixture.update.mockImplementation(async () => { fixture.participant.isMuted = true; });
		await expect(fixture.service.muteParticipant(actor, fixture.room.id, fixture.participant.id, 1)).rejects.toThrow('publish failed');
		fixture.room.revision = 2;
		await fixture.service.muteParticipant(actor, fixture.room.id, fixture.participant.id, 2);
		expect(fixture.publish).toHaveBeenCalledTimes(2);
		expect(fixture.publish).toHaveBeenLastCalledWith(fixture.room.id, 2, 'mute', { participantId: fixture.participant.id, isMuted: true });
		expect(fixture.execute).toHaveBeenCalledTimes(1);
		expect(fixture.update).toHaveBeenCalledTimes(1);
		expect(fixture.insertLog).toHaveBeenCalledTimes(1);
	});

	test.each(['owner-a', 'global-moderator'])('disabled Calls rejects new media moderation by %s but permits removal', async id => {
		const fixture = createModerationFixture();
		fixture.config.cloudflareRealtime!.enabled = false;
		fixture.isModerator.mockResolvedValue(id === 'global-moderator');
		const actor = { id, host: null } as MiUser;
		await expect(fixture.service.muteParticipant(actor, fixture.room.id, fixture.participant.id, 1)).rejects.toBeInstanceOf(CallsFeatureDisabledError);
		await expect(fixture.service.stopParticipantVideo(actor, fixture.room.id, fixture.participant.id, 'camera', 1)).rejects.toBeInstanceOf(CallsFeatureDisabledError);
		expect(fixture.execute).not.toHaveBeenCalled();
		expect(fixture.update).not.toHaveBeenCalled();
		expect(fixture.insertLog).not.toHaveBeenCalled();
		expect(fixture.publish).not.toHaveBeenCalled();
		expect(fixture.stopParticipantVideo).not.toHaveBeenCalled();
		await fixture.service.removeParticipant(actor, fixture.room.id, fixture.participant.id, 1);
		expect(fixture.revokeParticipant).toHaveBeenCalledWith(fixture.participant, 2, 'moderation');
	});

	test.each(['ended', 'stale'] as const)('a %s room rejects microphone and video moderation', async reason => {
		const fixture = createModerationFixture();
		if (reason === 'ended') fixture.room.state = 'ended';
		else fixture.execute.mockResolvedValue({ affected: 0, raw: [] });
		const user = { id: 'moderator-a', host: null } as MiUser;
		const code = reason === 'ended' ? 'invalid-state' : 'stale-revision';
		await expect(fixture.service.muteParticipant(user, fixture.room.id, fixture.participant.id, 1)).rejects.toMatchObject({ code });
		await expect(fixture.service.stopParticipantVideo(user, fixture.room.id, fixture.participant.id, 'screen', 1)).rejects.toMatchObject({ code });
		expect(fixture.update).not.toHaveBeenCalled();
		expect(fixture.stopParticipantVideo).not.toHaveBeenCalled();
	});

	test.each([0, 8])('promotion respects a speaker limit of %i', async limit => {
		const fixture = createModerationFixture();
		fixture.participant.role = 'listener';
		Object.assign(fixture.service, {
			roleService: { getUserPolicies: async () => ({ ...DEFAULT_POLICIES, callsRoomSpeakerLimit: limit }) },
			callsParticipantsRepository: {
				findOneBy: async () => fixture.participant,
				findBy: async () => Array.from({ length: 8 }, (_, index) => ({ id: `speaker-${index}`, joinedAt: new Date() })),
				update: fixture.update,
				findOneByOrFail: async () => ({ ...fixture.participant, role: 'speaker' }),
			},
		});
		const operation = fixture.service.setRole({ id: 'owner-a' } as MiUser, fixture.room.id, fixture.participant.id, 'speaker', 1);
		if (limit === 0) {
			await expect(operation).resolves.toMatchObject({ role: 'speaker' });
			expect(fixture.publish).toHaveBeenCalledWith(fixture.room.id, 2, 'role', { participantId: fixture.participant.id, role: 'speaker' });
		} else {
			await expect(operation).rejects.toMatchObject({ code: 'room-full' });
			expect(fixture.update).not.toHaveBeenCalled();
		}
	});

	test('a host cannot promote a listener whose role disallows Calls', async () => {
		const fixture = createModerationFixture();
		fixture.participant.role = 'listener';
		Object.assign(fixture.service, { roleService: { getUserPolicies: async () => ({ ...DEFAULT_POLICIES, canJoinCalls: false }) } });
		await expect(fixture.service.setRole({ id: 'owner-a' } as MiUser, fixture.room.id, fixture.participant.id, 'speaker', 1)).rejects.toMatchObject({ code: 'access-denied' });
		expect(fixture.update).not.toHaveBeenCalled();
	});

	test.each([true, false])('the host can set moderator permission to %s', async isModerator => {
		const fixture = createModerationFixture();
		fixture.room.moderatorUserIds.push('target-user');
		await fixture.service.setModerator({ id: 'owner-a' } as MiUser, fixture.room.id, fixture.participant.id, isModerator, 1);
		expect(fixture.set).toHaveBeenCalledWith(expect.objectContaining({ moderatorUserIds: isModerator ? ['moderator-a', 'target-user'] : ['moderator-a'] }));
		expect(fixture.publish).toHaveBeenCalledWith(fixture.room.id, 2, 'participant', { participantId: fixture.participant.id, action: 'updated' });
	});

	test.each(['viewer-a', 'moderator-a'])('%s cannot appoint moderators, change speakers, or end the room', async id => {
		const fixture = createModerationFixture();
		const user = { id, host: null } as MiUser;
		await expect(fixture.service.setModerator(user, fixture.room.id, fixture.participant.id, true, 1)).rejects.toMatchObject({ code: 'access-denied' });
		await expect(fixture.service.setRole(user, fixture.room.id, fixture.participant.id, 'listener', 1)).rejects.toMatchObject({ code: 'access-denied' });
		await expect(fixture.service.end(user, fixture.room.id, 1)).rejects.toMatchObject({ code: 'access-denied' });
		expect(fixture.execute).not.toHaveBeenCalled();
	});

	test('an active VC moderator can kick a participant and revoke their media', async () => {
		const fixture = createModerationFixture();
		await fixture.service.removeParticipant({ id: 'moderator-a', host: null } as MiUser, fixture.room.id, fixture.participant.id, 1);
		expect(fixture.update).toHaveBeenCalledWith(fixture.participant.id, expect.objectContaining({ state: 'removed', isMuted: true }));
		expect(fixture.revokeParticipant).toHaveBeenCalledWith(fixture.participant, 2, 'moderation');
	});

	test.each(['ordinary', 'inactive', 'no-access'])('a %s participant cannot moderate other participants', async reason => {
		const fixture = createModerationFixture();
		if (reason === 'inactive') fixture.existsBy.mockResolvedValue(false);
		if (reason === 'no-access') fixture.room.visibility = 'specified';
		await expect(fixture.service.removeParticipant({ id: reason === 'ordinary' ? 'viewer-a' : 'moderator-a', host: null } as MiUser, fixture.room.id, fixture.participant.id, 1)).rejects.toMatchObject({ code: 'access-denied' });
		const user = { id: reason === 'ordinary' ? 'viewer-a' : 'moderator-a', host: null } as MiUser;
		await expect(fixture.service.muteParticipant(user, fixture.room.id, fixture.participant.id, 1)).rejects.toMatchObject({ code: 'access-denied' });
		await expect(fixture.service.stopParticipantVideo(user, fixture.room.id, fixture.participant.id, 'camera', 1)).rejects.toMatchObject({ code: 'access-denied' });
		expect(fixture.update).not.toHaveBeenCalled();
		expect(fixture.stopParticipantVideo).not.toHaveBeenCalled();
	});

	test('a VC moderator cannot kick or stop the host’s media', async () => {
		const fixture = createModerationFixture();
		fixture.participant.role = 'host';
		await expect(fixture.service.removeParticipant({ id: 'moderator-a', host: null } as MiUser, fixture.room.id, fixture.participant.id, 1)).rejects.toMatchObject({ code: 'participant-not-found' });
		const user = { id: 'moderator-a', host: null } as MiUser;
		await expect(fixture.service.muteParticipant(user, fixture.room.id, fixture.participant.id, 1)).rejects.toMatchObject({ code: 'participant-not-found' });
		await expect(fixture.service.stopParticipantVideo(user, fixture.room.id, fixture.participant.id, 'screen', 1)).rejects.toMatchObject({ code: 'participant-not-found' });
		expect(fixture.update).not.toHaveBeenCalled();
		expect(fixture.stopParticipantVideo).not.toHaveBeenCalled();
	});

	test('a stale moderator assignment does not change permissions', async () => {
		const fixture = createModerationFixture();
		fixture.execute.mockResolvedValue({ affected: 0, raw: [] });
		await expect(fixture.service.setModerator({ id: 'owner-a' } as MiUser, fixture.room.id, fixture.participant.id, true, 0)).rejects.toMatchObject({ code: 'stale-revision' });
		expect(fixture.publish).not.toHaveBeenCalled();
	});
});

function createHostTransferFixture(role: 'speaker' | 'listener' = 'speaker') {
	const fixture = createModerationFixture();
	Object.assign(fixture.participant, { role, state: 'active', speakerRequestedAt: new Date() });
	const rooms = { findOneBy: async () => fixture.room, createQueryBuilder: () => builder };
	const participants = { findOneBy: vi.fn().mockResolvedValue(fixture.participant), findOneByOrFail: async () => ({ id: 'former-host-a', role: 'speaker' }), findBy: async () => [fixture.participant], update: fixture.update };
	fixture.update.mockResolvedValue({ affected: 1 });
	const logs = { insert: fixture.insertLog, existsBy: vi.fn(async (criteria: Record<string, unknown>) => fixture.insertLog.mock.calls.some(([entry]) => Object.entries(criteria).every(([key, value]) => entry[key] === value))) };
	const where = vi.fn(() => builder);
	const builder = { update: () => builder, set: fixture.set, where, returning: () => builder, execute: fixture.execute };
	// The room builder's set method must continue with this transaction's builder.
	fixture.set.mockImplementation(() => builder);
	fixture.execute.mockImplementation(async () => ({ affected: 1, raw: [Object.assign(fixture.room, fixture.set.mock.calls[0][0], { revision: 2 })] }));
	const transaction = vi.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback({ getRepository: (target: string) => target === 'rooms' ? rooms : target === 'participants' ? participants : logs }));
	const touchHost = vi.fn();
	Object.assign(fixture.service, {
		callsRoomsRepository: { target: 'rooms', manager: { transaction } },
		callsParticipantsRepository: { target: 'participants' },
		callsModerationLogsRepository: { target: 'logs' },
		callsLiveConnectionService: { withRoomLock: async (_roomId: string, callback: () => Promise<unknown>) => callback(), touchHost },
	});
	return { ...fixture, participants, transaction, touchHost, where };
}

describe('Calls host transfer', () => {
	test('rejects a target whose Calls participation permission was revoked', async () => {
		const fixture = createHostTransferFixture();
		Object.assign(fixture.service, { roleService: { getUserPolicies: async () => ({ ...DEFAULT_POLICIES, canJoinCalls: false }) } });
		await expect(fixture.service.transferHost({ id: 'owner-a' } as MiUser, fixture.room.id, fixture.participant.id, 1)).rejects.toMatchObject({ code: 'access-denied' });
		expect(fixture.execute).not.toHaveBeenCalled();
		expect(fixture.update).not.toHaveBeenCalled();
		expect(fixture.insertLog).not.toHaveBeenCalled();
	});

	test.each(['deadline', 'role', 'participant'])('retries the committed transfer after %s notification failure without changing ownership again', async failure => {
		const fixture = createHostTransferFixture();
		if (failure === 'deadline') fixture.touchHost.mockRejectedValueOnce(new Error('Redis unavailable'));
		if (failure === 'role') fixture.publish.mockRejectedValueOnce(new Error('Redis unavailable'));
		if (failure === 'participant') fixture.publish.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Redis unavailable'));
		const actor = { id: 'owner-a' } as MiUser;
		await expect(fixture.service.transferHost(actor, fixture.room.id, fixture.participant.id, 1)).rejects.toThrow('Redis unavailable');
		fixture.participant.role = 'host';
		fixture.execute.mockClear();
		fixture.update.mockClear();
		fixture.publish.mockClear();
		await expect(fixture.service.transferHost(actor, fixture.room.id, fixture.participant.id, 1)).resolves.toMatchObject({ ownerUserId: fixture.participant.userId, revision: 2 });
		expect(fixture.execute).not.toHaveBeenCalled();
		expect(fixture.update).not.toHaveBeenCalled();
		expect(fixture.insertLog).toHaveBeenCalledTimes(1);
		expect(fixture.publish.mock.calls).toEqual([
			[fixture.room.id, 2, 'role', { participantId: 'former-host-a', role: 'speaker' }],
			[fixture.room.id, 2, 'participant', { participantId: fixture.participant.id, action: 'updated' }],
		]);
	});

	test.each(['actor', 'revision'])('a retry requires the original %s', async changed => {
		const fixture = createHostTransferFixture();
		await fixture.service.transferHost({ id: 'owner-a' } as MiUser, fixture.room.id, fixture.participant.id, 1);
		fixture.participant.role = 'host';
		fixture.publish.mockClear();
		await expect(fixture.service.transferHost({ id: changed === 'actor' ? 'viewer-a' : 'owner-a' } as MiUser, fixture.room.id, fixture.participant.id, changed === 'revision' ? 2 : 1)).rejects.toMatchObject({ code: 'access-denied' });
		expect(fixture.publish).not.toHaveBeenCalled();
	});

	test('aborts the transaction if the selected participant has left', async () => {
		const fixture = createHostTransferFixture();
		fixture.update.mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 });
		await expect(fixture.service.transferHost({ id: 'owner-a' } as MiUser, fixture.room.id, fixture.participant.id, 1)).rejects.toMatchObject({ code: 'participant-not-found' });
		expect(fixture.insertLog).not.toHaveBeenCalled();
		expect(fixture.publish).not.toHaveBeenCalled();
	});

	test.each(['speaker', 'listener'] as const)('transfers ownership to a %s and keeps the previous host as a speaker', async role => {
		const fixture = createHostTransferFixture(role);
		fixture.room.visibility = 'specified';
		fixture.room.moderatorUserIds.push(fixture.participant.userId);
		const updated = await fixture.service.transferHost({ id: 'owner-a' } as MiUser, fixture.room.id, fixture.participant.id, 1);
		expect(updated).toMatchObject({ ownerUserId: fixture.participant.userId, revision: 2, moderatorUserIds: ['moderator-a'], visibleUserIds: ['owner-a', fixture.participant.userId] });
		expect(fixture.update).toHaveBeenCalledWith({ roomId: fixture.room.id, userId: 'owner-a', role: 'host' }, expect.objectContaining({ role: 'speaker' }));
		expect(fixture.update).toHaveBeenCalledWith({ id: fixture.participant.id, state: 'active' }, expect.objectContaining({ role: 'host', speakerRequestedAt: null }));
		expect(fixture.publish).toHaveBeenCalledWith(fixture.room.id, 2, 'role', { participantId: 'former-host-a', role: 'speaker' });
		expect(fixture.touchHost).toHaveBeenCalledWith(fixture.room.id);
		expect(fixture.publish).toHaveBeenCalledWith(fixture.room.id, 2, 'participant', { participantId: fixture.participant.id, action: 'updated' });
	});

	test.each(['viewer-a', 'moderator-a'])('%s cannot transfer the host', async id => {
		const fixture = createHostTransferFixture();
		await expect(fixture.service.transferHost({ id } as MiUser, fixture.room.id, fixture.participant.id, 1)).rejects.toMatchObject({ code: 'access-denied' });
		expect(fixture.execute).not.toHaveBeenCalled();
	});

	test.each(['ended', 'missing-participant', 'stale'] as const)('rejects %s without changing roles', async failure => {
		const fixture = createHostTransferFixture('listener');
		if (failure === 'ended') fixture.room.state = 'ended';
		if (failure === 'missing-participant') fixture.participants.findOneBy.mockResolvedValue(null);
		if (failure === 'stale') fixture.execute.mockResolvedValue({ affected: 0, raw: [] });
		await expect(fixture.service.transferHost({ id: 'owner-a' } as MiUser, fixture.room.id, fixture.participant.id, 1)).rejects.toMatchObject({ code: failure === 'ended' ? 'invalid-state' : failure === 'missing-participant' ? 'participant-not-found' : 'stale-revision' });
		expect(fixture.update).not.toHaveBeenCalled();
		expect(fixture.touchHost).not.toHaveBeenCalled();
		expect(fixture.publish).not.toHaveBeenCalled();
	});

	test('rejects a target who already owns an active room without changing roles', async () => {
		const fixture = createHostTransferFixture();
		const error = new QueryFailedError('UPDATE', [], Object.assign(new Error('duplicate owner'), { code: '23505', constraint: 'IDX_calls_room_active_personal_owner' }));
		fixture.execute.mockRejectedValue(error);
		await expect(fixture.service.transferHost({ id: 'owner-a' } as MiUser, fixture.room.id, fixture.participant.id, 1)).rejects.toMatchObject({ code: 'active-attachment' });
		expect(fixture.update).not.toHaveBeenCalled();
		expect(fixture.publish).not.toHaveBeenCalled();
	});
});

describe('Calls media role policies', () => {
	test.each([
		['microphone', 'canSpeakInCalls'],
		['camera', 'canPublishCallsVideo'],
		['screen', 'canShareCallsScreen'],
	] as const)('checks the %s permission', async (source, policy) => {
		const service = createAccessFixture();
		Object.assign(service, { roleService: { getUserPolicies: async () => ({ ...DEFAULT_POLICIES, [policy]: false }) } });
		await expect(service.assertCanPublish(viewer, source)).rejects.toMatchObject({ code: 'access-denied' });
		if (source !== 'microphone') await expect(service.assertCanPublish(viewer, 'microphone')).resolves.toBeUndefined();
	});
});


test('camera and screen permissions work with speaking disabled', async () => {
	const service = createAccessFixture();
	Object.assign(service, { roleService: { getUserPolicies: async () => ({ ...DEFAULT_POLICIES, canSpeakInCalls: false }) } });
	await expect(service.assertCanPublish(viewer, 'microphone')).rejects.toMatchObject({ code: 'access-denied' });
	await expect(service.assertCanPublish(viewer, 'camera')).resolves.toBeUndefined();
	await expect(service.assertCanPublish(viewer, 'screen')).resolves.toBeUndefined();
});
