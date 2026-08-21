/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fsp } from 'node:fs';
import * as yaml from 'js-yaml';

const _filename = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(_filename), '..');
const configDir = resolve(rootDir, '.config');
const sourceConfigPath = resolve(configDir, 'example.yml');
const generatedConfigPath = resolve(configDir, 'default.yml');
const require = createRequire(resolve(rootDir, 'packages/backend/package.json'));
const { Client } = require('pg');
const Redis = require('ioredis');

const environmentId = createHash('sha256')
	.update(await fsp.realpath(rootDir))
	.digest('hex')
	.slice(0, 12);
const databaseName = process.env.MISSKEY_CODEX_DB_NAME ?? `misskey_codex_${environmentId}`;
const databaseHost = process.env.MISSKEY_CODEX_DB_HOST ?? '127.0.0.1';
const databasePort = Number(process.env.MISSKEY_CODEX_DB_PORT ?? 5432);
const redisHost = process.env.MISSKEY_CODEX_REDIS_HOST ?? '127.0.0.1';
const redisPort = Number(process.env.MISSKEY_CODEX_REDIS_PORT ?? 6379);
const redisDb = Number(process.env.MISSKEY_CODEX_REDIS_DB ?? 1);

if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(databaseName)) {
	throw new Error(`Invalid PostgreSQL database name: ${databaseName}`);
}

if (!Number.isInteger(databasePort) || databasePort <= 0 || databasePort > 65535) {
	throw new Error(`Invalid PostgreSQL port: ${databasePort}`);
}

if (!Number.isInteger(redisPort) || redisPort <= 0 || redisPort > 65535) {
	throw new Error(`Invalid Redis port: ${redisPort}`);
}

if (!Number.isInteger(redisDb) || redisDb < 0) {
	throw new Error(`Invalid Redis database number: ${redisDb}`);
}
const databaseCredentialCandidates = process.env.MISSKEY_CODEX_DB_USER
	? [{
		user: process.env.MISSKEY_CODEX_DB_USER,
		password: process.env.MISSKEY_CODEX_DB_PASSWORD ?? '',
	}]
	: [{
		user: 'example-misskey-user',
		password: 'example-misskey-pass',
	}, {
		user: 'misskey',
		password: '',
	}];
const connectionErrors = [];
let postgres = null;
let databaseUser = '';
let databasePassword = '';

for (const credentials of databaseCredentialCandidates) {
	const candidate = new Client({
		host: databaseHost,
		port: databasePort,
		database: 'postgres',
		...credentials,
	});

	try {
		await candidate.connect();
		postgres = candidate;
		databaseUser = credentials.user;
		databasePassword = credentials.password;
		break;
	} catch (error) {
		connectionErrors.push(error);
		await candidate.end().catch(() => {});
	}
}

if (postgres == null) {
	throw new AggregateError(connectionErrors, `Could not connect to PostgreSQL at ${databaseHost}:${databasePort}.`);
}

try {
	const result = await postgres.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
	if (result.rowCount === 0) {
		try {
			await postgres.query(`CREATE DATABASE "${databaseName}"`);
		} catch (error) {
			if (error?.code !== '42P04') throw error;
		}
	}
} finally {
	await postgres.end();
}

const redis = new Redis({
	host: redisHost,
	port: redisPort,
	db: redisDb,
	lazyConnect: true,
	maxRetriesPerRequest: 0,
});

await redis.connect();

try {
	await redis.ping();
} finally {
	await redis.quit();
}

const config = yaml.load(await fsp.readFile(sourceConfigPath, 'utf-8')) ?? {};
config.url = 'https://misskey.local/';
config.db = {
	...config.db,
	host: databaseHost,
	port: databasePort,
	db: databaseName,
	user: databaseUser,
	pass: databasePassword,
};
config.redis = {
	...config.redis,
	host: redisHost,
	port: redisPort,
	db: redisDb,
};

await fsp.writeFile(generatedConfigPath, yaml.dump(config), { mode: 0o600 });

console.log(`Codex environment configured with PostgreSQL database ${databaseName} and Redis DB ${redisDb}.`);
