/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { type FastifyServerOptions } from 'fastify';
import type * as Sentry from '@sentry/node';
import type * as SentryVue from '@sentry/vue';
import type { RedisOptions } from 'ioredis';

export type RedisOptionsSource = Partial<RedisOptions> & {
	host: string;
	port: number;
	family?: number;
	pass: string;
	db?: number;
	prefix?: string;
};

export type DbSource = {
	host: string;
	port: number;
	db?: string;
	user?: string;
	pass?: string;
	disableCache?: boolean;
	extra?: { [x: string]: string };
};

export type DbSlaveSource = {
	host: string;
	port: number;
	db: string;
	user: string;
	pass: string;
};

export type MeilisearchSource = {
	host: string;
	port: string;
	apiKey: string;
	ssl?: boolean;
	index: string;
	scope?: 'local' | 'global' | string[];
};

export type ObjectStorageSource = {
	useObjectStorage: boolean;
	objectStorageBaseUrl: string;
	objectStorageBucket: string;
	objectStoragePrefix: string;
	objectStorageEndpoint: string;
	objectStorageRegion: string;
	objectStoragePort?: number;
	objectStorageAccessKey: string;
	objectStorageSecretKey: string;
	objectStorageUseSSL?: boolean;
	objectStorageUseProxy?: boolean;
	objectStorageSetPublicRead?: boolean;
	objectStorageS3ForcePathStyle?: boolean;
};

export type TenantSource = {
	url?: string;
	db: DbSource;
	dbReplications?: boolean;
	dbSlaves?: DbSlaveSource[];
	redis?: RedisOptionsSource;
	redisForPubsub?: RedisOptionsSource;
	redisForJobQueue?: RedisOptionsSource;
	redisForTimelines?: RedisOptionsSource;
	redisForReactions?: RedisOptionsSource;
	meilisearch?: MeilisearchSource;
	objectStorage?: ObjectStorageSource;
};

/**
 * 設定ファイルの型
 */
export type Source = {
	url?: string;
	port?: number;
	socket?: string;
	trustProxy?: FastifyServerOptions['trustProxy'];
	chmodSocket?: string;
	enableIpRateLimit?: boolean;
	disableHsts?: boolean;
	db?: DbSource;
	dbReplications?: boolean;
	dbSlaves?: DbSlaveSource[];
	redis?: RedisOptionsSource;
	redisForPubsub?: RedisOptionsSource;
	redisForJobQueue?: RedisOptionsSource;
	redisForTimelines?: RedisOptionsSource;
	redisForReactions?: RedisOptionsSource;
	fulltextSearch?: {
		provider?: FulltextSearchProvider;
	};
	meilisearch?: MeilisearchSource;
	sentryForBackend?: { options: Partial<Sentry.NodeOptions>; enableNodeProfiling: boolean; };
	sentryForFrontend?: {
		options: Partial<SentryVue.BrowserOptions> & { dsn: string };
		vueIntegration?: SentryVue.VueIntegrationOptions | null;
		browserTracingIntegration?: Parameters<typeof SentryVue.browserTracingIntegration>[0] | null;
		replayIntegration?: Parameters<typeof SentryVue.replayIntegration>[0] | null;
	};

	adminUserName?: string;
	adminPassword?: string;
	rootUserName?: string;
	rootPassword?: string;

	objectStorage?: ObjectStorageSource;
	hosts?: Record<string, TenantSource>;
	tenants?: {
		default?: string;
		hosts: Record<string, TenantSource>;
	};

	publishTarballInsteadOfProvideRepositoryUrl?: boolean;

	setupPassword?: string;

	proxy?: string;
	proxySmtp?: string;
	proxyBypassHosts?: string[];

	allowedPrivateNetworks?: string[];

	maxFileSize?: number;

	clusterLimit?: number;

	id: string;

	outgoingAddress?: string;
	outgoingAddressFamily?: 'ipv4' | 'ipv6' | 'dual';

	deliverJobConcurrency?: number;
	inboxJobConcurrency?: number;
	relationshipJobConcurrency?: number;
	deliverJobPerSec?: number;
	inboxJobPerSec?: number;
	relationshipJobPerSec?: number;
	deliverJobMaxAttempts?: number;
	inboxJobMaxAttempts?: number;

	mediaProxy?: string;
	videoThumbnailGenerator?: string;

	perChannelMaxNoteCacheCount?: number;
	perUserNotificationsMaxCount?: number;
	deactivateAntennaThreshold?: number;
	maxLocalUsers?: number;
	pidFile: string;

	logging?: {
		sql?: {
			disableQueryTruncation?: boolean,
			enableQueryParamLogging?: boolean,
		}
	}
};

