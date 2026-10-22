/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DropLegacyTables1792643998126 {
	name = 'DropLegacyTables1792643998126';

	async up(queryRunner) {
		await queryRunner.query(`DROP TABLE IF EXISTS
			"legacy_emoji_request",
			"legacy_note_schedule",
			"legacy_note_unread",
			"legacy_inbox_rule"`);
	}

	async down() {
		throw new Error('Deleted legacy data cannot be restored by reverting this migration.');
	}
}
