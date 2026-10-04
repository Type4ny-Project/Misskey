/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CallsRoomModerators1791004244542 {
    name = 'CallsRoomModerators1791004244542';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "calls_room" ADD "moderatorUserIds" character varying array NOT NULL DEFAULT '{}'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "calls_room" DROP COLUMN "moderatorUserIds"`);
    }
}
