/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddMisskeyCallsDomain1783781174801 {
	name = 'AddMisskeyCallsDomain1783781174801';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "calls_room" ("id" character varying(32) NOT NULL, "attachmentType" character varying(16) NOT NULL, "ownerUserId" character varying(32) NOT NULL, "chatRoomId" character varying(32), "title" character varying(256) NOT NULL, "description" character varying(2048) NOT NULL DEFAULT '', "visibility" character varying(16) NOT NULL DEFAULT 'specified', "state" character varying(16) NOT NULL DEFAULT 'scheduled', "scheduledAt" TIMESTAMP WITH TIME ZONE, "startedAt" TIMESTAMP WITH TIME ZONE, "endedAt" TIMESTAMP WITH TIME ZONE, "revision" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "CHK_calls_room_lifecycle" CHECK (("state" = 'scheduled' AND "startedAt" IS NULL AND "endedAt" IS NULL) OR ("state" = 'open' AND "startedAt" IS NOT NULL AND "endedAt" IS NULL) OR ("state" IN ('ended', 'cancelled') AND "endedAt" IS NOT NULL)), CONSTRAINT "CHK_calls_room_revision" CHECK ("revision" >= 0), CONSTRAINT "CHK_calls_room_state" CHECK ("state" IN ('scheduled', 'open', 'ended', 'cancelled')), CONSTRAINT "CHK_calls_room_visibility" CHECK ("visibility" IN ('public', 'followers', 'specified')), CONSTRAINT "CHK_calls_room_attachment_type" CHECK ("attachmentType" IN ('personal', 'chatRoom')), CONSTRAINT "CHK_calls_room_attachment" CHECK (("attachmentType" = 'personal' AND "chatRoomId" IS NULL) OR ("attachmentType" = 'chatRoom' AND "chatRoomId" IS NOT NULL)), CONSTRAINT "PK_acdd3afab4f4cda873dd1f07191" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_99c04881e22c9b061582b0cb27" ON "calls_room" ("attachmentType")`);
		await queryRunner.query(`CREATE INDEX "IDX_d6533c54714bc00769f55e23df" ON "calls_room" ("ownerUserId")`);
		await queryRunner.query(`CREATE INDEX "IDX_17f321119bf00934a8422cc71e" ON "calls_room" ("chatRoomId")`);
		await queryRunner.query(`CREATE INDEX "IDX_06b56bb87b51177fb80089b41f" ON "calls_room" ("state")`);

		await queryRunner.query(`CREATE TABLE "calls_participant" ("id" character varying(32) NOT NULL, "roomId" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "role" character varying(16) NOT NULL, "state" character varying(16) NOT NULL DEFAULT 'active', "isMuted" boolean NOT NULL DEFAULT false, "joinedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "leftAt" TIMESTAMP WITH TIME ZONE, "speakerRequestedAt" TIMESTAMP WITH TIME ZONE, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "CHK_calls_participant_lifecycle" CHECK (("state" = 'active' AND "leftAt" IS NULL) OR ("state" IN ('left', 'removed') AND "leftAt" IS NOT NULL)), CONSTRAINT "CHK_calls_participant_state" CHECK ("state" IN ('active', 'left', 'removed')), CONSTRAINT "CHK_calls_participant_role" CHECK ("role" IN ('host', 'speaker', 'listener')), CONSTRAINT "PK_0b538262b65ff12693c49ee2784" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_e401b7de5a1cf82f77caa16a7f" ON "calls_participant" ("roomId")`);
		await queryRunner.query(`CREATE INDEX "IDX_87a2ccf51162362ba57f8dea70" ON "calls_participant" ("userId")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_calls_participant_one_host" ON "calls_participant" ("roomId") WHERE "role" = 'host'`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b2ce8e7b000008228963c1e79c" ON "calls_participant" ("roomId", "userId")`);

		await queryRunner.query(`CREATE TABLE "calls_moderation_log" ("id" character varying(32) NOT NULL, "roomId" character varying(32) NOT NULL, "actorUserId" character varying(32), "targetParticipantId" character varying(32), "action" character varying(32) NOT NULL, "previousRole" character varying(16), "nextRole" character varying(16), "reason" character varying(512), "roomRevision" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "CHK_calls_moderation_revision" CHECK ("roomRevision" > 0), CONSTRAINT "CHK_calls_moderation_action" CHECK ("action" IN ('promote', 'demote', 'mute', 'unmute', 'remove', 'speakerRequest', 'speakerRequestCancel')), CONSTRAINT "PK_9b836fc6649e4f22b0fe6e7aa3e" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_5956b7b6d080fbd68053c12c95" ON "calls_moderation_log" ("roomId")`);
		await queryRunner.query(`CREATE INDEX "IDX_f021936bee1c5982b252d93219" ON "calls_moderation_log" ("actorUserId")`);
		await queryRunner.query(`CREATE INDEX "IDX_e2e890362dd93b29243b532a46" ON "calls_moderation_log" ("targetParticipantId")`);

		await queryRunner.query(`ALTER TABLE "calls_room" ADD CONSTRAINT "FK_d6533c54714bc00769f55e23dfa" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "calls_room" ADD CONSTRAINT "FK_17f321119bf00934a8422cc71ef" FOREIGN KEY ("chatRoomId") REFERENCES "chat_room"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "calls_participant" ADD CONSTRAINT "FK_e401b7de5a1cf82f77caa16a7f8" FOREIGN KEY ("roomId") REFERENCES "calls_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "calls_participant" ADD CONSTRAINT "FK_87a2ccf51162362ba57f8dea70f" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "calls_moderation_log" ADD CONSTRAINT "FK_5956b7b6d080fbd68053c12c95d" FOREIGN KEY ("roomId") REFERENCES "calls_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "calls_moderation_log" ADD CONSTRAINT "FK_f021936bee1c5982b252d93219b" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "calls_moderation_log" ADD CONSTRAINT "FK_e2e890362dd93b29243b532a469" FOREIGN KEY ("targetParticipantId") REFERENCES "calls_participant"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "calls_moderation_log" DROP CONSTRAINT "FK_e2e890362dd93b29243b532a469"`);
		await queryRunner.query(`ALTER TABLE "calls_moderation_log" DROP CONSTRAINT "FK_f021936bee1c5982b252d93219b"`);
		await queryRunner.query(`ALTER TABLE "calls_moderation_log" DROP CONSTRAINT "FK_5956b7b6d080fbd68053c12c95d"`);
		await queryRunner.query(`ALTER TABLE "calls_participant" DROP CONSTRAINT "FK_87a2ccf51162362ba57f8dea70f"`);
		await queryRunner.query(`ALTER TABLE "calls_participant" DROP CONSTRAINT "FK_e401b7de5a1cf82f77caa16a7f8"`);
		await queryRunner.query(`ALTER TABLE "calls_room" DROP CONSTRAINT "FK_17f321119bf00934a8422cc71ef"`);
		await queryRunner.query(`ALTER TABLE "calls_room" DROP CONSTRAINT "FK_d6533c54714bc00769f55e23dfa"`);
		await queryRunner.query(`DROP TABLE "calls_moderation_log"`);
		await queryRunner.query(`DROP TABLE "calls_participant"`);
		await queryRunner.query(`DROP TABLE "calls_room"`);
	}
}
