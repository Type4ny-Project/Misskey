/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class EmojiSuggestionSettings1772755200000 {
    name = 'EmojiSuggestionSettings1772755200000'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "emojiSuggestionEnabled" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "emojiSuggestionEndpoint" character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "emojiSuggestionApiKey" character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "emojiSuggestionTimeoutMs" integer NOT NULL DEFAULT 300`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "emojiSuggestionMaxSuggestions" integer NOT NULL DEFAULT 8`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "emojiSuggestionMaxSuggestions"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "emojiSuggestionTimeoutMs"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "emojiSuggestionApiKey"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "emojiSuggestionEndpoint"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "emojiSuggestionEnabled"`);
    }
}
