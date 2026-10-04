/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CallsRoomChannel1791148387720 {
	name = 'CallsRoomChannel1791148387720';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "calls_room" ADD "channelId" character varying(32)`);
		await queryRunner.query(`ALTER TABLE "calls_room" ADD CONSTRAINT "FK_calls_room_channel" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "calls_room" DROP CONSTRAINT "FK_calls_room_channel"`);
		await queryRunner.query(`ALTER TABLE "calls_room" DROP COLUMN "channelId"`);
	}
}
