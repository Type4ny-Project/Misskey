/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CallsActiveAttachmentUnique1783833710858 {
	name = 'CallsActiveAttachmentUnique1783833710858'

	async up(queryRunner) {
		await queryRunner.query(`WITH ranked AS (
			SELECT "id", ROW_NUMBER() OVER (
				PARTITION BY "attachmentType", CASE WHEN "attachmentType" = 'personal' THEN "ownerUserId" ELSE "chatRoomId" END
				ORDER BY "createdAt" DESC, "id" DESC
			) AS "position"
			FROM "calls_room"
			WHERE "state" IN ('scheduled', 'open')
		)
		UPDATE "calls_room" AS room
		SET "state" = CASE WHEN room."state" = 'scheduled' THEN 'cancelled' ELSE 'ended' END,
			"endedAt" = COALESCE(room."endedAt", now()),
			"revision" = room."revision" + 1,
			"updatedAt" = now()
		FROM ranked
		WHERE room."id" = ranked."id" AND ranked."position" > 1`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_calls_room_active_personal_owner" ON "calls_room" ("ownerUserId") WHERE "attachmentType" = 'personal' AND "state" IN ('scheduled', 'open')`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_calls_room_active_chat_room" ON "calls_room" ("chatRoomId") WHERE "attachmentType" = 'chatRoom' AND "state" IN ('scheduled', 'open')`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_calls_room_active_chat_room"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_calls_room_active_personal_owner"`);
	}
}
