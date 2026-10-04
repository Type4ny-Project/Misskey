/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { DrawingService } from '@/core/drawing/DrawingService.js';
import type { MiUser } from '@/models/_.js';

class MemoryRedis {
	public values = new Map<string, string>();
	public lists = new Map<string, string[]>();
	public async get(key: string) { return this.values.get(key) ?? null; }
	public async llen(key: string) { return this.lists.get(key)?.length ?? 0; }
	public async lrange(key: string) { return this.lists.get(key) ?? []; }
	public multi() {
		const commands: (() => void)[] = [];
		const transaction = {
			set: (key: string, value: string) => { commands.push(() => { this.values.set(key, value); }); return transaction; },
			del: (key: string) => { commands.push(() => { this.lists.delete(key); }); return transaction; },
			rpush: (key: string, value: string) => { commands.push(() => { this.lists.set(key, [...(this.lists.get(key) ?? []), value]); }); return transaction; },
			ltrim: (key: string, start: number) => { commands.push(() => { this.lists.set(key, (this.lists.get(key) ?? []).slice(start)); }); return transaction; },
			exec: async () => { commands.forEach(command => command()); return [[null, 'OK']]; },
		};
		return transaction;
	}
}

const owner = { id: 'owner', host: null } as MiUser;
const member = { id: 'member', host: null } as MiUser;
const outsider = { id: 'outsider', host: null } as MiUser;
const stroke = { color: '#123456', width: 4, eraser: false, points: [[20, 30], [40, 50]] };
function fixture() {
	const redis = new MemoryRedis();
	const room = { id: 'room', ownerUserId: owner.id, attachmentType: 'personal', visibility: 'public', state: 'open', chatRoomId: null as string | null };
	const participants = new Map<string, { id: string; state: string }>();
	const live = new Set<string>();
	const memberships = new Set([owner.id, member.id]);
	const events = vi.fn();
	const service = new DrawingService(redis as never, { findOneBy: async ({ userId }: { userId: string }) => participants.get(userId) ?? null } as never,
		{ getRoom: async () => room, assertCanAccess: async () => {} } as never,
		{ withRoomLock: async (_id: string, callback: (assertHeld: () => Promise<void>) => Promise<unknown>) => callback(async () => {}), get: async (id: string) => live.has(id) ? {} : null } as never,
		{ getChatAvailability: async () => ({ read: true, write: true }), findRoomById: async () => ({ id: 'chat' }), isRoomMember: async (_room: unknown, id: string) => memberships.has(id) } as never,
		{ publishDrawingStream: events } as never);
	return { service, redis, room, participants, live, memberships, events };
}

async function start(f: ReturnType<typeof fixture>, scope: 'public' | 'chatRoom' | 'calls' = 'public') {
	await f.service.update(owner, 'room', 'start', { scope });
	return (await f.service.snapshot(owner, 'room'))!;
}

