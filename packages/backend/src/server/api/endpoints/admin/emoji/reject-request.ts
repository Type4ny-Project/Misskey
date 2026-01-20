/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { EmojiRequestService } from '@/core/EmojiRequestService.js';
import { DI } from '@/di-symbols.js';
import type { EmojiRequestsRepository } from '@/models/_.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['admin', 'emoji'],

	requireCredential: true,

	secure: true,

	requireAdmin: true,

	res: {
		type: 'object',
		optional: false, nullable: false,
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

	errors: {
		noSuchRequest: {
			message: 'No such emoji request.',
			code: 'NO_SUCH_REQUEST',
			id: '3e7c9a2b-4f8c-4d1e-9b7a-3f6e8c7d9a1d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		requestId: { type: 'string', format: 'misskey:id' },
		reason: {
			type: 'string',
			maxLength: 2048,
		},
	},
	required: ['requestId', 'reason'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.emojiRequestsRepository)
		private emojiRequestsRepository: EmojiRequestsRepository,

		private emojiRequestService: EmojiRequestService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const emojiRequest = await this.emojiRequestService.findById(ps.requestId);

			if (emojiRequest == null) {
				throw new ApiError(meta.errors.noSuchRequest);
			}

			if (emojiRequest.status !== 'pending') {
				throw new ApiError({
					message: 'This request is not pending.',
					code: 'NOT_PENDING',
					id: '4f8e0b3c-5f9d-4e2a-8c7d-0e1f2a3b4c5e',
				});
			}

			await this.emojiRequestService.reject(emojiRequest, ps.reason);

			return {
				id: emojiRequest.id,
				createdAt: emojiRequest.createdAt.toISOString(),
				updatedAt: new Date().toISOString(),
				name: emojiRequest.name,
				category: emojiRequest.category,
				originalUrl: emojiRequest.originalUrl,
				aliases: emojiRequest.aliases,
				license: emojiRequest.license,
				comment: emojiRequest.comment,
				status: 'rejected',
				rejectionReason: ps.reason,
			};
		});
	}
}
