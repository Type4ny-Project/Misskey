/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	assertNoSingleToMultiConflicts,
	backfillNullHostsTo,
	copyGlobalMetaToTenantMeta,
	createPgClient,
	ensureTenantSchema,
	getConfigHost,
	loadCompiledConfig,
	makeTenantId,
} from './mt_transform_common.js';

const config = loadCompiledConfig();
const tenantHost = process.env.MISSKEY_MT_HOST ?? getConfigHost(config);
const tenantId = process.env.MISSKEY_MT_TENANT_ID ?? makeTenantId(tenantHost);

const client = await createPgClient(config);

try {
	await client.query('BEGIN');
	await ensureTenantSchema(client);
	await assertNoSingleToMultiConflicts(client, tenantHost);
	await client.query(`INSERT INTO "tenant_host_mapping" ("id", "tenantId", "host", "isPrimary") VALUES ($1, $2, $3, true) ON CONFLICT ("host") DO UPDATE SET "tenantId" = EXCLUDED."tenantId", "isPrimary" = true, "updatedAt" = now()`, [tenantId, tenantId, tenantHost]);
	await copyGlobalMetaToTenantMeta(client, tenantId, tenantHost);
	await backfillNullHostsTo(client, tenantHost);
	await client.query('COMMIT');
	console.log(`Converted local host=null data into tenant host '${tenantHost}' (tenantId=${tenantId}).`);
} catch (error) {
	await client.query('ROLLBACK');
	throw error;
} finally {
	await client.end();
}
