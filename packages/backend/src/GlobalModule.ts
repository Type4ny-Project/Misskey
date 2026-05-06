/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Global, Module } from '@nestjs/common';
import { Meilisearch } from 'meilisearch';
import { DI } from './di-symbols.js';
import { type Config, loadConfigInput } from './config.js';
import { RepositoryModule } from './models/RepositoryModule.js';
import { TenantRuntimeService } from './core/TenantRuntimeService.js';
import { TenantRedisSubMultiplexer } from './core/TenantRedisSubMultiplexer.js';
import { allSettled } from './misc/promise-tracker.js';
import type { Provider, OnApplicationShutdown } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import * as Redis from 'ioredis';
import { MiMeta } from '@/models/Meta.js';

const NEST_LIFECYCLE_HOOKS = new Set<string | symbol>([
	'onModuleInit',
	'onApplicationBootstrap',
	'onModuleDestroy',
	'beforeApplicationShutdown',
	'onApplicationShutdown',
]);

function createLiveProxy<T extends object>(getValue: () => T): T {
	const target = {} as T;
	return new Proxy(target, {
		get(_target, property, receiver) {
			if (property === 'then' || NEST_LIFECYCLE_HOOKS.has(property)) return undefined;

			const value = Reflect.get(getValue(), property, receiver);
			return typeof value === 'function' ? value.bind(getValue()) : value;
		},
		set(_target, property, value, receiver) {
			return Reflect.set(getValue(), property, value, receiver);
		},
		ownKeys() {
			return Reflect.ownKeys(target);
		},
		getOwnPropertyDescriptor(_target, property) {
			return Reflect.getOwnPropertyDescriptor(target, property);
		},
	});
}

const $configInput: Provider = {
	provide: DI.configInput,
	useValue: loadConfigInput(),
};

const $tenantRuntime: Provider = {
	provide: TenantRuntimeService,
	useFactory: async (configInput) => {
		const runtime = new TenantRuntimeService(configInput);
		await runtime.initialize();
		return runtime;
	},
	inject: [DI.configInput],
};

const $config: Provider = {
	provide: DI.config,
	useFactory: (runtime: TenantRuntimeService) => createLiveProxy<Config>(() => runtime.getCurrentConfig()),
	inject: [TenantRuntimeService],
};

const $db: Provider = {
	provide: DI.db,
	useFactory: (runtime: TenantRuntimeService) => createLiveProxy<DataSource>(() => runtime.getCurrentDb()),
	inject: [TenantRuntimeService],
};

const $meta: Provider = {
	provide: DI.meta,
	useFactory: (runtime: TenantRuntimeService) => createLiveProxy<MiMeta>(() => runtime.getCurrentMeta()),
	inject: [TenantRuntimeService],
};

const $meilisearch: Provider = {
	provide: DI.meilisearch,
	useFactory: (config: Config) => {
		if (config.fulltextSearch?.provider === 'meilisearch') {
			if (!config.meilisearch) {
				throw new Error('Meilisearch is enabled but no configuration is provided');
			}

			return new Meilisearch({
				host: `${config.meilisearch.ssl ? 'https' : 'http'}://${config.meilisearch.host}:${config.meilisearch.port}`,
				apiKey: config.meilisearch.apiKey,
			});
		}

		return null;
	},
	inject: [DI.config],
};

const $redis: Provider = {
	provide: DI.redis,
	useFactory: (runtime: TenantRuntimeService) => createLiveProxy<Redis.Redis>(() => runtime.getCurrentRedis()),
	inject: [TenantRuntimeService],
};

const $redisForPub: Provider = {
	provide: DI.redisForPub,
	useFactory: (runtime: TenantRuntimeService) => createLiveProxy<Redis.Redis>(() => runtime.getCurrentRedisForPub()),
	inject: [TenantRuntimeService],
};

const $redisForSub: Provider = {
	provide: DI.redisForSub,
	useFactory: (runtime: TenantRuntimeService) => runtime.getRedisSubMultiplexer() as unknown as Redis.Redis,
	inject: [TenantRuntimeService],
};

const $redisForTimelines: Provider = {
	provide: DI.redisForTimelines,
	useFactory: (runtime: TenantRuntimeService) => createLiveProxy<Redis.Redis>(() => runtime.getCurrentRedisForTimelines()),
	inject: [TenantRuntimeService],
};

const $redisForReactions: Provider = {
	provide: DI.redisForReactions,
	useFactory: (runtime: TenantRuntimeService) => createLiveProxy<Redis.Redis>(() => runtime.getCurrentRedisForReactions()),
	inject: [TenantRuntimeService],
};

@Global()
@Module({
	imports: [RepositoryModule],
	providers: [$configInput, $tenantRuntime, $config, $db, $meta, $meilisearch, $redis, $redisForPub, $redisForSub, $redisForTimelines, $redisForReactions],
	exports: [$configInput, TenantRuntimeService, $config, $db, $meta, $meilisearch, $redis, $redisForPub, $redisForSub, $redisForTimelines, $redisForReactions, RepositoryModule],
})
export class GlobalModule implements OnApplicationShutdown {
	constructor(
		private readonly tenantRuntimeService: TenantRuntimeService,
	) { }

	public async dispose(): Promise<void> {
		await allSettled();
		await this.tenantRuntimeService.dispose();
	}

	async onApplicationShutdown(_signal: string): Promise<void> {
		await this.dispose();
	}
}
