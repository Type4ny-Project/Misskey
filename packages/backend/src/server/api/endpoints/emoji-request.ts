/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { EmojiRequestService } from '@/core/EmojiRequestService.js';
import { DI } from '@/di-symbols.js';
import type { EmojiRequestsRepository } from '@/models/_.js';

export const meta = {
	tags: ['emoji'],

	requireCredential: true,

	secure: false,

	kind: 'read:drive',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			properties: {
				id: { type: 'string' },
				createdAt: { type: 'string' },
				updatedAt: { type: 'string', nullable: true },
				name: { type: 'string' },
				category: { type: 'string', nullable: true },
				originalUrl: { type: 'string' },
				aliases: { type: 'array', items: { type: 'string' } },
				license: { type: 'string', nullable: true },
				comment: { type: 'string' },
				status: { type: 'string' },
				rejectionReason: { type: 'string', nullable: true },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		status: { type: 'string', nullable: true },
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.emojiRequestsRepository)
		private emojiRequestsRepository: EmojiRequestsRepository,

		private emojiRequestService: EmojiRequestService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const emojiRequests = await this.emojiRequestService.list({
				userId: me.id,
				status: ps.status ?? undefined,
				limit: ps.limit,
				sinceId: ps.sinceId,
				untilId: ps.untilId,
			});

			return emojiRequests.map(er => ({
				id: er.id,
				createdAt: er.createdAt.toISOString(),
				updatedAt: er.updatedAt?.toISOString() ?? null,
				name: er.name,
				category: er.category,
				originalUrl: er.originalUrl,
				aliases: er.aliases,
				license: er.license,
				comment: er.comment,
				status: er.status,
				rejectionReason: er.rejectionReason,
			}));
		});
	}
}
