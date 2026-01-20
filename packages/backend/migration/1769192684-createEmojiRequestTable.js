/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CreateEmojiRequestTable1769192684 {
    name = 'CreateEmojiRequestTable1769192684'

    async up(queryRunner) {
        await queryRunner.query(`
            CREATE TABLE "emoji_request" (
                "id" character varying(64) NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP WITH TIME ZONE,
                "userId" character varying(64) NOT NULL,
                "name" character varying(128) NOT NULL,
                "category" character varying(128),
                "originalUrl" character varying(512) NOT NULL,
                "publicUrl" character varying(512),
                "aliases" character varying(128)[] DEFAULT '{}',
                "license" character varying(1024),
                "comment" character varying(2048) DEFAULT '',
                "status" character varying(32) DEFAULT 'pending',
                "rejectionReason" text,
                CONSTRAINT "PK_emoji_request_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_EMOJI_REQUEST_USER_ID" ON "emoji_request" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_EMOJI_REQUEST_STATUS" ON "emoji_request" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_EMOJI_REQUEST_CREATED_AT" ON "emoji_request" ("createdAt")`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "IDX_EMOJI_REQUEST_CREATED_AT"`);
        await queryRunner.query(`DROP INDEX "IDX_EMOJI_REQUEST_STATUS"`);
        await queryRunner.query(`DROP INDEX "IDX_EMOJI_REQUEST_USER_ID"`);
        await queryRunner.query(`DROP TABLE "emoji_request"`);
    }
}
