/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NoteReactionLimit1791101914397 {
	name = 'NoteReactionLimit1791101914397';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" ADD "reactionLimit" integer`);
		await queryRunner.query(`ALTER TABLE "note_draft" ADD "reactionLimit" integer`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN "reactionLimit"`);
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "reactionLimit"`);
	}
}
