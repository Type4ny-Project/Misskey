/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class LastLoginBonusDate1791103468369 {
    name = 'LastLoginBonusDate1791103468369'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "lastLoginBonusDate" character varying(32)`);
        // Misskey imports start with login bonuses disabled. On existing enabled
        // instances, preserve the old daily guard to avoid awarding twice.
        await queryRunner.query(`
            UPDATE "user_profile"
            SET "lastLoginBonusDate" = (
                SELECT login_date
                FROM unnest("loggedInDates") AS login_date
                ORDER BY login_date::date DESC
                LIMIT 1
            )
            WHERE (SELECT "enableLoginBonus" FROM "meta" ORDER BY "id" DESC LIMIT 1) = true
        `);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "lastLoginBonusDate"`);
    }
}
