/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { DI } from '@/di-symbols.js';

export type CallsLiveConnection = {
	participantId: string;
	connectionId: string;
	generation: number;
	applicationId: string;
	sessionId: string | null;
	createdAt: string;
	lastSeenAt: string;
};

export class StaleCallsConnectionError extends Error {}

@Injectable()
export class CallsLiveConnectionService {
	private static readonly ttlSeconds = 90;

	constructor(
		@Inject(DI.redis)
		private redis: Redis.Redis,
	) {}

	public async replace(participantId: string, connectionId: string, applicationId = 'first-party'): Promise<{ current: CallsLiveConnection; previous: CallsLiveConnection | null }> {
		const key = this.connectionKey(participantId);
		const previousRaw = await this.redis.get(key);
		const generation = await this.redis.incr(`calls:connection-generation:${participantId}`);
		const now = new Date().toISOString();
		const current: CallsLiveConnection = { participantId, connectionId, generation, applicationId, sessionId: null, createdAt: now, lastSeenAt: now };
		await this.redis.set(key, JSON.stringify(current), 'EX', CallsLiveConnectionService.ttlSeconds);
		return { current, previous: previousRaw == null ? null : JSON.parse(previousRaw) as CallsLiveConnection };
	}

	public async get(participantId: string): Promise<CallsLiveConnection | null> {
		const value = await this.redis.get(this.connectionKey(participantId));
		return value == null ? null : JSON.parse(value) as CallsLiveConnection;
	}

	public async assertCurrent(participantId: string, connectionId: string, generation: number): Promise<CallsLiveConnection> {
		const connection = await this.get(participantId);
		if (connection == null || connection.connectionId !== connectionId || connection.generation !== generation) {
			throw new StaleCallsConnectionError();
		}
		return connection;
	}

	public async heartbeat(participantId: string, connectionId: string, generation: number): Promise<void> {
		const connection = await this.assertCurrent(participantId, connectionId, generation);
		connection.lastSeenAt = new Date().toISOString();
		await this.redis.set(this.connectionKey(participantId), JSON.stringify(connection), 'EX', CallsLiveConnectionService.ttlSeconds);
	}

	public async bindSession(participantId: string, connectionId: string, generation: number, sessionId: string): Promise<void> {
		const connection = await this.assertCurrent(participantId, connectionId, generation);
		connection.sessionId = sessionId;
		connection.lastSeenAt = new Date().toISOString();
		await this.redis.set(this.connectionKey(participantId), JSON.stringify(connection), 'EX', CallsLiveConnectionService.ttlSeconds);
	}

	public async clear(participantId: string, connectionId: string, generation: number): Promise<boolean> {
		const result = await this.redis.eval(
			`local value = redis.call('GET', KEYS[1])
			if not value then return 0 end
			local decoded = cjson.decode(value)
			if decoded.connectionId ~= ARGV[1] or decoded.generation ~= tonumber(ARGV[2]) then return 0 end
			return redis.call('DEL', KEYS[1])`,
			1,
			this.connectionKey(participantId),
			connectionId,
			generation,
		);
		return result === 1;
	}

	private connectionKey(participantId: string): string {
		return `calls:live-connection:${participantId}`;
	}
}
