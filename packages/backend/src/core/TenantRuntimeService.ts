/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DataSource } from 'typeorm';
import {
	type ConfigBuildInfo,
	type ConfigInput,
	type Config,
	type DbSlaveSource,
	type DbSource,
	type Source,
	type TenantSource,
	buildConfig,
} from '@/config.js';
import { createPostgresDataSource } from '@/postgres.js';
import { MiMeta } from '@/models/Meta.js';
import { getTenantHost, runWithTenantHost } from '@/core/tenant-context.js';
import { TenantRedisSubMultiplexer } from '@/core/TenantRedisSubMultiplexer.js';

type TenantDefinition = {
	host: string;
	config: Config;
	db: DataSource;
	meta: MiMeta;
	redis: Redis.Redis;
	redisForPub: Redis.Redis;
	redisForSub: Redis.Redis;
	redisForTimelines: Redis.Redis;
	redisForReactions: Redis.Redis;
};

function cloneDb(db: DbSource): DbSource {
	return {
		...db,
		extra: db.extra ? { ...db.extra } : undefined,
	};
}

function cloneDbSlaves(dbSlaves: DbSlaveSource[] | undefined): DbSlaveSource[] | undefined {
	return dbSlaves?.map(slave => ({ ...slave }));
}

async function loadMeta(db: DataSource): Promise<MiMeta> {
	return await db.transaction(async transactionalEntityManager => {
		const metas = await transactionalEntityManager.find(MiMeta, {
			order: {
				id: 'DESC',
			},
		});

		const meta = metas[0];

		if (meta) {
			return meta;
		}

		return await transactionalEntityManager
			.upsert(
				MiMeta,
				{
					id: 'x',
				},
				['id'],
			)
			.then((x) => transactionalEntityManager.findOneByOrFail(MiMeta, x.identifiers[0]));
	});
}

@Injectable()
export class TenantRuntimeService {
	private readonly tenants = new Map<string, TenantDefinition>();
	private buildInfo!: ConfigBuildInfo;
	private redisSubMultiplexer: TenantRedisSubMultiplexer | null = null;

	constructor(
		private readonly configInput: ConfigInput,
	) {
	}

	public async initialize(): Promise<void> {
		this.buildInfo = this.configInput.buildInfo;
		const source = this.configInput.source;
		if (source.hosts != null) {
			const hosts = Object.entries(source.hosts);
			if (hosts.length === 0) {
				throw new Error('hosts must contain at least one tenant.');
			}

			for (const [host, tenant] of hosts) {
				await this.addTenantFromSource(host, source, tenant, tenant.url ?? `https://${host}`);
			}

			return;
		}

		const legacyConfig = buildConfig(source, this.buildInfo);
		await this.addTenant(legacyConfig.host, legacyConfig);

		for (const [host, tenant] of Object.entries(source.tenants?.hosts ?? {})) {
			await this.addTenantFromSource(host, source, tenant, tenant.url ?? `${legacyConfig.scheme}://${host}`);
		}
	}

	private async addTenantFromSource(host: string, source: Source, tenant: TenantSource, fallbackUrl: string): Promise<void> {
		const tenantConfig = buildConfig({
			...source,
			url: tenant.url ?? fallbackUrl,
			db: cloneDb(tenant.db),
			dbReplications: tenant.dbReplications ?? source.dbReplications,
			dbSlaves: cloneDbSlaves(tenant.dbSlaves ?? source.dbSlaves),
			redis: tenant.redis ? { ...tenant.redis } : source.redis ? { ...source.redis } : undefined,
			redisForPubsub: tenant.redisForPubsub ? { ...tenant.redisForPubsub } : source.redisForPubsub ? { ...source.redisForPubsub } : undefined,
			redisForJobQueue: tenant.redisForJobQueue ? { ...tenant.redisForJobQueue } : source.redisForJobQueue ? { ...source.redisForJobQueue } : undefined,
			redisForTimelines: tenant.redisForTimelines ? { ...tenant.redisForTimelines } : source.redisForTimelines ? { ...source.redisForTimelines } : undefined,
			redisForReactions: tenant.redisForReactions ? { ...tenant.redisForReactions } : source.redisForReactions ? { ...source.redisForReactions } : undefined,
			meilisearch: tenant.meilisearch ?? source.meilisearch,
			objectStorage: tenant.objectStorage ?? source.objectStorage,
		}, this.buildInfo);

		await this.addTenant(host, tenantConfig);
	}