export type Config = {
	url: string;
	port: number;
	socket: string | undefined;
	trustProxy: NonNullable<FastifyServerOptions['trustProxy']>;
	chmodSocket: string | undefined;
	enableIpRateLimit: boolean;
	disableHsts: boolean | undefined;
	db: {
		host: string;
		port: number;
		db: string;
		user: string;
		pass: string;
		disableCache?: boolean;
		extra?: { [x: string]: string };
	};
	dbReplications: boolean | undefined;
	dbSlaves: {
		host: string;
		port: number;
		db: string;
		user: string;
		pass: string;
	}[] | undefined;
	fulltextSearch?: {
		provider?: FulltextSearchProvider;
	};
	meilisearch: {
		host: string;
		port: string;
		apiKey: string;
		ssl?: boolean;
		index: string;
		scope?: 'local' | 'global' | string[];
	} | undefined;
	proxy: string | undefined;
	proxySmtp: string | undefined;
	proxyBypassHosts: string[] | undefined;
	allowedPrivateNetworks: string[] | undefined;
	maxFileSize: number;
	clusterLimit: number | undefined;
	id: string;
	outgoingAddress: string | undefined;
	outgoingAddressFamily: 'ipv4' | 'ipv6' | 'dual' | undefined;
	deliverJobConcurrency: number | undefined;
	inboxJobConcurrency: number | undefined;
	relationshipJobConcurrency: number | undefined;
	deliverJobPerSec: number | undefined;
	inboxJobPerSec: number | undefined;
	relationshipJobPerSec: number | undefined;
	deliverJobMaxAttempts: number | undefined;
	inboxJobMaxAttempts: number | undefined;
	logging?: {
		sql?: {
			disableQueryTruncation?: boolean,
			enableQueryParamLogging?: boolean,
		}
	}

	version: string;
	publishTarballInsteadOfProvideRepositoryUrl: boolean;
	setupPassword: string | undefined;
	host: string;
	hostname: string;
	scheme: string;
	wsScheme: string;
	apiUrl: string;
	wsUrl: string;
	authUrl: string;
	driveUrl: string;
	userAgent: string;
	frontendManifestExists: boolean;
	frontendEmbedManifestExists: boolean;
	rootDir: string;
	mediaProxy: string;
	externalMediaProxyEnabled: boolean;
	videoThumbnailGenerator: string | null;
	redis: RedisOptions & RedisOptionsSource;
	redisForPubsub: RedisOptions & RedisOptionsSource;
	redisForJobQueue: RedisOptions & RedisOptionsSource;
	redisForTimelines: RedisOptions & RedisOptionsSource;
	redisForReactions: RedisOptions & RedisOptionsSource;
	sentryForBackend: { options: Partial<Sentry.NodeOptions>; enableNodeProfiling: boolean; } | undefined;
	sentryForFrontend: {
		options: Partial<SentryVue.BrowserOptions> & { dsn: string };
		vueIntegration?: SentryVue.VueIntegrationOptions | null;
		browserTracingIntegration?: Parameters<typeof SentryVue.browserTracingIntegration>[0] | null;
		replayIntegration?: Parameters<typeof SentryVue.replayIntegration>[0] | null;
	} | undefined;
	perChannelMaxNoteCacheCount: number;
	perUserNotificationsMaxCount: number;
	deactivateAntennaThreshold: number;
	maxLocalUsers: number;
	adminUserName: string | undefined;
	adminPassword: string | undefined;
	rootUserName: string | undefined;
	rootPassword: string | undefined;
	objectStorage?: {
		useObjectStorage?: boolean;
		objectStorageBaseUrl?: string;
		objectStorageBucket?: string;
		objectStoragePrefix?: string;
		objectStorageEndpoint?: string;
		objectStorageRegion?: string;
		objectStoragePort?: number;
		objectStorageAccessKey?: string;
		objectStorageSecretKey?: string;
		objectStorageUseSSL?: boolean;
		objectStorageUseProxy?: boolean;
		objectStorageSetPublicRead?: boolean;
		objectStorageS3ForcePathStyle?: boolean;
	};
	pidFile: string;
};

export type ConfigBuildInfo = {
	version: string;
	frontendManifestExists: boolean;
	frontendEmbedManifestExists: boolean;
};

export type ConfigInput = {
	source: Source;
	buildInfo: ConfigBuildInfo;
};

export type FulltextSearchProvider = 'sqlLike' | 'sqlPgroonga' | 'meilisearch';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

/** Path of repository root directory */
let rootDir = _dirname;
// 見つかるまで上に遡る
while (!fs.existsSync(resolve(rootDir, 'packages'))) {
	const parentDir = dirname(rootDir);
	if (parentDir === rootDir) {
		throw new Error('Cannot find root directory');
	}
	rootDir = parentDir;
}

