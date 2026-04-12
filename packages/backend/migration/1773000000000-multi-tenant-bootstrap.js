/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

export class MultiTenantBootstrap1773000000000 {
    name = 'MultiTenantBootstrap1773000000000'

    async up(queryRunner) {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const configDir = path.resolve(__dirname, '../../../.config');
        const configYml = process.env.MISSKEY_CONFIG_YML ?? (process.env.NODE_ENV === 'test' ? 'test.yml' : 'default.yml');
        const configPath = path.resolve(configDir, configYml);
        const builtConfigPath = path.resolve(__dirname, '../../../built/.config.json');
        const loadedConfig = fs.existsSync(configPath)
            ? yaml.load(fs.readFileSync(configPath, 'utf-8'))
            : JSON.parse(fs.readFileSync(builtConfigPath, 'utf-8'));
        const metaRows = await queryRunner.query(`SELECT name, description, "shortName", "themeColor", "maintainerName", "disableRegistration", "termsOfServiceUrl", "privacyPolicyUrl", "iconUrl", "bannerUrl" FROM meta LIMIT 1`);
        const meta = metaRows[0] ?? {};
        const primaryHost = new URL(loadedConfig.url).host;
        const primaryTenantId = 'primary';
        const conflicts = await queryRunner.query(`SELECT local."usernameLower" FROM "user" local INNER JOIN "user" remote ON remote."usernameLower" = local."usernameLower" AND remote.host = $1 WHERE local.host IS NULL LIMIT 20`, [primaryHost]);
        if (conflicts.length > 0) {
            throw new Error(`Cannot bootstrap multi-tenant host backfill because username collisions already exist on ${primaryHost}: ${conflicts.map((row) => row.usernameLower).join(', ')}`);
        }

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "tenant_host_mapping" ("id" character varying(32) NOT NULL, "tenantId" character varying(32) NOT NULL, "host" character varying(255) NOT NULL, "isPrimary" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ, CONSTRAINT "PK_tenant_host_mapping_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_host_mapping_host" ON "tenant_host_mapping" ("host")`);

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "tenant_meta" ("id" character varying(32) NOT NULL, "host" character varying(255) NOT NULL, "name" character varying(512), "shortName" character varying(512), "description" text, "themeColor" character varying(64), "maintainerName" character varying(512), "disableRegistration" boolean NOT NULL DEFAULT false, "tosUrl" character varying(1024), "privacyPolicyUrl" character varying(1024), "iconUrl" character varying(1024), "bannerUrl" character varying(1024), "manifest" jsonb, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ, CONSTRAINT "PK_tenant_meta_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_meta_host" ON "tenant_meta" ("host")`);

        await queryRunner.query(`ALTER TABLE "system_account" ADD COLUMN IF NOT EXISTS "host" character varying(255)`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_system_account_type_host" ON "system_account" ("type", COALESCE("host", ''))`);

        await queryRunner.query(`INSERT INTO "tenant_host_mapping" ("id", "tenantId", "host", "isPrimary") VALUES ($1, $2, $3, true) ON CONFLICT ("host") DO UPDATE SET "tenantId" = EXCLUDED."tenantId", "isPrimary" = true`, [primaryTenantId, primaryTenantId, primaryHost]);
        await queryRunner.query(`INSERT INTO "tenant_meta" ("id", "host", "name", "shortName", "description", "themeColor", "maintainerName", "disableRegistration", "tosUrl", "privacyPolicyUrl", "iconUrl", "bannerUrl") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT ("host") DO NOTHING`, [primaryTenantId, primaryHost, meta.name ?? null, meta.shortName ?? null, meta.description ?? null, meta.themeColor ?? null, meta.maintainerName ?? null, !!meta.disableRegistration, meta.termsOfServiceUrl ?? null, meta.privacyPolicyUrl ?? null, meta.iconUrl ?? null, meta.bannerUrl ?? null]);

        await queryRunner.query(`UPDATE "user" SET "host" = $1 WHERE "host" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "note" SET "userHost" = $1 WHERE "userHost" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "note" SET "replyUserHost" = $1 WHERE "replyUserId" IS NOT NULL AND "replyUserHost" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "note" SET "renoteUserHost" = $1 WHERE "renoteUserId" IS NOT NULL AND "renoteUserHost" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "drive_file" SET "userHost" = $1 WHERE "userHost" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "emoji" SET "host" = $1 WHERE "host" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "poll" SET "userHost" = $1 WHERE "userHost" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "user_profile" SET "userHost" = $1 WHERE "userHost" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "following" SET "followerHost" = $1 WHERE "followerHost" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "following" SET "followeeHost" = $1 WHERE "followeeHost" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "follow_request" SET "followerHost" = $1 WHERE "followerHost" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "follow_request" SET "followeeHost" = $1 WHERE "followeeHost" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "abuse_user_report" SET "targetUserHost" = $1 WHERE "targetUserHost" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "abuse_user_report" SET "reporterHost" = $1 WHERE "reporterHost" IS NULL`, [primaryHost]);
        await queryRunner.query(`UPDATE "system_account" SET "host" = $1 WHERE "host" IS NULL`, [primaryHost]);
    }

    async down(queryRunner) {
        const hosts = (await queryRunner.query(`SELECT host FROM "tenant_host_mapping"`)).map((row) => row.host);
        if (hosts.length > 0) {
            const conflicts = await queryRunner.query(`SELECT "usernameLower", array_agg(host ORDER BY host) AS hosts FROM "user" WHERE host = ANY($1) GROUP BY "usernameLower" HAVING COUNT(*) > 1 LIMIT 20`, [hosts]);
            if (conflicts.length > 0) {
                throw new Error(`Cannot revert multi-tenant bootstrap because username collisions exist across managed hosts: ${conflicts.map((row) => `${row.usernameLower}=>${row.hosts.join('|')}`).join(', ')}`);
            }

            const hostColumns = [
                ['"user"', 'host'],
                ['note', '"userHost"'],
                ['note', '"replyUserHost"'],
                ['note', '"renoteUserHost"'],
                ['drive_file', '"userHost"'],
                ['emoji', 'host'],
                ['poll', '"userHost"'],
                ['user_profile', '"userHost"'],
                ['following', '"followerHost"'],
                ['following', '"followeeHost"'],
                ['follow_request', '"followerHost"'],
                ['follow_request', '"followeeHost"'],
                ['abuse_user_report', '"targetUserHost"'],
                ['abuse_user_report', '"reporterHost"'],
                ['system_account', 'host'],
            ];

            for (const [table, column] of hostColumns) {
                await queryRunner.query(`UPDATE ${table} SET ${column} = NULL WHERE ${column} = ANY($1)`, [hosts]);
            }
        }

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_system_account_type_host"`);
        await queryRunner.query(`ALTER TABLE "system_account" DROP COLUMN IF EXISTS "host"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tenant_meta_host"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "tenant_meta"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tenant_host_mapping_host"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "tenant_host_mapping"`);
    }
}
