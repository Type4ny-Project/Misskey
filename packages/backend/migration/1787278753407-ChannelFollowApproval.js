/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChannelFollowApproval1787278753407 {
    name = 'ChannelFollowApproval1787278753407'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "channel_follow_request" ("id" character varying(32) NOT NULL, "channelId" character varying(32) NOT NULL, "followerId" character varying(32) NOT NULL, CONSTRAINT "PK_1946cbea7196ec22c747c688880" PRIMARY KEY ("id")); COMMENT ON COLUMN "channel_follow_request"."channelId" IS 'The channel ID.'; COMMENT ON COLUMN "channel_follow_request"."followerId" IS 'The follower user ID.'`);
        await queryRunner.query(`CREATE INDEX "IDX_37dba759526d0abee0a34c8f4e" ON "channel_follow_request" ("channelId")`);
        await queryRunner.query(`CREATE INDEX "IDX_d84a54e9f624e81d0eeb1984a0" ON "channel_follow_request" ("followerId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5847f632d1a682516959b97d20" ON "channel_follow_request" ("followerId", "channelId")`);
        await queryRunner.query(`ALTER TABLE "channel" ADD "isUnlisted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "channel"."isUnlisted" IS 'Whether the channel is hidden from channel discovery surfaces.'`);
        await queryRunner.query(`ALTER TABLE "channel" ADD "isFollowApprovalRequired" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "channel"."isFollowApprovalRequired" IS 'Whether following this channel requires approval.'`);
        await queryRunner.query(`CREATE INDEX "IDX_01d715841fcb2cc4b679950773" ON "channel" ("isUnlisted")`);
        await queryRunner.query(`ALTER TABLE "channel_follow_request" ADD CONSTRAINT "FK_37dba759526d0abee0a34c8f4ed" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "channel_follow_request" ADD CONSTRAINT "FK_d84a54e9f624e81d0eeb1984a09" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "channel_follow_request" DROP CONSTRAINT "FK_d84a54e9f624e81d0eeb1984a09"`);
        await queryRunner.query(`ALTER TABLE "channel_follow_request" DROP CONSTRAINT "FK_37dba759526d0abee0a34c8f4ed"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_01d715841fcb2cc4b679950773"`);
        await queryRunner.query(`COMMENT ON COLUMN "channel"."isFollowApprovalRequired" IS 'Whether following this channel requires approval.'`);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "isFollowApprovalRequired"`);
        await queryRunner.query(`COMMENT ON COLUMN "channel"."isUnlisted" IS 'Whether the channel is hidden from channel discovery surfaces.'`);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "isUnlisted"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5847f632d1a682516959b97d20"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d84a54e9f624e81d0eeb1984a0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_37dba759526d0abee0a34c8f4e"`);
        await queryRunner.query(`DROP TABLE "channel_follow_request"`);
    }
}
