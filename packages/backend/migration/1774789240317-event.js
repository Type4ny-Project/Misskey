export class Event1774789240317 {
	name = 'Event1774789240317'

	async up(queryRunner) {
		await queryRunner.query(`
			CREATE TABLE "event" (
				"id" character varying(32) NOT NULL,
				"title" character varying(128) NOT NULL,
				"startAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"endAt" TIMESTAMP WITH TIME ZONE,
				"description" character varying(2048),
				"url" character varying(512),
				"tags" character varying(128)[] NOT NULL DEFAULT '{}',
				"createdById" character varying(32) NOT NULL,
				"status" character varying(16) NOT NULL DEFAULT 'pending',
				"approvedById" character varying(32),
				"channelId" character varying(32),
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				CONSTRAINT "PK_event" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_event_startAt" ON "event" ("startAt")`);
		await queryRunner.query(`CREATE INDEX "IDX_event_createdById" ON "event" ("createdById")`);
		await queryRunner.query(`CREATE INDEX "IDX_event_status" ON "event" ("status")`);
		await queryRunner.query(`CREATE INDEX "IDX_event_channelId" ON "event" ("channelId")`);
		await queryRunner.query(`ALTER TABLE "event" ADD CONSTRAINT "FK_event_createdById" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "event" ADD CONSTRAINT "FK_event_approvedById" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "event" ADD CONSTRAINT "FK_event_channelId" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "event" DROP CONSTRAINT "FK_event_channelId"`);
		await queryRunner.query(`ALTER TABLE "event" DROP CONSTRAINT "FK_event_approvedById"`);
		await queryRunner.query(`ALTER TABLE "event" DROP CONSTRAINT "FK_event_createdById"`);
		await queryRunner.query(`DROP INDEX "IDX_event_channelId"`);
		await queryRunner.query(`DROP INDEX "IDX_event_status"`);
		await queryRunner.query(`DROP INDEX "IDX_event_createdById"`);
		await queryRunner.query(`DROP INDEX "IDX_event_startAt"`);
		await queryRunner.query(`DROP TABLE "event"`);
	}
}
