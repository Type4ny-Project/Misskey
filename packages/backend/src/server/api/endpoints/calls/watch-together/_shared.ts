/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const watchTogetherSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		videoId: { type: 'string', optional: false, nullable: true },
		playing: { type: 'boolean', optional: false, nullable: false },
		position: { type: 'number', optional: false, nullable: false },
		updatedAt: { type: 'number', optional: false, nullable: false },
		revision: { type: 'integer', optional: false, nullable: false },
		serverTime: { type: 'number', optional: false, nullable: false },
	},
} as const;
