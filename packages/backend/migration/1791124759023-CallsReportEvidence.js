/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CallsReportEvidence1791124759023 {
    name = 'CallsReportEvidence1791124759023'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "abuse_user_report" ADD "callsContext" jsonb`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" ADD "callsRecording" bytea`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "abuse_user_report" DROP COLUMN "callsRecording"`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" DROP COLUMN "callsContext"`);
    }
}
