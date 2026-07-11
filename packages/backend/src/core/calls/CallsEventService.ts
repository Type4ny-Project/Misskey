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
		const sequence = await this.redis.incr(`calls:event-sequence:${roomId}`);
		this.globalEventService.publishCallsRoomStream(roomId, type, {
			...body,
			sequence,
			roomRevision,
			occurredAt: new Date().toISOString(),
		} as CallsRoomEventTypes[K]);
	}
}
