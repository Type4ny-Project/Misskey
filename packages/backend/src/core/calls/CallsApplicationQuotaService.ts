/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';

export class CallsApplicationQuotaError extends Error {}
export class CallsApplicationDisabledError extends Error {}

@Injectable()
export class CallsApplicationQuotaService {
	private static readonly activeWindowMs = 120_000;

	constructor(
		@Inject(DI.config) private config: Config,
		@Inject(DI.redis) private redis: Redis.Redis,
	) {}

	public async reserveSession(applicationId: string, participantId: string): Promise<void> {
		this.assertApplicationEnabled(applicationId);
		await this.reserve(this.sessionKey(applicationId), participantId, this.providerConfig().maxSessionsPerApplication);
	}

	public async reserveTrack(applicationId: string, participantId: string): Promise<void> {
		this.assertApplicationEnabled(applicationId);
		await this.reserve(this.trackKey(applicationId), participantId, this.providerConfig().maxPublishedTracksPerApplication);
	}

	public async touch(applicationId: string, participantId: string): Promise<void> {
		this.assertApplicationEnabled(applicationId);
		const now = Date.now();
		await this.redis.zadd(this.sessionKey(applicationId), now, participantId);
		await this.redis.expire(this.sessionKey(applicationId), 180);
	}

	public async release(applicationId: string, participantId: string): Promise<void> {
		await Promise.all([
			this.redis.zrem(this.sessionKey(applicationId), participantId),
			this.redis.zrem(this.trackKey(applicationId), participantId),
		]);
	}

	public async releaseSession(applicationId: string, participantId: string): Promise<void> {
		await this.redis.zrem(this.sessionKey(applicationId), participantId);
	}

	public async releaseTrack(applicationId: string, participantId: string): Promise<void> {
		await this.redis.zrem(this.trackKey(applicationId), participantId);
	}

	private async reserve(key: string, participantId: string, limit: number): Promise<void> {
		const now = Date.now();
		const reserved = await this.redis.eval(`
			redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
			local existing = redis.call('ZSCORE', KEYS[1], ARGV[2])
			if not existing and redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then
				return 0
			end
			redis.call('ZADD', KEYS[1], ARGV[4], ARGV[2])
			redis.call('EXPIRE', KEYS[1], 180)
			return 1
		`, 1, key, now - CallsApplicationQuotaService.activeWindowMs, participantId, limit, now);
		if (reserved !== 1) throw new CallsApplicationQuotaError();
	}

	private assertApplicationEnabled(applicationId: string): void {
		if (this.providerConfig().disabledApplicationIds.includes(applicationId)) throw new CallsApplicationDisabledError();
	}

	private providerConfig(): NonNullable<Config['cloudflareRealtime']> {
		const provider = this.config.cloudflareRealtime;
		if (provider == null || !provider.enabled) throw new CallsApplicationDisabledError();
		return provider;
	}

	private sessionKey(applicationId: string): string { return `calls:quota:sessions:${applicationId}`; }
	private trackKey(applicationId: string): string { return `calls:quota:tracks:${applicationId}`; }
}
