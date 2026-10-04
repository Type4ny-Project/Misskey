/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CallsChatRoomCascade1791100643493 {
	name = 'CallsChatRoomCascade1791100643493';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "calls_room" DROP CONSTRAINT "FK_17f321119bf00934a8422cc71ef"`);
		await queryRunner.query(`ALTER TABLE "calls_room" ADD CONSTRAINT "FK_17f321119bf00934a8422cc71ef" FOREIGN KEY ("chatRoomId") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "calls_room" DROP CONSTRAINT "FK_17f321119bf00934a8422cc71ef"`);
		await queryRunner.query(`ALTER TABLE "calls_room" ADD CONSTRAINT "FK_17f321119bf00934a8422cc71ef" FOREIGN KEY ("chatRoomId") REFERENCES "chat_room"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
	}
}
