/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddChannelCollaborators1769106528 {
    name = 'AddChannelCollaborators1769106528'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "channel" ADD "collaboratorIds" character varying(64)[] DEFAULT '{}'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "collaboratorIds"`);
    }
}
