/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddCallsRoomMode1783851615551 {
	name = 'AddCallsRoomMode1783851615551';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "calls_room" ADD "mode" character varying(16) NOT NULL DEFAULT 'open'`);
		await queryRunner.query(`ALTER TABLE "calls_room" ADD CONSTRAINT "CHK_calls_room_mode" CHECK ("mode" IN ('open', 'stage'))`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "calls_room" DROP CONSTRAINT "CHK_calls_room_mode"`);
		await queryRunner.query(`ALTER TABLE "calls_room" DROP COLUMN "mode"`);
	}
}
