/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NormalizeChannelCollaboratorIds1787277329377 {
    name = 'NormalizeChannelCollaboratorIds1787277329377'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "channel" ADD "collaboratorIdsNormalized" character varying(32) array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`
            DO $$
            DECLARE
                collaborator_ids_type text;
            BEGIN
                SELECT data_type
                INTO collaborator_ids_type
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'channel'
                  AND column_name = 'collaboratorIds';

                IF collaborator_ids_type = 'ARRAY' THEN
                    UPDATE "channel"
                    SET "collaboratorIdsNormalized" = COALESCE("collaboratorIds"::text[], '{}');
                ELSIF collaborator_ids_type IN ('json', 'jsonb') THEN
                    UPDATE "channel"
                    SET "collaboratorIdsNormalized" = CASE
                        WHEN "collaboratorIds" IS NULL OR jsonb_typeof("collaboratorIds"::jsonb) <> 'array' THEN '{}'
                        ELSE ARRAY(SELECT jsonb_array_elements_text("collaboratorIds"::jsonb))
                    END;
                END IF;
            END $$;
        `);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "collaboratorIds"`);
        await queryRunner.query(`ALTER TABLE "channel" RENAME COLUMN "collaboratorIdsNormalized" TO "collaboratorIds"`);
        await queryRunner.query(`COMMENT ON COLUMN "channel"."collaboratorIds" IS 'Collaborator user IDs.'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "channel" ADD "collaboratorIdsBeforeNormalization" character varying(64) array DEFAULT '{}'`);
        await queryRunner.query(`UPDATE "channel" SET "collaboratorIdsBeforeNormalization" = "collaboratorIds"::text[]`);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "collaboratorIds"`);
        await queryRunner.query(`ALTER TABLE "channel" RENAME COLUMN "collaboratorIdsBeforeNormalization" TO "collaboratorIds"`);
    }
}
