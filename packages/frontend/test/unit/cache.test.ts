/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, unknown>());
const idb = vi.hoisted(() => ({
	get: vi.fn(async (key: string) => storage.get(key)),
	set: vi.fn(async (key: string, value: unknown) => { storage.set(key, value); }),
	del: vi.fn(async (key: string) => { storage.delete(key); }),
}));

vi.mock('@/utility/idb-proxy.js', () => idb);

const { Cache } = await import('@/utility/cache.js');

const LIFETIME = 1000 * 60 * 30;
const isArray = (value: unknown): value is string[] => Array.isArray(value);

function createCache(options: { key?: () => string | null; fetcher?: () => Promise<string[]> } = {}) {
	const fetcher = vi.fn(options.fetcher ?? (async () => ['fetched']));
	const key = options.key ?? (() => 'listCache:alice:test');
	return { cache: new Cache<string[]>(LIFETIME, fetcher, { key, validate: isArray }), fetcher };
}

describe('Cache', () => {
	beforeEach(() => {
		storage.clear();
		vi.clearAllMocks();
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-28T00:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('without persistence', () => {
		test('behaves as an in-memory cache and never touches the storage', async () => {
			const fetcher = vi.fn(async () => ['fetched']);
			const cache = new Cache<string[]>(LIFETIME, fetcher);

			expect(await cache.fetch()).toEqual(['fetched']);
			expect(await cache.fetch()).toEqual(['fetched']);
			expect(fetcher).toHaveBeenCalledTimes(1);

			cache.delete();
			await cache.fetch();
			expect(fetcher).toHaveBeenCalledTimes(2);

			expect(idb.get).not.toHaveBeenCalled();
			expect(idb.set).not.toHaveBeenCalled();
			expect(idb.del).not.toHaveBeenCalled();
		});
	});

	describe('with persistence', () => {
		test('saves the fetched value and restores it in a new instance without calling the API', async () => {
			const first = createCache();
			await first.cache.fetch();
			expect(first.fetcher).toHaveBeenCalledTimes(1);

			const second = createCache();
			expect(await second.cache.fetch()).toEqual(['fetched']);
			expect(second.fetcher).not.toHaveBeenCalled();
			expect(second.cache.value.value).toEqual(['fetched']);
		});

		test('keeps the lifetime of 30 minutes counted from the time it was saved', async () => {
			const first = createCache();
			await first.cache.fetch();

			vi.setSystemTime(Date.now() + LIFETIME - 1000);
			const restored = createCache();
			await restored.cache.fetch();
			expect(restored.fetcher).not.toHaveBeenCalled();

			// 復元しても有効期間は延びない
			vi.setSystemTime(Date.now() + 2000);
			await restored.cache.fetch();
			expect(restored.fetcher).toHaveBeenCalledTimes(1);
		});

		test('ignores and removes an expired entry', async () => {
			await createCache().cache.fetch();

			vi.setSystemTime(Date.now() + LIFETIME + 1000);
			const next = createCache({ fetcher: async () => ['fresh'] });
			expect(await next.cache.fetch()).toEqual(['fresh']);
			expect(next.fetcher).toHaveBeenCalledTimes(1);
			expect(storage.get('listCache:alice:test')).toMatchObject({ value: ['fresh'] });
		});

		test('delete() discards the saved entry', async () => {
			const first = createCache();
			await first.cache.fetch();
			first.cache.delete();
			expect(storage.has('listCache:alice:test')).toBe(false);

			const second = createCache();
			await second.cache.fetch();
			expect(second.fetcher).toHaveBeenCalledTimes(1);
		});

		test('set() updates the saved entry', async () => {
			const first = createCache();
			first.cache.set(['edited']);

			const second = createCache();
			expect(await second.cache.fetch()).toEqual(['edited']);
			expect(second.fetcher).not.toHaveBeenCalled();
		});

		test('keeps entries of different accounts apart', async () => {
			const alice = createCache({ key: () => 'listCache:alice:test', fetcher: async () => ['alice-list'] });
			await alice.cache.fetch();

			const bob = createCache({ key: () => 'listCache:bob:test', fetcher: async () => ['bob-list'] });
			expect(await bob.cache.fetch()).toEqual(['bob-list']);
			expect(bob.fetcher).toHaveBeenCalledTimes(1);
		});

		test('does not save or restore while the key is null (signed out)', async () => {
			const stored = createCache();
			await stored.cache.fetch();
			idb.get.mockClear();
			idb.set.mockClear();

			const signedOut = createCache({ key: () => null });
			await signedOut.cache.fetch();
			expect(signedOut.fetcher).toHaveBeenCalledTimes(1);
			expect(idb.get).not.toHaveBeenCalled();
			expect(idb.set).not.toHaveBeenCalled();
		});

		test.each([
			['a non-object', 'broken'],
			['a missing timestamp', { value: ['x'] }],
			['an invalid timestamp', { cachedAt: 'yesterday', value: ['x'] }],
			['a timestamp in the future', { cachedAt: Date.now() + 60_000, value: ['x'] }],
			['a value of the wrong shape', { cachedAt: Date.now(), value: { not: 'an array' } }],
		])('falls back to the API for %s', async (_, saved) => {
			storage.set('listCache:alice:test', saved);
			const { cache, fetcher } = createCache();
			expect(await cache.fetch()).toEqual(['fetched']);
			expect(fetcher).toHaveBeenCalledTimes(1);
		});

		test('falls back to the API when reading the storage fails', async () => {
			idb.get.mockRejectedValueOnce(new Error('idb broken'));
			const { cache, fetcher } = createCache();
			expect(await cache.fetch()).toEqual(['fetched']);
			expect(fetcher).toHaveBeenCalledTimes(1);
		});

		test('keeps working in memory when writing to the storage fails', async () => {
			idb.set.mockRejectedValueOnce(new Error('quota exceeded'));
			const { cache, fetcher } = createCache();
			expect(await cache.fetch()).toEqual(['fetched']);
			expect(await cache.fetch()).toEqual(['fetched']);
			expect(fetcher).toHaveBeenCalledTimes(1);
		});

		test('does not restore a stale entry when delete() is called while restoring', async () => {
			await createCache().cache.fetch();

			const { cache, fetcher } = createCache({ fetcher: async () => ['fresh'] });
			const pending = cache.fetch();
			cache.delete();
			expect(await pending).toEqual(['fresh']);
			expect(fetcher).toHaveBeenCalledTimes(1);
		});
	});
});
