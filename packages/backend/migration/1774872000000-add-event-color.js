/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddEventColor1774872000000 {
	name = 'AddEventColor1774872000000'

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "event" ADD COLUMN "color" character varying(7)');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "event" DROP COLUMN "color"');
	}
}
