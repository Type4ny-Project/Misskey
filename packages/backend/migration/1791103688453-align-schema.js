/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AlignSchema1791103688453 {
	name = 'AlignSchema1791103688453';

	async up(queryRunner) {
		// Preserve existing IDs: TypeORM generates destructive DROP/ADD for varchar length changes.
		await queryRunner.query(`ALTER TABLE "event" DROP CONSTRAINT "FK_event_createdById"`);
		await queryRunner.query(`ALTER TABLE "event" DROP CONSTRAINT "FK_event_approvedById"`);
		await queryRunner.query(`ALTER TABLE "event" DROP CONSTRAINT "FK_event_channelId"`);
		await queryRunner.query(`ALTER TABLE "hashtag_following" DROP CONSTRAINT "FK_hashtag_following_followerId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_EMOJI_REQUEST_USER_ID"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_EMOJI_REQUEST_STATUS"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_EMOJI_REQUEST_CREATED_AT"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_event_startAt"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_event_createdById"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_event_status"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_event_channelId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_hashtag_following_followerId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_hashtag_following_tag"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_hashtag_following_followerId_tag"`);
		await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "loginBonusIsVisible"`);
		await queryRunner.query(`ALTER TABLE "avatar_decoration" ADD "category" character varying(128)`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."points" IS 'The accumulated points from login bonus and other sources.'`);
		await queryRunner.query(`COMMENT ON COLUMN "meta"."enableLoginBonus" IS 'Whether to enable login bonus feature.'`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/Type4ny-Project/Misskey'`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/Type4ny-Project/Misskey/issues/new'`);
		await queryRunner.query(`COMMENT ON COLUMN "user_profile"."pointsVisibility" IS 'Who can view points on profile.'`);
		await queryRunner.query(`COMMENT ON COLUMN "channel"."isLocalOnly" IS 'Whether the channel is local only'`);
		await queryRunner.query(`COMMENT ON COLUMN "note"."updatedAt" IS 'The updated date of the Note.'`);
		await queryRunner.query(`COMMENT ON COLUMN "note"."updatedAtHistory" IS 'History of update timestamps.'`);
		await queryRunner.query(`UPDATE "note" SET "noteEditHistory" = '{}' WHERE "noteEditHistory" IS NULL`);
		await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "noteEditHistory" SET NOT NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "note"."noteEditHistory" IS 'History of previous note texts.'`);
		await queryRunner.query(`ALTER TABLE "emoji_request" DROP CONSTRAINT "PK_emoji_request_id"`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ALTER COLUMN "id" TYPE character varying(32)`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ADD CONSTRAINT "PK_3c74521e048dc744f0c7eb65f4a" PRIMARY KEY ("id")`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ALTER COLUMN "createdAt" SET DEFAULT now()`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ALTER COLUMN "userId" TYPE character varying(32)`);
		await queryRunner.query(`UPDATE "emoji_request" SET "aliases" = '{}' WHERE "aliases" IS NULL`);
		await queryRunner.query(`UPDATE "emoji_request" SET "comment" = '' WHERE "comment" IS NULL`);
		await queryRunner.query(`UPDATE "emoji_request" SET "status" = 'pending' WHERE "status" IS NULL`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ALTER COLUMN "aliases" SET NOT NULL`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ALTER COLUMN "comment" SET NOT NULL`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ALTER COLUMN "status" SET NOT NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."title" IS 'The title of the Event.'`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."startAt" IS 'The start time of the Event.'`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."endAt" IS 'The end time of the Event.'`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."description" IS 'The description of the Event.'`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."url" IS 'The URL of the Event.'`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."color" IS 'The display color of the Event.'`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."tags" IS 'Tags for the Event.'`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."createdById" IS 'The creator user ID.'`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."status" IS 'The approval status: pending, approved, rejected.'`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."approvedById" IS 'The approver/rejector user ID.'`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."channelId" IS 'The linked channel ID.'`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."createdAt" IS 'The created date of the Event.'`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."updatedAt" IS 'The updated date of the Event.'`);
		await queryRunner.query(`ALTER TABLE "inbox_rule" DROP CONSTRAINT "PK_inbox_rule_id"`);
		await queryRunner.query(`ALTER TABLE "inbox_rule" ALTER COLUMN "id" TYPE character varying(32)`);
		await queryRunner.query(`ALTER TABLE "inbox_rule" ADD CONSTRAINT "PK_cb50481ac6e8176c51f004c9456" PRIMARY KEY ("id")`);
		await queryRunner.query(`CREATE INDEX "IDX_6eba9b135837cec1859b42e7da" ON "emoji_request"  ("createdAt") `);
		await queryRunner.query(`CREATE INDEX "IDX_5e4674e4958377354d27ac8215" ON "emoji_request"  ("updatedAt") `);
		await queryRunner.query(`CREATE INDEX "IDX_a4091f9755eb7d8f7a0f44ae28" ON "emoji_request"  ("userId") `);
		await queryRunner.query(`CREATE INDEX "IDX_ea1d771e867e9843300f09d02c" ON "emoji_request"  ("name") `);
		await queryRunner.query(`CREATE INDEX "IDX_cd98ccdc71534bd672ce1fa61f" ON "emoji_request"  ("status") `);
		await queryRunner.query(`CREATE INDEX "IDX_9d71c4ca5c3e3d5c5fd3172460" ON "event"  ("startAt") `);
		await queryRunner.query(`CREATE INDEX "IDX_1d5a6b5f38273d74f192ae552a" ON "event"  ("createdById") `);
		await queryRunner.query(`CREATE INDEX "IDX_d4e8fcaf6d49972cd8df9017fb" ON "event"  ("status") `);
		await queryRunner.query(`CREATE INDEX "IDX_e6675b3a60d4e049d32469e0a3" ON "event"  ("channelId") `);
		await queryRunner.query(`CREATE INDEX "IDX_97cb763f7776150908f12c2edc" ON "hashtag_following"  ("followerId") `);
		await queryRunner.query(`CREATE INDEX "IDX_94562fe1a6afd9bfeb1773f29a" ON "hashtag_following"  ("tag") `);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3c2060ec73b2754f66a8f8f1e2" ON "hashtag_following"  ("followerId", "tag") `);
		// Deleted accounts could leave requests behind before this foreign key existed.
		await queryRunner.query(`DELETE FROM "emoji_request" WHERE NOT EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "emoji_request"."userId")`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ADD CONSTRAINT "FK_a4091f9755eb7d8f7a0f44ae284" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "event" ADD CONSTRAINT "FK_1d5a6b5f38273d74f192ae552a6" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "event" ADD CONSTRAINT "FK_8cf65e2ee25ec8d492b4e860092" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "event" ADD CONSTRAINT "FK_e6675b3a60d4e049d32469e0a3c" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "hashtag_following" ADD CONSTRAINT "FK_97cb763f7776150908f12c2edc4" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "hashtag_following" DROP CONSTRAINT "FK_97cb763f7776150908f12c2edc4"`);
		await queryRunner.query(`ALTER TABLE "event" DROP CONSTRAINT "FK_e6675b3a60d4e049d32469e0a3c"`);
		await queryRunner.query(`ALTER TABLE "event" DROP CONSTRAINT "FK_8cf65e2ee25ec8d492b4e860092"`);
		await queryRunner.query(`ALTER TABLE "event" DROP CONSTRAINT "FK_1d5a6b5f38273d74f192ae552a6"`);
		await queryRunner.query(`ALTER TABLE "emoji_request" DROP CONSTRAINT "FK_a4091f9755eb7d8f7a0f44ae284"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_3c2060ec73b2754f66a8f8f1e2"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_94562fe1a6afd9bfeb1773f29a"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_97cb763f7776150908f12c2edc"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_e6675b3a60d4e049d32469e0a3"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_d4e8fcaf6d49972cd8df9017fb"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_1d5a6b5f38273d74f192ae552a"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_9d71c4ca5c3e3d5c5fd3172460"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_cd98ccdc71534bd672ce1fa61f"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_ea1d771e867e9843300f09d02c"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_a4091f9755eb7d8f7a0f44ae28"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_5e4674e4958377354d27ac8215"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_6eba9b135837cec1859b42e7da"`);
		await queryRunner.query(`ALTER TABLE "inbox_rule" DROP CONSTRAINT "PK_cb50481ac6e8176c51f004c9456"`);
		await queryRunner.query(`ALTER TABLE "inbox_rule" ALTER COLUMN "id" TYPE character varying(64)`);
		await queryRunner.query(`ALTER TABLE "inbox_rule" ADD CONSTRAINT "PK_inbox_rule_id" PRIMARY KEY ("id")`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."updatedAt" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."createdAt" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."channelId" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."approvedById" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."status" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."createdById" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."tags" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."color" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."url" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."description" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."endAt" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."startAt" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "event"."title" IS NULL`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ALTER COLUMN "status" DROP NOT NULL`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ALTER COLUMN "comment" DROP NOT NULL`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ALTER COLUMN "aliases" DROP NOT NULL`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ALTER COLUMN "userId" TYPE character varying(64)`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
		await queryRunner.query(`ALTER TABLE "emoji_request" DROP CONSTRAINT "PK_3c74521e048dc744f0c7eb65f4a"`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ALTER COLUMN "id" TYPE character varying(64)`);
		await queryRunner.query(`ALTER TABLE "emoji_request" ADD CONSTRAINT "PK_emoji_request_id" PRIMARY KEY ("id")`);
		await queryRunner.query(`COMMENT ON COLUMN "note"."noteEditHistory" IS NULL`);
		await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "noteEditHistory" DROP NOT NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "note"."updatedAtHistory" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "note"."updatedAt" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "channel"."isLocalOnly" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "user_profile"."pointsVisibility" IS NULL`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/misskey-dev/misskey/issues/new'`);
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/misskey-dev/misskey'`);
		await queryRunner.query(`COMMENT ON COLUMN "meta"."enableLoginBonus" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."points" IS NULL`);
		await queryRunner.query(`ALTER TABLE "avatar_decoration" DROP COLUMN "category"`);
		await queryRunner.query(`ALTER TABLE "user_profile" ADD "loginBonusIsVisible" boolean NOT NULL DEFAULT true`);
		await queryRunner.query(`UPDATE "user_profile" SET "loginBonusIsVisible" = ("pointsVisibility" = 'public')`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_hashtag_following_followerId_tag" ON "hashtag_following" USING btree ("followerId", "tag") `);
		await queryRunner.query(`CREATE INDEX "IDX_hashtag_following_tag" ON "hashtag_following" USING btree ("tag") `);
		await queryRunner.query(`CREATE INDEX "IDX_hashtag_following_followerId" ON "hashtag_following" USING btree ("followerId") `);
		await queryRunner.query(`CREATE INDEX "IDX_event_channelId" ON "event" USING btree ("channelId") `);
		await queryRunner.query(`CREATE INDEX "IDX_event_status" ON "event" USING btree ("status") `);
		await queryRunner.query(`CREATE INDEX "IDX_event_createdById" ON "event" USING btree ("createdById") `);
		await queryRunner.query(`CREATE INDEX "IDX_event_startAt" ON "event" USING btree ("startAt") `);
		await queryRunner.query(`CREATE INDEX "IDX_EMOJI_REQUEST_CREATED_AT" ON "emoji_request" USING btree ("createdAt") `);
		await queryRunner.query(`CREATE INDEX "IDX_EMOJI_REQUEST_STATUS" ON "emoji_request" USING btree ("status") `);
		await queryRunner.query(`CREATE INDEX "IDX_EMOJI_REQUEST_USER_ID" ON "emoji_request" USING btree ("userId") `);
		await queryRunner.query(`ALTER TABLE "hashtag_following" ADD CONSTRAINT "FK_hashtag_following_followerId" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "event" ADD CONSTRAINT "FK_event_channelId" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "event" ADD CONSTRAINT "FK_event_approvedById" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "event" ADD CONSTRAINT "FK_event_createdById" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}
}
