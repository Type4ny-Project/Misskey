/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { HashtagFollowingsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['hashtags', 'account'],

	requireCredential: true,

	kind: 'read:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			isFollowing: { type: 'boolean', optional: false, nullable: false },
		},
		required: ['isFollowing'],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		tag: { type: 'string', minLength: 1, maxLength: 128 },
	},
	required: ['tag'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.hashtagFollowingsRepository)
		private hashtagFollowingsRepository: HashtagFollowingsRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const tag = normalizeForSearch(ps.tag.replace(/^#/, ''));
			const count = await this.hashtagFollowingsRepository.countBy({
				followerId: me.id,
				tag,
			});

			return {
				isFollowing: count > 0,
			};
		});
	}
}
