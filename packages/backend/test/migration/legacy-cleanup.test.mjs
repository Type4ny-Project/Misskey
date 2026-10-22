/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { AlignSchema1791103688453 } from '../../migration/1791103688453-align-schema.js';
import { DropLegacyEmojiRequest1791103688452 } from '../../migration/1791103688452-drop-legacy-emoji-request.js';
import { DropLegacyTables1792643998126 } from '../../migration/1792643998126-drop-legacy-tables.js';

class EmojiAlignment extends AlignSchema1791103688453 {
	async up(queryRunner) {
		// Keep the real emoji alignment SQL; unrelated tables are outside this fixture.
		await super.up({
			query: sql => sql.includes('"emoji_request"') ? queryRunner.query(sql) : Promise.resolve(),
		});
	}
}

async function withDatabase(run) {
	const admin = new Client();
	await admin.connect();
	const database = `legacy_cleanup_test_${process.pid}_${Date.now()}`;
	let client;
	try {
		await admin.query(`CREATE DATABASE "${database}"`);
		client = new Client({ database });
		await client.connect();
		const options = {
			type: 'postgres',
			host: admin.connectionParameters.host,
			port: admin.connectionParameters.port,
			username: admin.connectionParameters.user,
			password: admin.connectionParameters.password,
			database,
		};
		await run(client, options);
	} finally {
		await client?.end();
		await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
		await admin.end();
	}
}

async function createRequests(client) {
	await client.query(`
		CREATE TABLE "user" ("id" varchar(32) PRIMARY KEY);
		INSERT INTO "user" VALUES ('current-user');
		CREATE TABLE "emoji_request" (
			"id" varchar(64) CONSTRAINT "PK_emoji_request_id" PRIMARY KEY,
			"createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" timestamptz,
			"userId" varchar(64),
			"name" varchar(128),
			"aliases" varchar(128)[],
			"comment" varchar(2048),
			"status" varchar(32)
		);
		INSERT INTO "emoji_request" ("id", "userId", "name") VALUES ('current-request', 'current-user', 'keep');
	`);
}

async function createLegacy(client) {
	await client.query(`
		CREATE TABLE "legacy_emoji_request" (
			"id" varchar(32) CONSTRAINT "PK_3c74521e048dc744f0c7eb65f4a" PRIMARY KEY
		);
		INSERT INTO "legacy_emoji_request" VALUES ('obsolete-request');
	`);
}

test('one normal migration run repairs the legacy collision before alignment', async () => {
	await withDatabase(async (client, options) => {
		await createRequests(client);
		await createLegacy(client);
		const historical = new DataSource({ ...options, migrations: [EmojiAlignment] });
		const normal = new DataSource({ ...options, migrations: [EmojiAlignment, DropLegacyTables1792643998126, DropLegacyEmojiRequest1791103688452] });
		try {
			await historical.initialize();
			await assert.rejects(historical.runMigrations(), error => error.code === '42P07');
			await normal.initialize();
			assert.equal((await normal.runMigrations()).length, 3);
			assert.deepEqual((await client.query('SELECT "id", "name" FROM "emoji_request"')).rows, [{ id: 'current-request', name: 'keep' }]);
			assert.deepEqual((await client.query('SELECT "name" FROM "migrations" ORDER BY "id"')).rows.map(row => row.name), [
				'DropLegacyEmojiRequest1791103688452',
				'AlignSchema1791103688453',
				'DropLegacyTables1792643998126',
			]);
			assert.deepEqual(await normal.runMigrations(), []);
			await assert.rejects(new DropLegacyEmojiRequest1791103688452().down(), /cannot be restored/);
		} finally {
			if (normal.isInitialized) await normal.destroy();
			if (historical.isInitialized) await historical.destroy();
		}
	});
});

test('an already aligned database still executes the newly inserted repair', async () => {
	await withDatabase(async (client, options) => {
		await createRequests(client);
		const historical = new DataSource({ ...options, migrations: [EmojiAlignment] });
		const normal = new DataSource({ ...options, migrations: [EmojiAlignment, DropLegacyTables1792643998126, DropLegacyEmojiRequest1791103688452] });
		try {
			await historical.initialize();
			assert.equal((await historical.runMigrations()).length, 1);
			await client.query('CREATE TABLE "legacy_note_unread" ("id" varchar(32) PRIMARY KEY)');
			await normal.initialize();
			assert.equal((await normal.runMigrations()).length, 2);
			assert.equal((await client.query("SELECT to_regclass('public.legacy_note_unread') AS legacy")).rows[0].legacy, null);
			assert.equal((await client.query('SELECT count(*)::int AS count FROM "emoji_request"')).rows[0].count, 1);
			assert.deepEqual(await normal.runMigrations(), []);
		} finally {
			if (normal.isInitialized) await normal.destroy();
			if (historical.isInitialized) await historical.destroy();
		}
	});
});

async function createAllLegacy(client) {
	await createLegacy(client);
	for (const table of ['legacy_note_schedule', 'legacy_note_unread', 'legacy_inbox_rule']) {
		await client.query(`CREATE TABLE "${table}" ("id" varchar(32) PRIMARY KEY)`);
		await client.query(`INSERT INTO "${table}" VALUES ('obsolete-request')`);
	}
}

test('final cleanup removes every retired table and preserves current requests', async () => {
	await withDatabase(async (client) => {
		await createRequests(client);
		await createAllLegacy(client);
		await client.query('ALTER TABLE "legacy_inbox_rule" ADD FOREIGN KEY ("id") REFERENCES "legacy_note_unread"("id")');
		const migration = new DropLegacyTables1792643998126();
		await migration.up(client);
		await migration.up(client);
		for (const table of ['legacy_emoji_request', 'legacy_note_schedule', 'legacy_note_unread', 'legacy_inbox_rule']) {
			assert.equal((await client.query('SELECT to_regclass($1) AS relation', [table])).rows[0].relation, null);
		}
		assert.deepEqual((await client.query('SELECT "id", "name" FROM "emoji_request"')).rows, [{ id: 'current-request', name: 'keep' }]);
		await assert.rejects(migration.down(), /cannot be restored/);
	});
});

test('final cleanup keeps all retired tables if a current table still references one', async () => {
	await withDatabase(async (client) => {
		await createAllLegacy(client);
		await client.query('CREATE TABLE "current_reference" ("id" varchar(32) REFERENCES "legacy_note_unread"("id"))');
		await assert.rejects(new DropLegacyTables1792643998126().up(client), error => error.code === '2BP01');
		for (const table of ['legacy_emoji_request', 'legacy_note_schedule', 'legacy_note_unread', 'legacy_inbox_rule']) {
			assert.equal((await client.query(`SELECT count(*)::int AS count FROM "${table}"`)).rows[0].count, 1);
		}
	});
});
