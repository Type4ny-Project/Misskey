/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { GlobalEventService, type CallsRoomEventTypes } from '@/core/GlobalEventService.js';

@Injectable()
export class CallsEventService {
	constructor(
		@Inject(DI.redis) private redis: Redis.Redis,
		private globalEventService: GlobalEventService,
	) {}

	public async publish<K extends keyof CallsRoomEventTypes>(roomId: string, roomRevision: number, type: K, body: Omit<CallsRoomEventTypes[K], 'sequence' | 'roomRevision' | 'occurredAt'>): Promise<void> {
		const sequenceKey = `calls:event-sequence:${roomId}`;
		const sequence = await this.redis.incr(sequenceKey);
		await this.redis.expire(sequenceKey, 7 * 24 * 60 * 60);
		this.globalEventService.publishCallsRoomStream(roomId, type, {
			...body,
			sequence,
			roomRevision,
			occurredAt: new Date().toISOString(),
		} as CallsRoomEventTypes[K]);
	}

	public async reportSpeaking(roomId: string, roomRevision: number, participantId: string, speaking: boolean): Promise<void> {
		const key = `calls:speaking:${roomId}`;
		const now = Date.now();
		if (speaking) await this.redis.zadd(key, now, participantId);
		else await this.redis.zrem(key, participantId);
		await this.redis.zremrangebyscore(key, 0, now - 1500);
		await this.redis.expire(key, 10);
		const acquired = await this.redis.set(`calls:speaking-publish:${roomId}`, '1', 'PX', 250, 'NX');
		if (acquired !== 'OK') return;
		const participantIds = await this.redis.zrange(key, 0, -1);
		await this.publish(roomId, roomRevision, 'speaking', { participantIds });
	}
}
