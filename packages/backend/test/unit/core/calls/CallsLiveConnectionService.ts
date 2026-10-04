/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type * as Redis from 'ioredis';
import { CallsLiveConnectionService, StaleCallsConnectionError } from '@/core/calls/CallsLiveConnectionService.js';

class FakeRedis {
	private values = new Map<string, string>();
	private counters = new Map<string, number>();
	private deadlines = new Map<string, number>();
	public async zadd(_key: string, scoreOrNx: number | 'NX', memberOrScore: string | number, member?: string) {
		const roomId = member ?? memberOrScore as string;
		if (scoreOrNx !== 'NX' || !this.deadlines.has(roomId)) this.deadlines.set(roomId, Number(scoreOrNx === 'NX' ? memberOrScore : scoreOrNx));
	}
	public async zscore(_key: string, roomId: string) { return this.deadlines.get(roomId)?.toString() ?? null; }
	public async zrangebyscore(_key: string, _min: string, max: number) { return [...this.deadlines].filter(([, deadline]) => deadline <= max).map(([roomId]) => roomId); }
	public async zrem(_key: string, roomId: string) { this.deadlines.delete(roomId); }
	public async get(key: string) { return this.values.get(key) ?? null; }
	public async incr(key: string) { const value = (this.counters.get(key) ?? 0) + 1; this.counters.set(key, value); return value; }
	public async set(key: string, value: string) { this.values.set(key, value); return 'OK'; }
	public async eval(_script: string, _keys: number, key: string, connectionId: string, generation: number) {
		const value = this.values.get(key);
		if (value == null) return 0;
		const decoded = JSON.parse(value) as { connectionId: string; generation: number };
		if (decoded.connectionId !== connectionId || decoded.generation !== generation) return 0;
		this.values.delete(key);
		return 1;
	}
}

describe('CallsLiveConnectionService', () => {
	test('expires a host after 90 seconds and extends the deadline when they return', async () => {
		vi.useFakeTimers();
		try {
			const service = new CallsLiveConnectionService(new FakeRedis() as unknown as Redis.Redis);
			await service.touchHost('room-a');
			await vi.advanceTimersByTimeAsync(60_000);
			expect(await service.expiredHostRooms()).toEqual([]);
			await service.touchHost('room-a');
			await vi.advanceTimersByTimeAsync(89_999);
			expect(await service.expiredHostRooms()).toEqual([]);
			await vi.advanceTimersByTimeAsync(1);
			expect(await service.expiredHostRooms()).toEqual(['room-a']);
			await service.removeHostDeadline('room-a');
			expect(await service.getHostDeadline('room-a')).toBeNull();
		} finally { vi.useRealTimers(); }
	});

	test('replaces a connection with a monotonically increasing generation', async () => {
		const service = new CallsLiveConnectionService(new FakeRedis() as unknown as Redis.Redis);
		const first = await service.replace('participant', 'connection-1');
		const second = await service.replace('participant', 'connection-2');
		expect(first.current.generation).toBe(1);
		expect(second.current.generation).toBe(2);
		expect(second.previous).toMatchObject({ connectionId: 'connection-1', generation: 1 });
		await expect(service.assertCurrent('participant', 'connection-1', 1)).rejects.toBeInstanceOf(StaleCallsConnectionError);
	});

	test('does not let an old generation clear the current connection', async () => {
		const service = new CallsLiveConnectionService(new FakeRedis() as unknown as Redis.Redis);
		await service.replace('participant', 'connection-1');
		const second = await service.replace('participant', 'connection-2');
		expect(await service.clear('participant', 'connection-1', 1)).toBe(false);
		expect(await service.clear('participant', 'connection-2', second.current.generation)).toBe(true);
	});
});