/** Path of configuration directory */
const configDir = resolve(rootDir, '.config');
/** Path of built directory */
const projectBuiltDir = resolve(rootDir, 'built');

const compiledConfigFilePathForTest = resolve(projectBuiltDir, '._config_.json');

export const compiledConfigFilePath = fs.existsSync(compiledConfigFilePathForTest)
	? compiledConfigFilePathForTest
	: resolve(projectBuiltDir, '.config.json');

export function loadConfigInput(): ConfigInput {
	if (!fs.existsSync(compiledConfigFilePath)) {
		throw new Error('Compiled configuration file not found. Try running \'pnpm compile-config\'.');
	}

	const meta = JSON.parse(fs.readFileSync(resolve(projectBuiltDir, 'meta.json'), 'utf-8'));

	const frontendManifestExists = fs.existsSync(resolve(projectBuiltDir, '_frontend_vite_/manifest.json'));
	const frontendEmbedManifestExists = fs.existsSync(resolve(projectBuiltDir, '_frontend_embed_vite_/manifest.json'));

	const config = JSON.parse(fs.readFileSync(compiledConfigFilePath, 'utf-8')) as Source;

	return {
		source: config,
		buildInfo: {
			version: meta.version,
			frontendManifestExists,
			frontendEmbedManifestExists,
		},
	};
}

export function buildConfig(config: Source, buildInfo: ConfigBuildInfo): Config {

	const url = tryCreateUrl(requireUrl(config));
	const version = buildInfo.version;
	const host = url.host;
	const hostname = url.hostname;
	const scheme = url.protocol.replace(/:$/, '');
	const wsScheme = scheme.replace('http', 'ws');
	const dbSource = requireDbSource(config);
	const redisSource = requireRedisSource(config);

	const dbDb = process.env.DATABASE_DB ?? dbSource.db ?? '';
	const dbHost = process.env.DATABASE_HOST ?? dbSource.host;
	const dbPort = process.env.DATABASE_PORT ? parseInt(process.env.DATABASE_PORT, 10) : dbSource.port;
	const dbUser = process.env.DATABASE_USER ?? dbSource.user ?? '';
	const dbPass = process.env.DATABASE_PASSWORD ?? dbSource.pass ?? '';

	const externalMediaProxy = config.mediaProxy ?
		config.mediaProxy.endsWith('/') ? config.mediaProxy.substring(0, config.mediaProxy.length - 1) : config.mediaProxy
		: null;
	const internalMediaProxy = `${scheme}://${host}/proxy`;
	const redis = convertRedisOptions(redisSource, host);

	return {
		version,
		publishTarballInsteadOfProvideRepositoryUrl: !!config.publishTarballInsteadOfProvideRepositoryUrl,
		setupPassword: config.setupPassword,
		url: url.origin,
		port: config.port ?? parseInt(process.env.PORT ?? '', 10),
		socket: config.socket,
		trustProxy: config.trustProxy ?? [
			'10.0.0.0/8',
			'172.16.0.0/12',
			'192.168.0.0/16',
			'127.0.0.1/32',
			'::1/128',
			'fc00::/7',
		],
		chmodSocket: config.chmodSocket,
		disableHsts: config.disableHsts,
		enableIpRateLimit: config.enableIpRateLimit ?? true,
		host,
		hostname,
		scheme,
		wsScheme,
		wsUrl: `${wsScheme}://${host}`,
		apiUrl: `${scheme}://${host}/api`,
		authUrl: `${scheme}://${host}/auth`,
		driveUrl: `${scheme}://${host}/files`,
		db: { ...dbSource, host: dbHost, port: dbPort, db: dbDb, user: dbUser, pass: dbPass },
		dbReplications: config.dbReplications,
		dbSlaves: config.dbSlaves,
		fulltextSearch: config.fulltextSearch,
		meilisearch: config.meilisearch,
		redis,
		redisForPubsub: config.redisForPubsub ? convertRedisOptions(config.redisForPubsub, host) : redis,
		redisForJobQueue: config.redisForJobQueue ? convertRedisOptions(config.redisForJobQueue, host) : redis,
		redisForTimelines: config.redisForTimelines ? convertRedisOptions(config.redisForTimelines, host) : redis,
		redisForReactions: config.redisForReactions ? convertRedisOptions(config.redisForReactions, host) : redis,
		sentryForBackend: config.sentryForBackend,
		sentryForFrontend: config.sentryForFrontend,
		id: config.id,
		proxy: config.proxy,
		proxySmtp: config.proxySmtp,
		proxyBypassHosts: config.proxyBypassHosts,
		allowedPrivateNetworks: config.allowedPrivateNetworks,
		maxFileSize: config.maxFileSize ?? 262144000,
		clusterLimit: config.clusterLimit,
		outgoingAddress: config.outgoingAddress,
		outgoingAddressFamily: config.outgoingAddressFamily,
		deliverJobConcurrency: config.deliverJobConcurrency,
		inboxJobConcurrency: config.inboxJobConcurrency,
		relationshipJobConcurrency: config.relationshipJobConcurrency,
		deliverJobPerSec: config.deliverJobPerSec,
		inboxJobPerSec: config.inboxJobPerSec,
		relationshipJobPerSec: config.relationshipJobPerSec,
		deliverJobMaxAttempts: config.deliverJobMaxAttempts,
		inboxJobMaxAttempts: config.inboxJobMaxAttempts,
		mediaProxy: externalMediaProxy ?? internalMediaProxy,
		externalMediaProxyEnabled: externalMediaProxy !== null && externalMediaProxy !== internalMediaProxy,
		videoThumbnailGenerator: config.videoThumbnailGenerator ?
			config.videoThumbnailGenerator.endsWith('/') ? config.videoThumbnailGenerator.substring(0, config.videoThumbnailGenerator.length - 1) : config.videoThumbnailGenerator
			: null,
		userAgent: `Misskey/${version} (${config.url})`,
		frontendManifestExists: buildInfo.frontendManifestExists,
		frontendEmbedManifestExists: buildInfo.frontendEmbedManifestExists,
		rootDir,
		perChannelMaxNoteCacheCount: config.perChannelMaxNoteCacheCount ?? 1000,
		perUserNotificationsMaxCount: config.perUserNotificationsMaxCount ?? 500,
		deactivateAntennaThreshold: config.deactivateAntennaThreshold ?? (1000 * 60 * 60 * 24 * 7),
		maxLocalUsers: config.maxLocalUsers ?? -1,
		adminUserName: config.adminUserName,
		adminPassword: config.adminPassword,
		rootUserName: config.rootUserName,
		rootPassword: config.rootPassword,
		objectStorage: config.objectStorage ?? {},
		pidFile: config.pidFile,
		logging: config.logging,
	};
}

