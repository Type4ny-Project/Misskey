/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { HashtagFollowingsRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['hashtags', 'account'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:account',
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

		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const tag = normalizeForSearch(ps.tag.replace(/^#/, ''));

			await this.hashtagFollowingsRepository.createQueryBuilder()
				.insert()
				.values({
					id: this.idService.gen(),
					followerId: me.id,
					tag,
				})
				.orIgnore()
				.execute();
		});
	}
}
