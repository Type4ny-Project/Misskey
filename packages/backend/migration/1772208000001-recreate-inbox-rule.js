/*
 * SPDX-FileCopyrightText: Type4ny-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RecreateInboxRule1772208000001 {
    name = 'RecreateInboxRule1772208000001'

    async up(queryRunner) {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF to_regclass('public.inbox_rule') IS NULL THEN
                    CREATE TABLE "inbox_rule" (
                        "id" character varying(64) NOT NULL,
                        "name" character varying(128) NOT NULL,
                        "description" character varying(256) NOT NULL,
                        "condFormula" jsonb NOT NULL DEFAULT '{}',
                        "action" jsonb NOT NULL,
                        CONSTRAINT "PK_inbox_rule_id" PRIMARY KEY ("id")
                    );
                END IF;
            END $$;
        `);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "inbox_rule"`);
    }
}