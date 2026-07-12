/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type * as Redis from 'ioredis';
import { CallsOperationGuardService, CallsOperationRateLimitError } from '@/core/calls/CallsOperationGuardService.js';

class FakeRedis {
	private values = new Map<string, string>();
	private counters = new Map<string, number>();
	public async get(key: string) { return this.values.get(key) ?? null; }
	public async incr(key: string) { const value = (this.counters.get(key) ?? 0) + 1; this.counters.set(key, value); return value; }
	public async expire() { return 1; }
	public async del(key: string) { return this.values.delete(key) ? 1 : 0; }
	public async set(key: string, value: string, ...args: Array<string | number>) {
		if (args.includes('NX') && this.values.has(key)) return null;
		this.values.set(key, value);
		return 'OK';
	}
}

const scope = { userId: 'user-a', applicationId: 'app-a', roomId: 'room-a', operation: 'publish', operationId: 'operation-a' };

describe('CallsOperationGuardService', () => {
	test('returns the cached result without executing a duplicate operation', async () => {
		const service = new CallsOperationGuardService(new FakeRedis() as unknown as Redis.Redis);
		const operation = vi.fn().mockResolvedValue({ publicationId: 'publication-a' });

		expect(await service.execute(scope, operation)).toEqual({ publicationId: 'publication-a' });
		expect(await service.execute(scope, operation)).toEqual({ publicationId: 'publication-a' });
		expect(operation).toHaveBeenCalledTimes(1);
	});

	test('does not share an idempotency result between different operation kinds', async () => {
		const service = new CallsOperationGuardService(new FakeRedis() as unknown as Redis.Redis);
		expect(await service.execute(scope, async () => 'publish-result')).toBe('publish-result');
		expect(await service.execute({ ...scope, operation: 'subscribe' }, async () => 'subscribe-result')).toBe('subscribe-result');
	});

	test('enforces the user rate limit before running the provider operation', async () => {
		const service = new CallsOperationGuardService(new FakeRedis() as unknown as Redis.Redis);
		for (let index = 0; index < 120; index++) {
			await service.execute({ ...scope, operationId: `operation-${index}` }, async () => index);
		}
		await expect(service.execute({ ...scope, operationId: 'operation-over-limit' }, async () => null)).rejects.toBeInstanceOf(CallsOperationRateLimitError);
	});
});
