/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DropNoteReactionUserNoteUniqueIndex1772755300001 {
	name = 'DropNoteReactionUserNoteUniqueIndex1772755300001'

	async up(queryRunner) {
		await queryRunner.query(`
			DROP INDEX IF EXISTS "IDX_ad0c221b25672daf2df320a817"
		`)
	}

	async down(queryRunner) {
		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ad0c221b25672daf2df320a817"
			ON "note_reaction" ("userId", "noteId")
		`)
	}
}
