/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import type { MiCallsRoom, MiUser } from '@/models/_.js';
import { CallsMediaRevocationService } from '@/core/calls/CallsMediaRevocationService.js';
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
		{ isModerator: async () => false } as never, live as never,
		{ publish: vi.fn(), publishRoomsList: vi.fn() } as never,
		{ revokeRoom, revokeParticipant, revokeDisconnectedGeneration, closeGeneration: vi.fn() } as never, { lifecycle: vi.fn() } as never,
	);
	return { service, room, live, update, execute, revokeRoom, revokeParticipant, revokeDisconnectedGeneration };
}

describe('CallsRoomService lifecycle', () => {
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
			{ findOneBy: async () => null, insertOne: insertRoom } as never,
			{ insertOne: insertParticipant } as never,
			{} as never, {} as never, {} as never, {} as never, { gen: () => 'created-a' } as never,
			{} as never, {} as never, { publishRoomsList: vi.fn() } as never, {} as never, { lifecycle: vi.fn() } as never,
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
		['open', 8, 'speaker'],
		['stage', 100, 'listener'],
	] as const)('allows joining a %s room beyond the former %i participant limit', async (mode, count, role) => {
		const room = { ...baseRoom, visibility: 'public', state: 'open', mode };
		const candidates = Array.from({ length: count }, (_, index) => ({ id: `participant-${index}`, joinedAt: new Date(Date.now() - 120_000) }));
		const participants = { findOneBy: vi.fn().mockResolvedValue(null), findBy: vi.fn().mockResolvedValue(candidates), insertOne: vi.fn().mockResolvedValue({ id: 'joined' }) };
		const builder = { update: () => builder, set: () => builder, where: () => builder, returning: () => builder, execute: async () => ({ affected: 1, raw: [{ revision: 2 }] }) };
		const service = new CallsRoomService(
			{ cloudflareRealtime: { enabled: true } } as Config,
			{ findOneBy: async () => room, createQueryBuilder: () => builder } as never, participants as never,
			{} as never, {} as never, {} as never, {} as never, { gen: () => 'joined' } as never, { isModerator: async () => false } as never,
			{ withRoomLock: async (_roomId: string, callback: () => Promise<unknown>) => callback(), get: async () => ({}) } as never,
			{ publish: vi.fn() } as never, {} as never, { lifecycle: vi.fn() } as never,
		);
		await expect(service.join(viewer, room.id)).resolves.toMatchObject({ id: 'joined' });
		expect(participants.insertOne).toHaveBeenCalledWith(expect.objectContaining({ role, state: 'active' }));
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
			{ isModerator: async () => false } as never, {} as never, {} as never, {} as never, {} as never,
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
	const participant = { id: 'target-a', roomId: room.id, userId: 'target-user', role: 'speaker' };
	const existsBy = vi.fn().mockResolvedValue(true);
	const update = vi.fn();
	const set = vi.fn(() => queryBuilder);
	const execute = vi.fn().mockResolvedValue({ affected: 1, raw: [{ ...room, revision: 2 }] });
	const queryBuilder = { update: () => queryBuilder, set, where: () => queryBuilder, returning: () => queryBuilder, execute };
	const revokeParticipant = vi.fn();
	const publish = vi.fn();
	const service = new CallsRoomService(
		{ cloudflareRealtime: { enabled: true } } as Config,
		{ findOneBy: async () => room, createQueryBuilder: () => queryBuilder } as never,
		{ findOneBy: async () => participant, existsBy, update } as never,
		{ insert: vi.fn() } as never, {} as never, {} as never, {} as never,
		{ gen: () => 'log-a' } as never, { isModerator: async () => false } as never,
		{} as never, { publish } as never, { revokeParticipant } as never, { lifecycle: vi.fn() } as never,
	);
	return { service, room, participant, existsBy, update, set, execute, revokeParticipant, publish };
}

describe('Calls VC moderators', () => {
	test('the host can promote a listener beyond the former speaker limit', async () => {
		const fixture = createModerationFixture();
		fixture.participant.role = 'listener';
		Object.assign(fixture.service, { callsParticipantsRepository: {
			findOneBy: async () => fixture.participant,
			countBy: async () => 8,
			update: fixture.update,
			findOneByOrFail: async () => ({ ...fixture.participant, role: 'speaker' }),
		} });
		await expect(fixture.service.setRole({ id: 'owner-a' } as MiUser, fixture.room.id, fixture.participant.id, 'speaker', 1)).resolves.toMatchObject({ role: 'speaker' });
		expect(fixture.publish).toHaveBeenCalledWith(fixture.room.id, 2, 'role', { participantId: fixture.participant.id, role: 'speaker' });
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

	test.each(['ordinary', 'inactive', 'no-access'])('a %s participant cannot use VC moderator kick permission', async reason => {
		const fixture = createModerationFixture();
		if (reason === 'inactive') fixture.existsBy.mockResolvedValue(false);
		if (reason === 'no-access') fixture.room.visibility = 'specified';
		await expect(fixture.service.removeParticipant({ id: reason === 'ordinary' ? 'viewer-a' : 'moderator-a', host: null } as MiUser, fixture.room.id, fixture.participant.id, 1)).rejects.toMatchObject({ code: 'access-denied' });
		expect(fixture.update).not.toHaveBeenCalled();
	});

	test('a VC moderator cannot kick the host', async () => {
		const fixture = createModerationFixture();
		fixture.participant.role = 'host';
		await expect(fixture.service.removeParticipant({ id: 'moderator-a', host: null } as MiUser, fixture.room.id, fixture.participant.id, 1)).rejects.toMatchObject({ code: 'participant-not-found' });
		expect(fixture.update).not.toHaveBeenCalled();
	});

	test('a stale moderator assignment does not change permissions', async () => {
		const fixture = createModerationFixture();
		fixture.execute.mockResolvedValue({ affected: 0, raw: [] });
		await expect(fixture.service.setModerator({ id: 'owner-a' } as MiUser, fixture.room.id, fixture.participant.id, true, 0)).rejects.toMatchObject({ code: 'stale-revision' });
		expect(fixture.publish).not.toHaveBeenCalled();
	});
});
