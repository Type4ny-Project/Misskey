/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const isConcurrentIndexMigrationEnabled = process.env.MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY === '1';

export class DeduplicateNoteReactionIndex1785289603791 {
	name = 'DeduplicateNoteReactionIndex1785289603791';
	transaction = isConcurrentIndexMigrationEnabled ? false : undefined;

	async up(queryRunner) {
		const concurrently = isConcurrentIndexMigrationEnabled ? ' CONCURRENTLY' : '';
		await queryRunner.query(`DROP INDEX${concurrently} IF EXISTS "IDX_a7751b74317122d11575bff31c"`);
	}

	async down(queryRunner) {
		const concurrently = isConcurrentIndexMigrationEnabled ? ' CONCURRENTLY' : '';
		await queryRunner.query(`CREATE UNIQUE INDEX${concurrently} IF NOT EXISTS "IDX_a7751b74317122d11575bff31c" ON "note_reaction" ("userId", "noteId", "reaction")`);
	}
}
