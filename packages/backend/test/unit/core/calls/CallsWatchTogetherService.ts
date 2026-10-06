/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { CallsWatchTogetherService } from '@/core/calls/CallsWatchTogetherService.js';
import { CallsRoomService } from '@/core/calls/CallsRoomService.js';
import type { MiUser } from '@/models/_.js';

const user = (id: string) => ({ id, host: null }) as MiUser;
function fixture() {
	const room = { id: 'room', ownerUserId: 'host', moderatorUserIds: ['moderator'], state: 'open', visibility: 'public', revision: 1, endedAt: null as Date | null };
	const active = new Set(['host', 'moderator', 'viewer']);
	const removed = new Set<string>();
	const participants = { existsBy: async (query: { userId: string; state: string }) => (query.state === 'active' ? active : removed).has(query.userId) };
	const stored = new Map<string, string>();
	const redis = { get: async (key: string) => stored.get(key) ?? null, set: async (key: string, value: string) => { stored.set(key, value); return 'OK'; } };
	const connections = { withRoomLock: async (_id: string, callback: (assertHeld: () => Promise<void>) => Promise<unknown>) => callback(async () => {}), touchHost: vi.fn() };
	const events = { publish: vi.fn() };
	const rooms = new CallsRoomService(
		{ cloudflareRealtime: { enabled: true } } as never, { findOneBy: async () => room } as never, participants as never,
		{} as never, {} as never, {} as never, {} as never, {} as never, { isModerator: async () => false } as never,
		connections as never, events as never, {} as never, {} as never,
	);
	return { service: new CallsWatchTogetherService(redis as never, participants as never, rooms, connections as never, events as never), room, active, removed, events, connections };
}

afterEach(() => vi.useRealTimers());

describe('Calls Watch Together', () => {
	test('shares video, play, pause and seek anchors; late viewers receive the same state', async () => {
		vi.useFakeTimers(); vi.setSystemTime(100000);
		const { service, events } = fixture();
		const initial = await service.show(user('viewer'), 'room');
		expect(initial).toMatchObject({ videoId: null, revision: 0 });
		await service.update(user('host'), 'room', { expectedRevision: 0, videoId: 'M7lc1UVf-VE', playing: true });
		vi.setSystemTime(105000);
		const paused = await service.update(user('moderator'), 'room', { expectedRevision: 1, playing: false });
		expect(paused).toMatchObject({ playing: false, position: 5, revision: 2 });
		const seeked = await service.update(user('host'), 'room', { expectedRevision: 2, position: 42 });
		expect(await service.show(user('viewer'), 'room')).toEqual(seeked);
		expect(events.publish).toHaveBeenLastCalledWith('room', 1, 'watchTogether', { state: seeked });
		await expect(service.update(user('host'), 'room', { expectedRevision: 1, position: 0 })).rejects.toMatchObject({ code: 'stale-revision' });
	});

	test('allows only the host and active room moderators to control playback', async () => {
		const { service, active } = fixture();
		await expect(service.update(user('viewer'), 'room', { expectedRevision: 0, videoId: 'M7lc1UVf-VE' })).rejects.toMatchObject({ code: 'access-denied' });
		active.delete('moderator');
		await expect(service.update(user('moderator'), 'room', { expectedRevision: 0, videoId: 'M7lc1UVf-VE' })).rejects.toMatchObject({ code: 'access-denied' });
	});

	test('rejects private-room outsiders and removed participants when reading', async () => {
		const { service, room, removed } = fixture();
		removed.add('viewer');
		await expect(service.show(user('viewer'), 'room')).rejects.toMatchObject({ code: 'access-denied' });
		room.visibility = 'specified';
		Object.assign(room, { visibleUserIds: [] });
		await expect(service.show(user('outsider'), 'room')).rejects.toMatchObject({ code: 'access-denied' });
	});

	test('stops at room end and rejects further controls', async () => {
		vi.useFakeTimers(); vi.setSystemTime(100000);
		const { service, room } = fixture();
		await service.update(user('host'), 'room', { expectedRevision: 0, videoId: 'M7lc1UVf-VE', playing: true });
		room.state = 'ended'; room.endedAt = new Date(105000);
		vi.setSystemTime(120000);
		expect(await service.show(user('viewer'), 'room')).toMatchObject({ playing: false, position: 5 });
		await expect(service.update(user('host'), 'room', { expectedRevision: 1, playing: true })).rejects.toMatchObject({ code: 'invalid-state' });
	});

	test('keeps the viewing host present without an audio connection and clears a video', async () => {
		const { service, connections } = fixture();
		await service.show(user('viewer'), 'room');
		expect(connections.touchHost).not.toHaveBeenCalled();
		await service.show(user('host'), 'room');
		expect(connections.touchHost).toHaveBeenCalledWith('room');
		await service.update(user('host'), 'room', { expectedRevision: 0, videoId: 'M7lc1UVf-VE' });
		expect(await service.update(user('host'), 'room', { expectedRevision: 1, videoId: null })).toMatchObject({ videoId: null, playing: false, position: 0 });
	});
});
