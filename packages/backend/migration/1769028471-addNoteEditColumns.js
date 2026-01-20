/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddNoteEditColumns1769028471 {
    name = 'AddNoteEditColumns1769028471'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ADD "updatedAtHistory" TIMESTAMP WITH TIME ZONE[]`);
        await queryRunner.query(`ALTER TABLE "note" ADD "noteEditHistory" VARCHAR(3000)[] DEFAULT '{}'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "noteEditHistory"`);
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "updatedAtHistory"`);
    }
}
