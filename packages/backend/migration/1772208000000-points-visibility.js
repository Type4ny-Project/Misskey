/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class PointsVisibility1772208000000 {
    name = 'PointsVisibility1772208000000'

    async up(queryRunner) {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_type
                    WHERE typname = 'user_profile_pointsvisibility_enum'
                ) THEN
                    CREATE TYPE "public"."user_profile_pointsvisibility_enum" AS ENUM('public', 'followers', 'private');
                END IF;
            END $$;
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'user_profile'
                      AND column_name = 'pointsVisibility'
                ) THEN
                    ALTER TABLE "user_profile" ADD COLUMN "pointsVisibility" "public"."user_profile_pointsvisibility_enum" NOT NULL DEFAULT 'public';
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
                      AND table_name = 'user_profile'
                      AND column_name = 'loginBonusIsVisible'
                ) THEN
                    UPDATE "user_profile"
                    SET "pointsVisibility" = CASE
                        WHEN "loginBonusIsVisible" = true THEN 'public'::"public"."user_profile_pointsvisibility_enum"
                        ELSE 'private'::"public"."user_profile_pointsvisibility_enum"
                    END;
                END IF;
            END $$;
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'meta'
                      AND column_name = 'pointName'
                ) THEN
                    ALTER TABLE "meta" ADD COLUMN "pointName" character varying(64);
                END IF;
            END $$;
        `);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "pointName"`);
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "pointsVisibility"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_profile_pointsvisibility_enum"`);
    }
}
