/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type Logger from '@/logger.js';
import { NotificationService } from '@/core/NotificationService.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

const NOTIFICATION_DEDUPE_TTL_SEC = 60 * 60 * 24 * 14;
const BATCH_SIZE = 500;

@Injectable()
export class NotifyWeeklyStatsReadyProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private notificationService: NotificationService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('notify-weekly-stats-ready');
	}

	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Notifying weekly stats summaries...');

		const weekKey = getWeekKey();
		let cursor: string | null = null;
		let notified = 0;

		while (true) {
			const query = this.usersRepository.createQueryBuilder('user')
				.select('user.id', 'id')
				.where('user.host IS NULL')
				.andWhere('user.isSuspended = false')
				.andWhere('user.isHibernated = false')
				.orderBy('user.id', 'ASC')
				.limit(BATCH_SIZE);

			if (cursor != null) {
				query.andWhere('user.id > :cursor', { cursor });
			}

			const users = await query.getRawMany<{ id: string }>();
			if (users.length === 0) break;

			for (const user of users) {
				const result = await this.redisClient.set(`weeklyStatsReadyNotification:${weekKey}:${user.id}`, 'true', 'EX', NOTIFICATION_DEDUPE_TTL_SEC, 'NX');
				if (result !== 'OK') continue;

				this.notificationService.createNotification(user.id, 'app', {
					appAccessTokenId: null,
					customHeader: 'Weekly Stats',
					customBody: '今週のサマリーができました！',
					customIcon: null,
				});
				notified++;
			}

			cursor = users[users.length - 1].id;
		}

		this.logger.succ(`Weekly stats summary notifications queued. notified=${notified}`);
	}
}

function getWeekKey(): string {
	const date = new Date();
	const daysSinceMonday = (date.getDay() + 6) % 7;
	date.setHours(0, 0, 0, 0);
	date.setDate(date.getDate() - daysSinceMonday);
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
