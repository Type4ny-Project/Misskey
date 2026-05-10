export class HashtagFollowing1778352600000 {
	name = 'HashtagFollowing1778352600000'

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "hashtag_following" ("id" character varying(32) NOT NULL, "followerId" character varying(32) NOT NULL, "tag" character varying(128) NOT NULL, CONSTRAINT "PK_hashtag_following_id" PRIMARY KEY ("id")); COMMENT ON COLUMN "hashtag_following"."followerId" IS 'The follower user ID.'; COMMENT ON COLUMN "hashtag_following"."tag" IS 'The normalized hashtag being followed.'`);
		await queryRunner.query(`CREATE INDEX "IDX_hashtag_following_followerId" ON "hashtag_following" ("followerId")`);
		await queryRunner.query(`CREATE INDEX "IDX_hashtag_following_tag" ON "hashtag_following" ("tag")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_hashtag_following_followerId_tag" ON "hashtag_following" ("followerId", "tag")`);
		await queryRunner.query(`ALTER TABLE "hashtag_following" ADD CONSTRAINT "FK_hashtag_following_followerId" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "hashtag_following" DROP CONSTRAINT "FK_hashtag_following_followerId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_hashtag_following_followerId_tag"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_hashtag_following_tag"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_hashtag_following_followerId"`);
		await queryRunner.query(`DROP TABLE "hashtag_following"`);
	}
}