function requireUrl(config: Source): string {
	const url = config.url ?? process.env.MISSKEY_URL;
	if (url == null || url === '') {
		throw new Error('url is required for each configured tenant.');
	}

	return url;
}

function requireDbSource(config: Source): DbSource {
	if (config.db == null) {
		throw new Error('db is required for each configured tenant.');
	}

	return config.db;
}

function requireRedisSource(config: Source): RedisOptionsSource {
	if (config.redis == null) {
		throw new Error('redis is required for each configured tenant.');
	}

	return config.redis;
}

export function loadConfig(): Config {
	const input = loadConfigInput();
	return buildConfig(getProcessConfigSource(input.source), input.buildInfo);
}

export function getProcessConfigSource(source: Source): Source {
	if (source.hosts == null) {
		return source;
	}

	const [firstHostEntry] = Object.entries(source.hosts);
	if (firstHostEntry == null) {
		throw new Error('hosts must contain at least one tenant.');
	}

	const [host, tenant] = firstHostEntry;
	// Process-wide boot code needs one concrete Config; routing still uses explicit Host resolution.
	return {
		...source,
		url: tenant.url ?? `https://${host}`,
		db: tenant.db,
		dbReplications: tenant.dbReplications ?? source.dbReplications,
		dbSlaves: tenant.dbSlaves ?? source.dbSlaves,
		redis: tenant.redis ?? source.redis,
		redisForPubsub: tenant.redisForPubsub ?? source.redisForPubsub,
		redisForJobQueue: tenant.redisForJobQueue ?? source.redisForJobQueue,
		redisForTimelines: tenant.redisForTimelines ?? source.redisForTimelines,
		redisForReactions: tenant.redisForReactions ?? source.redisForReactions,
		meilisearch: tenant.meilisearch ?? source.meilisearch,
		objectStorage: tenant.objectStorage ?? source.objectStorage,
	};
}

function tryCreateUrl(url: string) {
	try {
		return new URL(url);
	} catch (_) {
		throw new Error(`url="${url}" is not a valid URL.`);
	}
}

function convertRedisOptions(options: RedisOptionsSource, host: string): RedisOptions & RedisOptionsSource {
	return {
		...options,
		password: options.pass,
		prefix: options.prefix ?? host,
		family: options.family ?? 0,
		keyPrefix: `${options.prefix ?? host}:`,
		db: options.db ?? 0,
	};
}
