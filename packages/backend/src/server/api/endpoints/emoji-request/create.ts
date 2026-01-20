/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { EmojiRequestService } from '@/core/EmojiRequestService.js';
import { DI } from '@/di-symbols.js';
import type { EmojiRequestsRepository } from '@/models/_.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['emoji'],

	requireCredential: true,

	secure: false,

	kind: 'write:drive',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: {
				type: 'string',
				format: 'id',
			},
			createdAt: {
				type: 'string',
				format: 'date-time',
			},
			status: {
				type: 'string',
			},
		},
	},

	errors: {
		invalidName: {
			message: 'Invalid emoji name.',
			code: 'INVALID_NAME',
			id: '3e7c9a2b-4f8c-4d1e-9b7a-3f6e8c7d9a1c',
		},

		invalidUrl: {
			message: 'Invalid emoji URL.',
			code: 'INVALID_URL',
			id: '4d8e0b3c-5f9d-4e2a-8c7d-0e1f2a3b4c5d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: {
			type: 'string',
			minLength: 1,
			maxLength: 128,
			pattern: '^[a-z0-9_-]+$',
		},
		category: {
			type: 'string',
			nullable: true,
			maxLength: 128,
		},
		originalUrl: {
			type: 'string',
			format: 'url',
			maxLength: 512,
		},
		aliases: {
			type: 'array',
			items: { type: 'string', maxLength: 128 },
			maxItems: 16,
			default: [],
		},
		license: {
			type: 'string',
			nullable: true,
			maxLength: 1024,
		},
		comment: {
			type: 'string',
			maxLength: 2048,
			default: '',
		},
	},
	required: ['name', 'originalUrl'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.emojiRequestsRepository)
		private emojiRequestsRepository: EmojiRequestsRepository,

		private emojiRequestService: EmojiRequestService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const namePattern = /^[a-z0-9_-]+$/;
			if (!namePattern.test(ps.name)) {
				throw new ApiError(meta.errors.invalidName);
			}

			const urlPattern = /^https?:\/\/.+/;
			if (!urlPattern.test(ps.originalUrl)) {
				throw new ApiError(meta.errors.invalidUrl);
			}

			const emojiRequest = await this.emojiRequestService.create(me, {
				name: ps.name,
				category: ps.category ?? null,
				originalUrl: ps.originalUrl,
				aliases: ps.aliases ?? [],
				license: ps.license ?? null,
				comment: ps.comment ?? '',
			});

			return {
				id: emojiRequest.id,
				createdAt: emojiRequest.createdAt.toISOString(),
				status: emojiRequest.status,
			};
		});
	}
}
