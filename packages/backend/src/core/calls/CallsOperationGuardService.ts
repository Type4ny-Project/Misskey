/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { DI } from '@/di-symbols.js';

export class CallsOperationInProgressError extends Error {}
export class CallsOperationRateLimitError extends Error {}

type CallsOperationScope = {
	userId: string;
	applicationId: string;
	roomId: string;
	operation: string;
	operationId: string;
};

@Injectable()
export class CallsOperationGuardService {
	private static readonly resultTtlSeconds = 300;
	private static readonly rateWindowSeconds = 60;

	constructor(@Inject(DI.redis) private redis: Redis.Redis) {}

	public async execute<T>(scope: CallsOperationScope, operation: () => Promise<T>): Promise<T> {
		const resultKey = this.resultKey(scope);
		const cached = await this.redis.get(resultKey);
		if (cached != null) return JSON.parse(cached) as T;

		await this.assertRateLimits(scope);
		const lockKey = `${resultKey}:lock`;
		const locked = await this.redis.set(lockKey, '1', 'EX', 30, 'NX');
		if (locked !== 'OK') {
			const completed = await this.redis.get(resultKey);
			if (completed != null) return JSON.parse(completed) as T;
			throw new CallsOperationInProgressError();
		}

		try {
			const result = await operation();
			await this.redis.set(resultKey, JSON.stringify(result), 'EX', CallsOperationGuardService.resultTtlSeconds);
			return result;
		} finally {
			await this.redis.del(lockKey);
		}
	}

	private async assertRateLimits(scope: CallsOperationScope): Promise<void> {
		const limits = [
			[`calls:rate:user:${scope.userId}`, 120],
			[`calls:rate:app:${scope.applicationId}`, 240],
			[`calls:rate:room:${scope.roomId}`, 600],
			['calls:rate:instance', 2000],
		] as const;
		for (const [key, limit] of limits) {
			const count = await this.redis.incr(key);
			if (count === 1) await this.redis.expire(key, CallsOperationGuardService.rateWindowSeconds);
			if (count > limit) throw new CallsOperationRateLimitError();
		}
	}

	private resultKey(scope: CallsOperationScope): string {
		return `calls:operation:${scope.applicationId}:${scope.userId}:${scope.roomId}:${scope.operation}:${scope.operationId}`;
	}
}
