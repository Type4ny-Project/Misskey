/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DropLegacyEmojiRequest1792642930323 {
	name = 'DropLegacyEmojiRequest1792642930323';

	async up(queryRunner) {
		await queryRunner.query(`DROP TABLE IF EXISTS "legacy_emoji_request"`);
	}

	async down() {
		throw new Error('Deleted legacy emoji requests cannot be restored by reverting this migration.');
	}
}