	private async addTenant(host: string, config: Config): Promise<void> {
		const db = createPostgresDataSource(config);
		await db.initialize();
		const meta = await loadMeta(db);

		const redis = new Redis.Redis(config.redis);
		const redisForPub = new Redis.Redis(config.redisForPubsub);
		const redisForSub = new Redis.Redis(config.redisForPubsub);
		await redisForSub.subscribe(config.host);
		redisForSub.on('message', (_channel, data) => {
			const obj = JSON.parse(data);
			if (obj.channel === 'internal') {
				const payload = obj.message as { type?: string; body?: { after?: Partial<MiMeta> } };
				if (payload.type === 'metaUpdated' && payload.body?.after) {
					this.patchMeta(host, payload.body.after);
				}
			}
		});
		const redisForTimelines = new Redis.Redis(config.redisForTimelines);
		const redisForReactions = new Redis.Redis(config.redisForReactions);

		this.tenants.set(host, {
			host,
			config,
			db,
			meta,
			redis,
			redisForPub,
			redisForSub,
			redisForTimelines,
			redisForReactions,
		});
	}

	public getKnownHosts(): string[] {
		return [...this.tenants.keys()];
	}

	public getSingleTenantHost(): string {
		const hosts = this.getKnownHosts();
		if (hosts.length === 0) {
			throw new Error('Tenant runtime is not initialized');
		}

		if (hosts.length !== 1) {
			throw new Error(`Tenant host is required because ${hosts.length} tenants are configured: ${hosts.join(', ')}`);
		}

		return hosts[0];
	}

	public resolveHost(rawHost: string | undefined): string {
		const normalized = rawHost?.split(',')[0]?.trim().toLowerCase();
		if (normalized) {
			if (this.tenants.has(normalized)) {
				return normalized;
			}

			const withoutPort = normalized.replace(/:\d+$/, '');
			if (this.tenants.has(withoutPort)) {
				return withoutPort;
			}
		}

		throw new Error(`Unknown tenant host: ${normalized ?? '(missing)'}`);
	}

	public getCurrentHost(): string {
		return getTenantHost() ?? this.getSingleTenantHost();
	}

	public getTenant(host?: string): TenantDefinition {
		const resolvedHost = host ?? this.getCurrentHost();
		const tenant = this.tenants.get(resolvedHost);
		if (tenant == null) {
			throw new Error(`Unknown tenant host: ${resolvedHost}`);
		}

		return tenant;
	}

	public runWithHost<T>(host: string, fn: () => T): T {
		return runWithTenantHost(host, fn);
	}

	public getCurrentConfig(): Config {
		return this.getTenant().config;
	}

	public getCurrentDb(): DataSource {
		return this.getTenant().db;
	}

	public getCurrentMeta(): MiMeta {
		return this.getTenant().meta;
	}

	public getCurrentRedis(): Redis.Redis {
		return this.getTenant().redis;
	}

	public getCurrentRedisForPub(): Redis.Redis {
		return this.getTenant().redisForPub;
	}

	public getCurrentRedisForSub(): Redis.Redis {
		return this.getTenant().redisForSub;
	}

	public getRedisSubMultiplexer(): TenantRedisSubMultiplexer {
		if (this.redisSubMultiplexer == null) {
			this.redisSubMultiplexer = new TenantRedisSubMultiplexer(
				() => this.getCurrentRedisForSub(),
				[...this.tenants.values()].map(tenant => tenant.redisForSub),
			);
		}

		return this.redisSubMultiplexer;
	}

	public getCurrentRedisForTimelines(): Redis.Redis {
		return this.getTenant().redisForTimelines;
	}

	public getCurrentRedisForReactions(): Redis.Redis {
		return this.getTenant().redisForReactions;
	}

	public updateMeta(host: string, meta: MiMeta): void {
		const tenant = this.getTenant(host);
		tenant.meta = meta;
	}

	public patchMeta(host: string, patch: Partial<MiMeta>): void {
		const tenant = this.getTenant(host);
		tenant.meta = {
			...tenant.meta,
			...patch,
			rootUser: null,
		};
	}

	public async dispose(): Promise<void> {
		await Promise.all([...this.tenants.values()].flatMap((tenant) => [
			tenant.db.destroy(),
			tenant.redis.disconnect(),
			tenant.redisForPub.disconnect(),
			tenant.redisForSub.disconnect(),
			tenant.redisForTimelines.disconnect(),
			tenant.redisForReactions.disconnect(),
		]));
	}
}
