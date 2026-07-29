/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const isConcurrentIndexMigrationEnabled = process.env.MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY === '1';

export class EnsureNamedNoteReactionIndexes1785291200000 {
	name = 'EnsureNamedNoteReactionIndexes1785291200000';
	transaction = isConcurrentIndexMigrationEnabled ? false : undefined;

	async up(queryRunner) {
		const concurrently = isConcurrentIndexMigrationEnabled ? ' CONCURRENTLY' : '';
		await queryRunner.query(`CREATE UNIQUE INDEX${concurrently} IF NOT EXISTS "IDX_note_reaction_userId_noteId_reaction" ON "note_reaction" ("userId", "noteId", "reaction")`);
		await queryRunner.query(`CREATE INDEX${concurrently} IF NOT EXISTS "IDX_note_reaction_userId_noteId" ON "note_reaction" ("userId", "noteId")`);
		await queryRunner.query(`DROP INDEX${concurrently} IF EXISTS "IDX_a7751b74317122d11575bff31c"`);
	}

	async down(queryRunner) {
		const concurrently = isConcurrentIndexMigrationEnabled ? ' CONCURRENTLY' : '';
		await queryRunner.query(`CREATE UNIQUE INDEX${concurrently} IF NOT EXISTS "IDX_a7751b74317122d11575bff31c" ON "note_reaction" ("userId", "noteId", "reaction")`);
		await queryRunner.query(`DROP INDEX${concurrently} IF EXISTS "IDX_note_reaction_userId_noteId_reaction"`);
		await queryRunner.query(`DROP INDEX${concurrently} IF EXISTS "IDX_note_reaction_userId_noteId"`);
	}
}
