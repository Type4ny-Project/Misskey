/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { EmojiRequestService } from '@/core/EmojiRequestService.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { DriveService } from '@/core/DriveService.js';
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
		duplicateName: {
			message: 'Duplicate name.',
			code: 'DUPLICATE_NAME',
			id: 'f7a3462c-4e6e-4069-8421-b9bd4f4c3975',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		requestId: { type: 'string', format: 'misskey:id' },
	},
	required: ['requestId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		private emojiRequestService: EmojiRequestService,
		private customEmojiService: CustomEmojiService,
		private driveService: DriveService,
	) {
		super(meta, paramDef, async (ps, me, _token, _file, _cleanup, _ip, _headers, tenantContext) => {
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

			const isDuplicate = await this.customEmojiService.checkDuplicate(emojiRequest.name, tenantContext!.tenantHost);
			if (isDuplicate) {
				throw new ApiError(meta.errors.duplicateName);
			}

			const driveFile = await this.driveService.uploadFromUrl({
				url: emojiRequest.originalUrl,
				user: null,
				force: true,
			});

			await this.customEmojiService.add({
				originalUrl: driveFile.url,
				publicUrl: driveFile.webpublicUrl ?? driveFile.url,
				fileType: driveFile.webpublicType ?? driveFile.type,
				name: emojiRequest.name,
				category: emojiRequest.category,
				aliases: emojiRequest.aliases,
				host: tenantContext!.tenantHost,
				license: emojiRequest.license,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			}, me);

			await this.emojiRequestService.approve(emojiRequest);

			return {
				id: emojiRequest.id,
				createdAt: emojiRequest.createdAt.toISOString(),
				updatedAt: emojiRequest.updatedAt?.toISOString() ?? null,
				name: emojiRequest.name,
				category: emojiRequest.category,
				originalUrl: emojiRequest.originalUrl,
				aliases: emojiRequest.aliases,
				license: emojiRequest.license,
				comment: emojiRequest.comment,
				status: 'approved',
				rejectionReason: null,
			};
		});
	}
}
