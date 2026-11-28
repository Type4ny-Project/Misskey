/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { IsNull, LessThan, Or } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import type { AccessTokensRepository, AppsRepository, UsersRepository } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import { MemoryKVCache } from '@/misc/cache.js';
import type { MiApp } from '@/models/App.js';
import { CacheService } from '@/core/CacheService.js';
import { isNativeUserToken } from '@/misc/token.js';
import { bindThis } from '@/decorators.js';

// アプリの「最終利用日時」(設定 > アプリ) の粒度。これより細かくは更新しない。
const LAST_USED_AT_UPDATE_INTERVAL_MS = 1000 * 60 * 5; // 5m

export class AuthenticationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AuthenticationError';
	}
}

@Injectable()
export class AuthenticateService implements OnApplicationShutdown {
	private appCache: MemoryKVCache<MiApp>;
	private lastUsedAtTouched: MemoryKVCache<true>;
	private logger: Logger;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.accessTokensRepository)
		private accessTokensRepository: AccessTokensRepository,

		@Inject(DI.appsRepository)
		private appsRepository: AppsRepository,

		private cacheService: CacheService,

		loggerService: LoggerService,
	) {
		this.appCache = new MemoryKVCache<MiApp>(1000 * 60 * 60 * 24 * 7); // 1w
		this.lastUsedAtTouched = new MemoryKVCache<true>(LAST_USED_AT_UPDATE_INTERVAL_MS);
		this.logger = loggerService.getLogger('authenticate');
	}

	@bindThis
	public async authenticate(token: string | null | undefined): Promise<[MiLocalUser | null, MiAccessToken | null]> {
		if (token == null) {
			return [null, null];
		}

		if (isNativeUserToken(token)) {
			const user = await this.cacheService.localUserByNativeTokenCache.fetch(token,
				() => this.usersRepository.findOneBy({ token }) as Promise<MiLocalUser | null>);

			if (user == null) {
				throw new AuthenticationError('user not found');
			}

			return [user, null];
		} else {
			const accessToken = await this.cacheService.fetchAccessToken(token,
				() => this.accessTokensRepository.findOne({
					where: [{
						hash: token.toLowerCase(), // app
					}, {
						token: token, // miauth
					}],
				}));

			if (accessToken == null) {
				throw new AuthenticationError('invalid signature');
			}

			this.touchLastUsedAt(accessToken);

			const user = await this.cacheService.localUserByIdCache.fetch(accessToken.userId,
				() => this.usersRepository.findOneBy({
					id: accessToken.userId,
				}) as Promise<MiLocalUser>);

			if (accessToken.appId) {
				const app = await this.appCache.fetch(accessToken.appId,
					() => this.appsRepository.findOneByOrFail({ id: accessToken.appId! }));

				return [user, {
					id: accessToken.id,
					permission: app.permission,
				} as MiAccessToken];
			} else {
				return [user, accessToken];
			}
		}
	}

	/**
	 * lastUsedAt の更新は一定時間に1回までにする。応答は待たせない。
	 * 更新済みの印はこのプロセスのメモリに持つ。ほかのプロセスや再起動後の重複は、
	 * 条件付きの UPDATE (前回の更新から一定時間たった行だけ) で吸収する。
	 */
	@bindThis
	private touchLastUsedAt(accessToken: MiAccessToken): void {
		if (this.lastUsedAtTouched.get(accessToken.id) !== undefined) return;
		this.lastUsedAtTouched.set(accessToken.id, true);

		const now = Date.now();
		if (accessToken.lastUsedAt != null && now - accessToken.lastUsedAt.getTime() < LAST_USED_AT_UPDATE_INTERVAL_MS) return;

		this.accessTokensRepository.update({
			id: accessToken.id,
			lastUsedAt: Or(IsNull(), LessThan(new Date(now - LAST_USED_AT_UPDATE_INTERVAL_MS))),
		}, {
			lastUsedAt: new Date(now),
		}).catch(err => {
			this.logger.warn(`failed to update lastUsedAt of access token ${accessToken.id}: ${err}`);
		});
	}

	@bindThis
	public dispose(): void {
		this.appCache.dispose();
		this.lastUsedAtTouched.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
