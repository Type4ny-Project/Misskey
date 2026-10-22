/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Run immediately before AlignSchema, which otherwise cannot create its primary key.
export class DropLegacyEmojiRequest1791103688452 {
	name = 'DropLegacyEmojiRequest1791103688452';

	async up(queryRunner) {
		await queryRunner.query(`DROP TABLE IF EXISTS "legacy_emoji_request"`);
	}

	async down() {
		throw new Error('Deleted legacy emoji requests cannot be restored by reverting this migration.');
	}
}
