/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class LoginBonusSettings1791144811075 {
    name = 'LoginBonusSettings1791144811075'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "loginBonusResetTime" character varying(5) NOT NULL DEFAULT '00:00'`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "loginBonusMinPoints" integer NOT NULL DEFAULT 1`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "loginBonusMaxPoints" integer NOT NULL DEFAULT 5`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "loginBonusMaxPoints"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "loginBonusMinPoints"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "loginBonusResetTime"`);
    }
}
