/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import * as Redis from 'ioredis';
import { FeaturedCollectionCacheService, type FeaturedCollection } from '@/core/FeaturedCollectionCacheService.js';

const collection: FeaturedCollection = {
	'@context': {},
	id: 'https://example.test/users/alice/collections/featured',
	type: 'OrderedCollection',
	totalItems: 0,
};

function createRedisMock() {
	const values = new Map<string, string>();
	const calls = {
		eval: 0,
		set: 0,
	};
	return {
		client: {
			get: async (key: string) => values.get(key) ?? null,
			set: async (key: string, value: string, ...args: (string | number)[]) => {
				calls.set++;
				if (args.includes('NX') && values.has(key)) return null;
				values.set(key, value);
				return 'OK';
			},
			eval: async (script: string, _keyCount: number, ...args: string[]) => {
				calls.eval++;
				if (script.includes('redis.call(\'set\', KEYS[1], ARGV[1], \'EX\'')) {
					const [versionKey, cacheKey, version] = args;
					values.set(versionKey, version);
					return Number(values.delete(cacheKey));
				}
				if (script.includes('current = redis.call(\'get\'')) {
					const [versionKey, cacheKey, version, value] = args;
					const currentVersion = values.get(versionKey);
					if ((currentVersion == null && version === '0') || currentVersion === version) {
						values.set(cacheKey, value);
						return 'OK';
					}
					return null;
				}
				if (script.includes('ARGV[1]')) {
					const [lockKey, token] = args;
					if (values.get(lockKey) === token) {
						values.delete(lockKey);
						return 1;
					}
				}
				return 0;
			},
		} as unknown as Redis.Redis,
		calls,
		values,
	};
}

describe('FeaturedCollectionCacheService', () => {
	test('coalesces concurrent misses within a worker', async () => {
		const { client, calls } = createRedisMock();
		const service = new FeaturedCollectionCacheService(client);
		const loader = vi.fn().mockResolvedValue(collection);

		const [first, second] = await Promise.all([
			service.fetch('alice', loader),
			service.fetch('alice', loader),
		]);

		expect(first).toEqual(collection);
		expect(second).toEqual(collection);
		expect(loader).toHaveBeenCalledOnce();
		expect(calls.eval).toBeGreaterThan(0);
	});

	test('reuses a collection populated in Redis', async () => {
		const { client } = createRedisMock();
		const service = new FeaturedCollectionCacheService(client);
		const loader = vi.fn().mockResolvedValue(collection);

		await service.fetch('alice', loader);
		const cached = await service.fetch('alice', loader);

		expect(cached).toEqual(collection);
		expect(loader).toHaveBeenCalledOnce();
	});

	test('shares one render across backend workers with the Redis lock', async () => {
		const { client, calls, values } = createRedisMock();
		const firstService = new FeaturedCollectionCacheService(client);
		const secondService = new FeaturedCollectionCacheService(client);
		let resolveLoader: ((value: FeaturedCollection) => void) | undefined;
		let markLoaderStarted: (() => void) | undefined;
		const loaderStarted = new Promise<void>((resolve) => {
			markLoaderStarted = resolve;
		});
		let firstLoaderCalls = 0;
		const firstLoader = () => new Promise<FeaturedCollection>((resolve) => {
			firstLoaderCalls++;
			resolveLoader = resolve;
			markLoaderStarted?.();
		});
		let secondLoaderCalls = 0;
		const secondLoader = async () => {
			secondLoaderCalls++;
			return { ...collection, totalItems: 1 };
		};

		const first = firstService.fetch('alice', firstLoader);
		await loaderStarted;
		expect(firstLoaderCalls).toBe(1);
		expect(calls.set).toBe(1);
		expect(calls.eval).toBe(0);
		expect([...values.keys()]).toContain('kvcache:activityPubFeatured:alice:lock');
		const second = secondService.fetch('alice', secondLoader);
		await new Promise<void>(resolve => setTimeout(resolve, 10));
		expect(secondLoaderCalls).toBe(0);
		if (resolveLoader == null) throw new Error('loader was not started');
		resolveLoader(collection);

		expect(await first).toEqual(collection);
		expect(await second).toEqual(collection);
		expect(secondLoaderCalls).toBe(0);
	});

	test('invalidates the shared collection after a pin change', async () => {
		const { client, calls, values } = createRedisMock();
		const service = new FeaturedCollectionCacheService(client);
		const firstLoader = vi.fn().mockResolvedValue(collection);
		const secondCollection = { ...collection, totalItems: 1 };
		const secondLoader = vi.fn().mockResolvedValue(secondCollection);

		await service.fetch('alice', firstLoader);
		await service.invalidate('alice');
		const firstVersion = values.get('kvcache:activityPubFeatured:alice:version');
		values.delete('kvcache:activityPubFeatured:alice:version');
		await service.invalidate('alice');
		const secondVersion = values.get('kvcache:activityPubFeatured:alice:version');
		const refreshed = await service.fetch('alice', secondLoader);

		expect(refreshed).toEqual(secondCollection);
		expect(firstVersion).toBeDefined();
		expect(secondVersion).toBeDefined();
		expect(secondVersion).not.toBe(firstVersion);
		expect(firstLoader).toHaveBeenCalledOnce();
		expect(secondLoader).toHaveBeenCalledOnce();
		expect(calls.eval).toBe(6);
	});

	test('does not repopulate Redis with a render started before invalidation', async () => {
		const { client, calls } = createRedisMock();
		const service = new FeaturedCollectionCacheService(client);
		let resolveLoader: ((value: FeaturedCollection) => void) | undefined;
		const loader = vi.fn(() => new Promise<FeaturedCollection>((resolve) => {
			resolveLoader = resolve;
		}));

		const pending = service.fetch('alice', loader);
		await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
		await service.invalidate('alice');
		if (resolveLoader == null) throw new Error('loader was not started');
		resolveLoader(collection);
		await pending;

		expect(calls.eval).toBe(2);
	});
});
