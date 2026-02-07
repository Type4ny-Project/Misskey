/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class addLoginBonusColumns1768938654000 {
	name = 'addLoginBonusColumns1768938654000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "points" integer NOT NULL DEFAULT 0`);
		await queryRunner.query(`ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "loginBonusIsVisible" boolean NOT NULL DEFAULT true`);
	}

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "points"`);
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "loginBonusIsVisible"`);
    }
}
