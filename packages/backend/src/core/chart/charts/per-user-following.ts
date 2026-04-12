/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as Redis from 'ioredis';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { FollowingsRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import Chart from '../core.js';
import { ChartLoggerService } from '../ChartLoggerService.js';
import { name, schema } from './entities/per-user-following.js';
import type { KVs } from '../core.js';

/**
 * ユーザーごとのフォローに関するチャート
 */
@Injectable()
export default class PerUserFollowingChart extends Chart<typeof schema> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private userEntityService: UserEntityService,
		private chartLoggerService: ChartLoggerService,
	) {
		super(db, (k) => acquireChartInsertLock(redisClient, k), chartLoggerService.logger, name, schema, true);
	}

	protected async tickMajor(group: string): Promise<Partial<KVs<typeof schema>>> {
		const [
			localFollowingsCountRow,
			localFollowersCountRow,
			remoteFollowingsCountRow,
			remoteFollowersCountRow,
		] = await Promise.all([
			this.db.query(`SELECT COUNT(*)::int AS count FROM following f WHERE f."followerId" = $1 AND EXISTS (SELECT 1 FROM tenant_host_mapping thm WHERE thm.host = f."followeeHost")`, [group]),
			this.db.query(`SELECT COUNT(*)::int AS count FROM following f WHERE f."followeeId" = $1 AND EXISTS (SELECT 1 FROM tenant_host_mapping thm WHERE thm.host = f."followerHost")`, [group]),
			this.db.query(`SELECT COUNT(*)::int AS count FROM following f WHERE f."followerId" = $1 AND NOT EXISTS (SELECT 1 FROM tenant_host_mapping thm WHERE thm.host = f."followeeHost")`, [group]),
			this.db.query(`SELECT COUNT(*)::int AS count FROM following f WHERE f."followeeId" = $1 AND NOT EXISTS (SELECT 1 FROM tenant_host_mapping thm WHERE thm.host = f."followerHost")`, [group]),
		]);
		const localFollowingsCount = localFollowingsCountRow[0]?.count ?? 0;
		const localFollowersCount = localFollowersCountRow[0]?.count ?? 0;
		const remoteFollowingsCount = remoteFollowingsCountRow[0]?.count ?? 0;
		const remoteFollowersCount = remoteFollowersCountRow[0]?.count ?? 0;

		return {
			'local.followings.total': localFollowingsCount,
			'local.followers.total': localFollowersCount,
			'remote.followings.total': remoteFollowingsCount,
			'remote.followers.total': remoteFollowersCount,
		};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	@bindThis
	public async update(follower: { id: MiUser['id']; host: MiUser['host']; }, followee: { id: MiUser['id']; host: MiUser['host']; }, isFollow: boolean): Promise<void> {
		const prefixFollower = this.userEntityService.isLocalUser(follower) ? 'local' : 'remote';
		const prefixFollowee = this.userEntityService.isLocalUser(followee) ? 'local' : 'remote';

		this.commit({
			[`${prefixFollower}.followings.total`]: isFollow ? 1 : -1,
			[`${prefixFollower}.followings.inc`]: isFollow ? 1 : 0,
			[`${prefixFollower}.followings.dec`]: isFollow ? 0 : 1,
		}, follower.id);
		this.commit({
			[`${prefixFollowee}.followers.total`]: isFollow ? 1 : -1,
			[`${prefixFollowee}.followers.inc`]: isFollow ? 1 : 0,
			[`${prefixFollowee}.followers.dec`]: isFollow ? 0 : 1,
		}, followee.id);
	}
}
