/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	assertNoMultiToSingleConflicts,
	collapseManagedHostsToNull,
	createPgClient,
	loadCompiledConfig,
} from './mt_transform_common.js';

const config = loadCompiledConfig();
const client = await createPgClient(config);

console.warn('mt:to-single exports the database back to classic host=null single-tenant state.');
console.warn('Run this when you want to integrate tenants back into a legacy single-tenant Misskey-style data model.');

try {
	await client.query('BEGIN');
	const { rows } = await client.query(`SELECT host FROM "tenant_host_mapping" ORDER BY host`);
	const managedHosts = rows.map(row => row.host);

	if (managedHosts.length === 0) {
		throw new Error('No tenant_host_mapping rows found. Nothing to collapse.');
	}

	await assertNoMultiToSingleConflicts(client, managedHosts);
	await collapseManagedHostsToNull(client, managedHosts);
	await client.query(`DELETE FROM "tenant_meta" WHERE host = ANY($1)`, [managedHosts]);
	await client.query(`DELETE FROM "tenant_host_mapping" WHERE host = ANY($1)`, [managedHosts]);
	await client.query('COMMIT');
	console.log(`Collapsed managed hosts back into host=null single-tenant state: ${managedHosts.join(', ')}`);
} catch (error) {
	await client.query('ROLLBACK');
	throw error;
} finally {
	await client.end();
}
