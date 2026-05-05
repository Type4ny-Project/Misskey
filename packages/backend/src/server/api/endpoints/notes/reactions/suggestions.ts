/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { EmojiSuggestionService } from '@/core/EmojiSuggestionService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['reactions', 'notes'],

	requireCredential: true,

	kind: 'read:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			items: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						name: { type: 'string', optional: false, nullable: false },
						score: { type: 'number', optional: false, nullable: false },
						aliases: {
							type: 'array',
							optional: false, nullable: false,
							items: { type: 'string', optional: false, nullable: false },
						},
						category: { type: 'string', optional: false, nullable: true },
					},
				},
			},
			reason: { type: 'string', optional: false, nullable: true },
		},
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '3cdb729b-6a3b-4dd7-b8f3-b8a83dd9e422',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['noteId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private getterService: GetterService,
		private emojiSuggestionService: EmojiSuggestionService,
	) {
		super(meta, paramDef, async (ps) => {
			const note = await this.getterService.getNoteWithRelations(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			return await this.emojiSuggestionService.suggestForNote(note);
		});
	}
}
