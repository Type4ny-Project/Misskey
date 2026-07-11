/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import type * as Redis from 'ioredis';
import { CallsLiveConnectionService, StaleCallsConnectionError } from '@/core/calls/CallsLiveConnectionService.js';

class FakeRedis {
	private values = new Map<string, string>();
	private counters = new Map<string, number>();
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
