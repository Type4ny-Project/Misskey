/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { IOrderedCollection } from '@/core/activitypub/type.js';

export const FEATURED_COLLECTION_CACHE_TTL_SECONDS = 180;
const FEATURED_COLLECTION_VERSION_TTL_SECONDS = 24 * 60 * 60;
const FEATURED_COLLECTION_LOCK_TTL_MS = 30_000;
const FEATURED_COLLECTION_LOCK_POLL_INTERVAL_MS = 100;
const FEATURED_COLLECTION_LOCK_WAIT_TIMEOUT_MS = 5_000;

export type FeaturedCollection = IOrderedCollection & {
	'@context': unknown;
};

type InFlightRender = {
	promise: Promise<FeaturedCollection>;
	token: {
		invalidated: boolean;
	};
};

/**
 * Short-lived cache for the local ActivityPub featured collection.
 *
 * The collection is public and the endpoint already advertises a 180 second
 * cache lifetime. Redis is used as the shared cache so all backend workers can
 * reuse a rendered collection, while the in-flight map prevents a thundering
 * herd inside one worker when a key expires.
 */
@Injectable()
export class FeaturedCollectionCacheService {
	private readonly inFlight = new Map<string, InFlightRender>();

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
	) {
	}

	private cacheKey(userId: string): string {
		return `kvcache:activityPubFeatured:${userId}`;
	}

	private versionKey(userId: string): string {
		return `${this.cacheKey(userId)}:version`;
	}

	private lockKey(userId: string): string {
		return `${this.cacheKey(userId)}:lock`;
	}

	public async fetch(userId: string, loader: () => Promise<FeaturedCollection>): Promise<FeaturedCollection> {
		const pending = this.inFlight.get(userId);
		if (pending != null) return pending.promise;

		const token = { invalidated: false };
		const promise = this.fetchAndStore(userId, token, loader);
		const render = { promise, token };
		this.inFlight.set(userId, render);

		try {
			return await promise;
		} finally {
			if (this.inFlight.get(userId) === render) this.inFlight.delete(userId);
		}
	}

	private async fetchAndStore(
		userId: string,
		token: InFlightRender['token'],
		loader: () => Promise<FeaturedCollection>,
	): Promise<FeaturedCollection> {
		const cached = await this.get(userId);
		if (cached != null) return cached;

		const lockToken = randomUUID();
		const lockState = await this.tryAcquireLock(userId, lockToken);
		if (lockState === 'acquired') {
			return this.fetchWithLock(userId, lockToken, token, loader);
		}
		if (lockState === 'unavailable') {
			return this.renderAndStore(userId, token, loader);
		}

		// Another worker is rendering this user. Poll the shared cache instead of
		// rendering the same collection again. A bounded fallback preserves
		// availability if the lock holder crashed or Redis lost the lock state.
		const deadline = Date.now() + FEATURED_COLLECTION_LOCK_WAIT_TIMEOUT_MS;
		while (Date.now() < deadline) {
			await new Promise<void>(resolve => setTimeout(resolve, FEATURED_COLLECTION_LOCK_POLL_INTERVAL_MS));
			const cached = await this.get(userId);
			if (cached != null) return cached;

			const nextLockState = await this.tryAcquireLock(userId, lockToken);
			if (nextLockState === 'acquired') {
				return this.fetchWithLock(userId, lockToken, token, loader);
			}
			if (nextLockState === 'unavailable') {
				return this.renderAndStore(userId, token, loader);
			}
		}

		return this.renderAndStore(userId, token, loader);
	}

	private async fetchWithLock(
		userId: string,
		lockToken: string,
		token: InFlightRender['token'],
		loader: () => Promise<FeaturedCollection>,
	): Promise<FeaturedCollection> {
		try {
			// The lock holder may have been queued behind another worker that
			// populated the value just before this lock was acquired.
			const cached = await this.get(userId);
			if (cached != null) return cached;
			return await this.renderAndStore(userId, token, loader);
		} finally {
			await this.releaseLock(userId, lockToken);
		}
	}

	private async renderAndStore(
		userId: string,
		token: InFlightRender['token'],
		loader: () => Promise<FeaturedCollection>,
	): Promise<FeaturedCollection> {
		const version = await this.getVersion(userId);
		const value = await loader();

		// A pin update may have happened while rendering. Do not repopulate Redis
		// with the now-stale result after invalidate() marked this render.
		if (!token.invalidated) await this.set(userId, version, value);

		return value;
	}

	private async tryAcquireLock(userId: string, token: string): Promise<'acquired' | 'busy' | 'unavailable'> {
		try {
			const result = await this.redisClient.set(
				this.lockKey(userId),
				token,
				'PX', FEATURED_COLLECTION_LOCK_TTL_MS,
				'NX',
			);
			return result === 'OK' ? 'acquired' : 'busy';
		} catch {
			return 'unavailable';
		}
	}

	private async releaseLock(userId: string, token: string): Promise<void> {
		try {
			await this.redisClient.eval(
				`if redis.call('get', KEYS[1]) == ARGV[1] then
					return redis.call('del', KEYS[1])
				end
				return 0`,
				1,
				this.lockKey(userId),
				token,
			);
		} catch {
			// The lock has a bounded TTL and will expire automatically.
		}
	}

	private async get(userId: string): Promise<FeaturedCollection | undefined> {
		try {
			const value = await this.redisClient.get(this.cacheKey(userId));
			return value == null ? undefined : JSON.parse(value) as FeaturedCollection;
		} catch {
			// The cache is an optimization. Redis failures must not make AP
			// responses fail; the caller will render from the database instead.
			return undefined;
		}
	}

	private async getVersion(userId: string): Promise<string> {
		try {
			return await this.redisClient.get(this.versionKey(userId)) ?? '0';
		} catch {
			return '0';
		}
	}

	private async set(userId: string, version: string, value: FeaturedCollection): Promise<void> {
		try {
			// Check the invalidation version and write the value atomically. This
			// prevents another worker's in-flight render from repopulating Redis
			// after a pin update has invalidated the key.
			await this.redisClient.eval(
				`local current = redis.call('get', KEYS[1])
				if (current == false and ARGV[1] == '0') or current == ARGV[1] then
					return redis.call('set', KEYS[2], ARGV[2], 'EX', ARGV[3])
				end
				return nil`,
				2,
				this.versionKey(userId),
				this.cacheKey(userId),
				version,
				JSON.stringify(value),
				FEATURED_COLLECTION_CACHE_TTL_SECONDS,
			);
		} catch {
			// Best-effort cache only; keep serving the freshly rendered value.
		}
	}

	public async invalidate(userId: string): Promise<void> {
		// Let a new request start a fresh render immediately. The old promise is
		// still allowed to finish, but its token prevents stale writes.
		const render = this.inFlight.get(userId);
		if (render != null) render.token.invalidated = true;
		this.inFlight.delete(userId);

		try {
			// Replacing the version with a non-repeating token and deleting the
			// value atomically closes the race with a render running in another
			// backend worker. A random token remains safe even if the version key
			// expired between the render and this invalidation.
			await this.redisClient.eval(
				`redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2])
				return redis.call('del', KEYS[2])`,
				2,
				this.versionKey(userId),
				this.cacheKey(userId),
				randomUUID(),
				FEATURED_COLLECTION_VERSION_TTL_SECONDS,
			);
		} catch {
			// Best-effort invalidation; TTL remains the safety net.
		}
	}
}
