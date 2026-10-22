/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull, In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { EmojisRepository } from '@/models/_.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { RoleService } from '@/core/RoleService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { EmojiSuggestionService } from '@/core/EmojiSuggestionService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['reactions', 'notes'],

	requireCredential: true,

	kind: 'read:account',
	limit: { duration: 60 * 1000, max: 10 },

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
		private noteEntityService: NoteEntityService,
		private roleService: RoleService,
		@Inject(DI.emojisRepository) private emojisRepository: EmojisRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.getterService.getNoteWithRelations(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			if (!(await this.noteEntityService.isVisibleForMe(note, me.id))) throw new ApiError(meta.errors.noSuchNote);
			const packed = await this.noteEntityService.pack(note, me);
			if (packed.isHidden) throw new ApiError(meta.errors.noSuchNote);
			if (note.reactionAcceptance === 'likeOnly') return { items: [], reason: 'likeOnly' };

			const result = await this.emojiSuggestionService.suggestForNote(note);
			if (!result.items.length) return result;
			const emojis = await this.emojisRepository.findBy({ name: In(result.items.map(item => item.name)), host: IsNull() });
			const roles = await this.roleService.getUserRoles(me.id);
			const nonSensitiveOnly = note.reactionAcceptance === 'nonSensitiveOnly' || note.reactionAcceptance === 'nonSensitiveOnlyForLocalLikeOnlyForRemote';
			return {
				items: result.items.flatMap(item => {
					const emoji = emojis.find(emoji => emoji.name === item.name);
					if (!emoji || (emoji.localOnly && note.userHost != null) || (nonSensitiveOnly && emoji.isSensitive)) return [];
					if (emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.length && !roles.some(role => emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.includes(role.id))) return [];
					return [{ name: emoji.name, score: item.score, aliases: emoji.aliases, category: emoji.category }];
				}),
				reason: result.reason,
			};
		});
	}
}
