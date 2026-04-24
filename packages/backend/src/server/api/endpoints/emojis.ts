/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { EmojiEntityService } from '@/core/entities/EmojiEntityService.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 3600,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			emojis: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'EmojiSimple',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private customEmojiService: CustomEmojiService,
		private emojiEntityService: EmojiEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const emojis = Array.from((await this.customEmojiService.localEmojisCache.fetch()).values())
				.sort((a, b) => {
					if (a.category === null && b.category !== null) return 1;
					if (a.category !== null && b.category === null) return -1;
					if (a.category !== null && b.category !== null) {
						if (a.category < b.category) return -1;
						if (a.category > b.category) return 1;
					}

					if (a.name < b.name) return -1;
					if (a.name > b.name) return 1;
					return 0;
				});

			return {
				emojis: await this.emojiEntityService.packSimpleMany(emojis),
			};
		});
	}
}
