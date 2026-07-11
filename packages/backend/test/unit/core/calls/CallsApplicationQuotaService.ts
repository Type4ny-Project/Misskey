/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import type * as Redis from 'ioredis';
import type { Config } from '@/config.js';
import { CallsApplicationDisabledError, CallsApplicationQuotaError, CallsApplicationQuotaService } from '@/core/calls/CallsApplicationQuotaService.js';

class FakeRedis {
	private sets = new Map<string, Map<string, number>>();
	private reservationQueue = Promise.resolve();

	public async eval(_script: string, _keys: number, key: string, staleBefore: number, member: string, limit: number, now: number) {
		let result = 0;
		this.reservationQueue = this.reservationQueue.then(async () => {
			await this.zremrangebyscore(key, 0, staleBefore);
			if (await this.zscore(key, member) == null && await this.zcard(key) >= limit) return;
			await this.zadd(key, now, member);
			result = 1;
		});
		await this.reservationQueue;
		return result;
	}

	public async zremrangebyscore(key: string, min: number, max: number) {
		const set = this.sets.get(key);
		if (set == null) return 0;
		let removed = 0;
		for (const [member, score] of set) {
			if (score >= min && score <= max) {
				set.delete(member);
				removed++;
			}
		}
		return removed;
	}

	public async zscore(key: string, member: string) { return this.sets.get(key)?.get(member)?.toString() ?? null; }
	public async zcard(key: string) { return this.sets.get(key)?.size ?? 0; }
	public async zadd(key: string, score: number, member: string) {
		const set = this.sets.get(key) ?? new Map<string, number>();
		set.set(member, score);
		this.sets.set(key, set);
		return 1;
	}
	public async zrem(key: string, member: string) { return this.sets.get(key)?.delete(member) ? 1 : 0; }
	public async expire() { return 1; }
}

const config = {
	cloudflareRealtime: {
		enabled: true,
		appId: 'provider-app',
		appSecret: 'secret',
		maxSessionsPerApplication: 1,
		maxPublishedTracksPerApplication: 1,
		disabledApplicationIds: ['disabled-app'],
	},
} as Config;

describe('CallsApplicationQuotaService', () => {
	test('counts a participant once and releases its session quota', async () => {
		const service = new CallsApplicationQuotaService(config, new FakeRedis() as unknown as Redis.Redis);
		await service.reserveSession('app-a', 'participant-a');
		await service.reserveSession('app-a', 'participant-a');
		await expect(service.reserveSession('app-a', 'participant-b')).rejects.toBeInstanceOf(CallsApplicationQuotaError);
		await service.releaseSession('app-a', 'participant-a');
		await expect(service.reserveSession('app-a', 'participant-b')).resolves.toBeUndefined();
	});

	test('enforces track quota independently from session quota', async () => {
		const service = new CallsApplicationQuotaService(config, new FakeRedis() as unknown as Redis.Redis);
		await service.reserveSession('app-a', 'participant-a');
		await service.reserveTrack('app-a', 'participant-a');
		await expect(service.reserveTrack('app-a', 'participant-b')).rejects.toBeInstanceOf(CallsApplicationQuotaError);
	});

	test('reserves capacity atomically for concurrent participants', async () => {
		const service = new CallsApplicationQuotaService(config, new FakeRedis() as unknown as Redis.Redis);
		const results = await Promise.allSettled([
			service.reserveSession('app-a', 'participant-a'),
			service.reserveSession('app-a', 'participant-b'),
		]);
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
	});

	test('rejects a disabled application before reserving capacity', async () => {
		const service = new CallsApplicationQuotaService(config, new FakeRedis() as unknown as Redis.Redis);
		await expect(service.reserveSession('disabled-app', 'participant-a')).rejects.toBeInstanceOf(CallsApplicationDisabledError);
		await expect(service.touch('disabled-app', 'participant-a')).rejects.toBeInstanceOf(CallsApplicationDisabledError);
	});
});
