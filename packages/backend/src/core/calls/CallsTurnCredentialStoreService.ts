/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';

@Injectable()
export class CallsTurnCredentialStoreService {
	constructor(
		@Inject(DI.config) private config: Config,
		@Inject(DI.redis) private redis: Redis.Redis,
	) {}

	public async register(username: string, participantId: string, roomId: string, userId: string, expiresAt: string, ttl: number): Promise<void> {
		const previous = await this.redis.get(`calls:turn-participant:${participantId}`);
		if (previous != null && previous !== username) await this.revokeUsername(previous, participantId);
		const pipeline = this.redis.pipeline();
		pipeline.set(`calls:turn:${username}`, JSON.stringify({ roomId, participantId, userId, expiresAt }), 'EX', ttl);
		pipeline.set(`calls:turn-participant:${participantId}`, username, 'EX', ttl);
		await pipeline.exec();
	}

	public async revokeParticipant(participantId: string): Promise<void> {
		const username = await this.redis.get(`calls:turn-participant:${participantId}`);
		if (username != null) await this.revokeUsername(username, participantId);
	}

	public async revokeUsername(username: string, participantId?: string): Promise<void> {
		const turn = this.config.cloudflareRealtime?.turn;
		try {
			if (turn != null) {
				await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turn.tokenId)}/credentials/${encodeURIComponent(username)}/revoke`, {
					method: 'POST', headers: { Authorization: `Bearer ${turn.apiToken}` }, signal: AbortSignal.timeout(10_000),
				});
			}
		} finally {
			const pipeline = this.redis.pipeline();
			pipeline.del(`calls:turn:${username}`);
			if (participantId != null) pipeline.del(`calls:turn-participant:${participantId}`);
			await pipeline.exec();
		}
	}
}
