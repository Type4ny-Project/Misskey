/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

const COMPILED_CONFIG_PATH = resolve(_dirname, '../../../built/.config.json');

const HOST_COLUMNS = [
	{ table: '"user"', column: 'host' },
	{ table: 'note', column: '"userHost"' },
	{ table: 'note', column: '"replyUserHost"' },
	{ table: 'note', column: '"renoteUserHost"' },
	{ table: 'drive_file', column: '"userHost"' },
	{ table: 'emoji', column: 'host' },
	{ table: 'poll', column: '"userHost"' },
	{ table: 'user_profile', column: '"userHost"' },
	{ table: 'following', column: '"followerHost"' },
	{ table: 'following', column: '"followeeHost"' },
	{ table: 'follow_request', column: '"followerHost"' },
	{ table: 'follow_request', column: '"followeeHost"' },
	{ table: 'abuse_user_report', column: '"targetUserHost"' },
	{ table: 'abuse_user_report', column: '"reporterHost"' },
	{ table: 'system_account', column: 'host' },
];

export function loadCompiledConfig() {
	if (!fs.existsSync(COMPILED_CONFIG_PATH)) {
		throw new Error(`Compiled config not found: ${COMPILED_CONFIG_PATH}. Run pnpm compile-config first.`);
	}

	return JSON.parse(fs.readFileSync(COMPILED_CONFIG_PATH, 'utf-8'));
}

export function getConfigHost(config) {
	return new URL(config.url).host;
}

export function makeTenantId(host) {
	return `t_${createHash('sha1').update(host).digest('hex').slice(0, 20)}`;
}

export async function createPgClient(config) {
	const client = new pg.Client({
		host: config.db.host,
		port: config.db.port,
		user: config.db.user,
		password: config.db.pass,
		database: config.db.db,
	});
	await client.connect();
	return client;
}

export async function ensureTenantSchema(client) {
	await client.query(`CREATE TABLE IF NOT EXISTS "tenant_host_mapping" ("id" character varying(32) NOT NULL, "tenantId" character varying(32) NOT NULL, "host" character varying(255) NOT NULL, "isPrimary" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ, CONSTRAINT "PK_tenant_host_mapping_id" PRIMARY KEY ("id"))`);
	await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_host_mapping_host" ON "tenant_host_mapping" ("host")`);
	await client.query(`CREATE TABLE IF NOT EXISTS "tenant_meta" ("id" character varying(32) NOT NULL, "host" character varying(255) NOT NULL, "name" character varying(512), "shortName" character varying(512), "description" text, "themeColor" character varying(64), "maintainerName" character varying(512), "disableRegistration" boolean NOT NULL DEFAULT false, "tosUrl" character varying(1024), "privacyPolicyUrl" character varying(1024), "iconUrl" character varying(1024), "bannerUrl" character varying(1024), "manifest" jsonb, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ, CONSTRAINT "PK_tenant_meta_id" PRIMARY KEY ("id"))`);
	await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_meta_host" ON "tenant_meta" ("host")`);
	await client.query(`ALTER TABLE "system_account" ADD COLUMN IF NOT EXISTS "host" character varying(255)`);
	await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_system_account_type_host" ON "system_account" ("type", COALESCE("host", ''))`);
}

export async function copyGlobalMetaToTenantMeta(client, tenantId, host) {
	const { rows } = await client.query(`SELECT name, description, "shortName", "themeColor", "maintainerName", "disableRegistration", "termsOfServiceUrl", "privacyPolicyUrl", "iconUrl", "bannerUrl" FROM meta LIMIT 1`);
	const meta = rows[0] ?? {};
	await client.query(
		`INSERT INTO "tenant_meta" ("id", "host", "name", "shortName", "description", "themeColor", "maintainerName", "disableRegistration", "tosUrl", "privacyPolicyUrl", "iconUrl", "bannerUrl") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT ("host") DO UPDATE SET "name" = EXCLUDED."name", "shortName" = EXCLUDED."shortName", "description" = EXCLUDED."description", "themeColor" = EXCLUDED."themeColor", "maintainerName" = EXCLUDED."maintainerName", "disableRegistration" = EXCLUDED."disableRegistration", "tosUrl" = EXCLUDED."tosUrl", "privacyPolicyUrl" = EXCLUDED."privacyPolicyUrl", "iconUrl" = EXCLUDED."iconUrl", "bannerUrl" = EXCLUDED."bannerUrl"`,
		[tenantId, host, meta.name ?? null, meta.shortName ?? null, meta.description ?? null, meta.themeColor ?? null, meta.maintainerName ?? null, !!meta.disableRegistration, meta.termsOfServiceUrl ?? null, meta.privacyPolicyUrl ?? null, meta.iconUrl ?? null, meta.bannerUrl ?? null],
	);
}

export async function assertNoSingleToMultiConflicts(client, targetHost) {
	const { rows } = await client.query(`SELECT local."usernameLower" FROM "user" local INNER JOIN "user" remote ON remote."usernameLower" = local."usernameLower" AND remote.host = $1 WHERE local.host IS NULL LIMIT 20`, [targetHost]);
	if (rows.length > 0) {
		throw new Error(`Cannot convert to multi-tenant: username collisions already exist on host ${targetHost}: ${rows.map(x => x.usernameLower).join(', ')}`);
	}
}

export async function assertNoMultiToSingleConflicts(client, managedHosts) {
	const { rows } = await client.query(`SELECT "usernameLower", array_agg(host ORDER BY host) AS hosts FROM "user" WHERE host = ANY($1) GROUP BY "usernameLower" HAVING COUNT(*) > 1 LIMIT 20`, [managedHosts]);
	if (rows.length > 0) {
		const examples = rows.map(row => `${row.usernameLower}=>${row.hosts.join('|')}`).join(', ');
		throw new Error(`Cannot collapse to single-tenant host=null state because username collisions exist across managed hosts: ${examples}`);
	}
}

export async function backfillNullHostsTo(client, host) {
	for (const { table, column } of HOST_COLUMNS) {
		await client.query(`UPDATE ${table} SET ${column} = $1 WHERE ${column} IS NULL`, [host]);
	}
}

export async function collapseManagedHostsToNull(client, managedHosts) {
	for (const { table, column } of HOST_COLUMNS) {
		await client.query(`UPDATE ${table} SET ${column} = NULL WHERE ${column} = ANY($1)`, [managedHosts]);
	}
}
