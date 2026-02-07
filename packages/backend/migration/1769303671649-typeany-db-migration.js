/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class TypeAnyDbMigration1769303671649 {
    name = 'TypeAnyDbMigration1769303671649'

    async up(queryRunner) {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF to_regclass('public.note_schedule') IS NOT NULL
                   AND to_regclass('public.note_draft') IS NOT NULL THEN
                    INSERT INTO "note_draft" (
                        "id",
                        "replyId",
                        "renoteId",
                        "text",
                        "cw",
                        "userId",
                        "localOnly",
                        "reactionAcceptance",
                        "visibility",
                        "fileIds",
                        "visibleUserIds",
                        "hashtag",
                        "channelId",
                        "hasPoll",
                        "pollChoices",
                        "pollMultiple",
                        "pollExpiresAt",
                        "pollExpiredAfter",
                        "scheduledAt",
                        "isActuallyScheduled"
                    )
                    SELECT
                        "id",
                        NULLIF(COALESCE("note"->>'replyId', "note"->'reply'->>'id'), ''),
                        NULLIF(COALESCE("note"->>'renoteId', "note"->'renote'->>'id'), ''),
                        "note"->>'text',
                        "note"->>'cw',
                        "userId",
                        COALESCE(("note"->>'localOnly')::boolean, false),
                        "note"->>'reactionAcceptance',
                        COALESCE("note"->>'visibility', 'public')::note_draft_visibility_enum,
                        COALESCE((
                            SELECT array_remove(array_agg(
                                CASE
                                    WHEN jsonb_typeof(elem) = 'object' THEN elem->>'id'
                                    WHEN jsonb_typeof(elem) = 'string' THEN trim(both '"' from elem::text)
                                    ELSE NULL
                                END
                            ), NULL)
                            FROM jsonb_array_elements(COALESCE("note"->'files', '[]'::jsonb)) elem
                        ), '{}')::varchar[],
                        COALESCE((
                            SELECT array_remove(array_agg(
                                CASE
                                    WHEN jsonb_typeof(elem) = 'object' THEN elem->>'id'
                                    WHEN jsonb_typeof(elem) = 'string' THEN trim(both '"' from elem::text)
                                    ELSE NULL
                                END
                            ), NULL)
                            FROM jsonb_array_elements(COALESCE("note"->'visibleUsers', '[]'::jsonb)) elem
                        ), '{}')::varchar[],
                        NULL,
                        NULLIF(COALESCE("note"->>'channelId', "note"->'channel'->>'id'), ''),
                        CASE WHEN "note"->'poll' IS NULL THEN false ELSE true END,
                        COALESCE((
                            SELECT array_agg(value)
                            FROM jsonb_array_elements_text(COALESCE("note"->'poll'->'choices', '[]'::jsonb)) value
                        ), '{}')::varchar[],
                        COALESCE(("note"->'poll'->>'multiple')::boolean, false),
                        NULLIF("note"->'poll'->>'expiresAt', '')::timestamp with time zone,
                        NULL,
                        "scheduledAt",
                        true
                    FROM "note_schedule"
                    ON CONFLICT ("id") DO NOTHING;
                END IF;
            END $$;
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF to_regclass('public.emoji_request') IS NOT NULL
                   AND NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'emoji_request'
                      AND column_name = 'userId'
                   ) THEN
                    ALTER TABLE "emoji_request" RENAME TO "legacy_emoji_request";
                END IF;
            END $$;
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF to_regclass('public.legacy_emoji_request') IS NOT NULL
                   AND to_regclass('public.emoji_request') IS NULL THEN
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
                    );
                    CREATE INDEX "IDX_EMOJI_REQUEST_USER_ID" ON "emoji_request" ("userId");
                    CREATE INDEX "IDX_EMOJI_REQUEST_STATUS" ON "emoji_request" ("status");
                    CREATE INDEX "IDX_EMOJI_REQUEST_CREATED_AT" ON "emoji_request" ("createdAt");
                END IF;
            END $$;
        `);

		await queryRunner.query(`
			DO $$
			BEGIN
				IF to_regclass('public.legacy_emoji_request') IS NOT NULL
				   AND to_regclass('public.emoji_request') IS NOT NULL THEN
					WITH sys_user AS (
						SELECT "userId"
						FROM "system_account"
						WHERE "type" = 'actor'
						LIMIT 1
					)
                    INSERT INTO "emoji_request" (
                        "id",
                        "createdAt",
                        "updatedAt",
                        "userId",
                        "name",
                        "category",
                        "originalUrl",
                        "publicUrl",
                        "aliases",
                        "license"
                    )
                    SELECT
                        "id",
                        COALESCE("updatedAt", CURRENT_TIMESTAMP),
                        "updatedAt",
						(SELECT "userId" FROM sys_user),
                        "name",
                        "category",
                        "originalUrl",
                        NULLIF("publicUrl", ''),
                        "aliases",
                        "license"
                    FROM "legacy_emoji_request"
					WHERE (SELECT "userId" FROM sys_user) IS NOT NULL
					ON CONFLICT ("id") DO NOTHING;
				END IF;
			END $$;
		`);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'user'
                      AND column_name = 'getPoints'
                ) THEN
                    UPDATE "user" SET "points" = COALESCE("getPoints", 0);
                END IF;
            END $$;
        `);

        await queryRunner.query(`ALTER TABLE IF EXISTS "note_schedule" RENAME TO "legacy_note_schedule"`);
        await queryRunner.query(`ALTER TABLE IF EXISTS "note_unread" RENAME TO "legacy_note_unread"`);
        await queryRunner.query(`ALTER TABLE IF EXISTS "inbox_rule" RENAME TO "legacy_inbox_rule"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "legacy_note_schedule"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "legacy_note_unread"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "legacy_inbox_rule"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "legacy_emoji_request"`);
    }

    async down(queryRunner) {
        await queryRunner.query(`SELECT 1`);
    }
}
