/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { EmojiRequestService } from '@/core/EmojiRequestService.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { MetaService } from '@/core/MetaService.js';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository } from '@/models/_.js';
import { FILE_TYPE_IMAGE } from '@/const.js';
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
			duplicateName: {
				message: 'Duplicate name.',
				code: 'DUPLICATE_NAME',
				id: 'f7a3462c-4e6e-4069-8421-b9bd4f4c3975',
			},
			noSuchFile: {
				message: 'No such file.',
				code: 'NO_SUCH_FILE',
			id: '9f18ba1b-283e-4c3a-a53f-5f31fd786f4d',
		},
		unsupportedFileType: {
			message: 'Unsupported file type.',
			code: 'UNSUPPORTED_FILE_TYPE',
			id: 'aa3adf67-3f44-4ee6-b2ee-9ceece75f466',
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
		fileId: {
			type: 'string',
			format: 'misskey:id',
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
	required: ['name', 'fileId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private emojiRequestService: EmojiRequestService,
		private customEmojiService: CustomEmojiService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me, _token, _file, _cleanup, _ip, _headers, tenantContext) => {
			const namePattern = /^[a-z0-9_-]+$/;
			if (!namePattern.test(ps.name)) {
				throw new ApiError(meta.errors.invalidName);
			}

			const driveFile = await this.driveFilesRepository.findOneBy({ id: ps.fileId, userId: me.id });
			if (driveFile == null) throw new ApiError(meta.errors.noSuchFile);
			if (!FILE_TYPE_IMAGE.includes(driveFile.type)) throw new ApiError(meta.errors.unsupportedFileType);

			const isDuplicate = await this.customEmojiService.checkDuplicate(ps.name, tenantContext!.tenantHost);
			if (isDuplicate) throw new ApiError(meta.errors.duplicateName);

			const instance = await this.metaService.fetch(true);
			const autoApproveEmojiRequest = instance.policies?.autoApproveEmojiRequest !== false;

			if (autoApproveEmojiRequest) {
				await this.customEmojiService.add({
					originalUrl: driveFile.url,
					publicUrl: driveFile.webpublicUrl ?? driveFile.url,
					fileType: driveFile.webpublicType ?? driveFile.type,
					name: ps.name,
					category: ps.category ?? null,
					aliases: ps.aliases ?? [],
					host: tenantContext!.tenantHost,
					license: ps.license ?? null,
					isSensitive: false,
					localOnly: false,
					roleIdsThatCanBeUsedThisEmojiAsReaction: [],
				});
			}

			const emojiRequest = await this.emojiRequestService.create(me, {
				name: ps.name,
				category: ps.category ?? null,
				originalUrl: driveFile.url,
				aliases: ps.aliases ?? [],
				license: ps.license ?? null,
				comment: ps.comment ?? '',
			});

			if (autoApproveEmojiRequest) {
				await this.emojiRequestService.approve(emojiRequest);
			}

			return {
				id: emojiRequest.id,
				createdAt: emojiRequest.createdAt.toISOString(),
				status: autoApproveEmojiRequest ? 'approved' : 'pending',
			};
		});
	}
}