describe('DrawingService', () => {
	test('two members share strokes and late/reloaded clients receive the current canvas', async () => {
		const f = fixture();
		const state = await start(f);
		await f.service.update(member, 'room', 'join', { canvasId: state.canvasId });
		await f.service.update(owner, 'room', 'stroke', { canvasId: state.canvasId, stroke });
		await f.service.update(member, 'room', 'stroke', { canvasId: state.canvasId, stroke: { ...stroke, eraser: true } });
		expect(await f.service.snapshot(outsider, 'room')).toEqual(await f.service.snapshot(member, 'room'));
		expect((await f.service.snapshot(member, 'room'))?.strokes).toEqual([stroke, { ...stroke, eraser: true }]);
		expect(f.events.mock.calls.at(-1)?.[1]).toMatchObject({ version: 4, action: 'stroke' });
	});

	test('only the owner can clear, end or remove participants; removed users lose read and write access', async () => {
		const f = fixture();
		const { canvasId } = await start(f);
		await f.service.update(member, 'room', 'join', { canvasId });
		for (const action of ['clear', 'end', 'kick'] as const) await expect(f.service.update(member, 'room', action, { canvasId, userId: owner.id })).rejects.toMatchObject({ code: 'accessDenied' });
		await f.service.update(owner, 'room', 'kick', { canvasId, userId: member.id });
		await expect(f.service.snapshot(member, 'room')).rejects.toMatchObject({ code: 'accessDenied' });
		await expect(f.service.update(member, 'room', 'stroke', { canvasId, stroke })).rejects.toMatchObject({ code: 'accessDenied' });
		await expect(f.service.update(member, 'room', 'join', { canvasId })).rejects.toMatchObject({ code: 'accessDenied' });
	});

	test('clear invalidates queued strokes and end preserves the exportable canvas without reopening editing', async () => {
		const f = fixture();
		const { canvasId } = await start(f);
		await f.service.update(owner, 'room', 'stroke', { canvasId, stroke });
		await f.service.update(owner, 'room', 'clear', { canvasId });
		const cleared = (await f.service.snapshot(owner, 'room'))!;
		expect(cleared.strokes).toEqual([]);
		await expect(f.service.update(owner, 'room', 'stroke', { canvasId, stroke })).rejects.toMatchObject({ code: 'invalidState' });
		await f.service.update(owner, 'room', 'stroke', { canvasId: cleared.canvasId, stroke });
		await f.service.update(owner, 'room', 'end', { canvasId: cleared.canvasId });
		expect(await f.service.snapshot(owner, 'room')).toMatchObject({ ended: true, strokes: [stroke] });
		await expect(f.service.update(owner, 'room', 'stroke', { canvasId: cleared.canvasId, stroke })).rejects.toMatchObject({ code: 'invalidState' });
		await expect(f.service.update(owner, 'room', 'start', { scope: 'public' })).rejects.toMatchObject({ code: 'invalidState' });
	});

	test('ChatRoom mode checks actual membership for reads and every write', async () => {
		const f = fixture();
		f.room.attachmentType = 'chatRoom'; f.room.chatRoomId = 'chat';
		const { canvasId } = await start(f, 'chatRoom');
		await expect(f.service.snapshot(outsider, 'room')).rejects.toMatchObject({ code: 'accessDenied' });
		await f.service.update(member, 'room', 'join', { canvasId });
		f.memberships.delete(member.id);
		await expect(f.service.update(member, 'room', 'stroke', { canvasId, stroke })).rejects.toMatchObject({ code: 'accessDenied' });
	});

	test('Calls mode requires a live participant, including the host, and rejects departed or removed participants', async () => {
		const f = fixture();
		await expect(start(f, 'calls')).rejects.toMatchObject({ code: 'accessDenied' });
		f.participants.set(owner.id, { id: 'host', state: 'active' }); f.live.add('host');
		const { canvasId } = await start(f, 'calls');
		await expect(f.service.snapshot(member, 'room')).rejects.toMatchObject({ code: 'accessDenied' });
		f.participants.set(member.id, { id: 'guest', state: 'active' }); f.live.add('guest');
		await f.service.update(member, 'room', 'join', { canvasId });
		f.live.delete('guest');
		await expect(f.service.update(member, 'room', 'stroke', { canvasId, stroke })).rejects.toMatchObject({ code: 'accessDenied' });
		f.live.add('guest'); f.participants.set(member.id, { id: 'guest', state: 'removed' });
		await expect(f.service.snapshot(member, 'room')).rejects.toMatchObject({ code: 'accessDenied' });
	});

	test('limits participant slots and releases expired slots while retaining the canvas', async () => {
		const f = fixture();
		const { canvasId } = await start(f);
		for (let index = 0; index < 15; index++) await f.service.update({ id: `guest${index}` } as MiUser, 'room', 'join', { canvasId });
		await expect(f.service.update(member, 'room', 'join', { canvasId })).rejects.toMatchObject({ code: 'roomFull' });
		const key = 'drawing:room';
		const control = JSON.parse(f.redis.values.get(key)!);
		control.lastSeen.guest0 = Date.now() - 100000;
		f.redis.values.set(key, JSON.stringify(control));
		await f.service.update(member, 'room', 'join', { canvasId });
		expect((await f.service.snapshot(owner, 'room'))?.participantIds).toHaveLength(16);
	});
});
