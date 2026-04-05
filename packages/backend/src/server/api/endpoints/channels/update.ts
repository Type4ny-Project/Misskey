/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { DriveFilesRepository, ChannelsRepository, UsersRepository } from '@/models/_.js';
import { ChannelEntityService } from '@/core/entities/ChannelEntityService.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { ChannelService } from '@/core/ChannelService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['channels'],

	requireCredential: true,

	kind: 'write:channels',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Channel',
	},

	errors: {
		noSuchChannel: {
			message: 'No such channel.',
			code: 'NO_SUCH_CHANNEL',
			id: 'f9c5467f-d492-4c3c-9a8d-a70dacc86512',
		},

		accessDenied: {
			message: 'You do not have edit privilege of the channel.',
			code: 'ACCESS_DENIED',
			id: '1fb7cb09-d46a-4fdf-b8df-057788cce513',
		},

		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'e86c14a4-0da2-4032-8df3-e737a04c7f3b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		channelId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 128 },
		description: { type: 'string', nullable: true, maxLength: 2048 },
		bannerId: { type: 'string', format: 'misskey:id', nullable: true },
		isArchived: { type: 'boolean', nullable: true },
		pinnedNoteIds: {
			type: 'array',
			items: {
				type: 'string', format: 'misskey:id',
			},
		},
		color: { type: 'string', minLength: 1, maxLength: 16 },
		isSensitive: { type: 'boolean', nullable: true },
		allowRenoteToExternal: { type: 'boolean', nullable: true },
		isLocalOnly: { type: 'boolean', optional: true },
		transferAdminUserId: { type: 'string', format: 'misskey:id', optional: true },
		collaboratorIds: {
			type: 'array',
			items: { type: 'string', format: 'misskey:id' },
		},
	},
	required: ['channelId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private channelEntityService: ChannelEntityService,

		private roleService: RoleService,
		private channelService: ChannelService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const channel = await this.channelsRepository.findOneBy({
				id: ps.channelId,
			});

			if (channel == null) {
				throw new ApiError(meta.errors.noSuchChannel);
			}

			const iAmModerator = await this.roleService.isModerator(me);
			const canEdit = await this.channelService.canEditChannel(channel, me, iAmModerator);
			if (!canEdit) {
				throw new ApiError(meta.errors.accessDenied);
			}

			let banner = undefined;
			if (ps.bannerId != null) {
				banner = await this.driveFilesRepository.findOneBy({
					id: ps.bannerId,
					userId: me.id,
				});

				if (banner == null) {
					throw new ApiError(meta.errors.noSuchFile);
				}
			} else if (ps.bannerId === null) {
				banner = null;
			}

			let validatedCollaboratorIds: string[] | undefined = undefined;
			if (ps.collaboratorIds !== undefined) {
				if (channel.userId !== me.id && !iAmModerator) {
					throw new ApiError(meta.errors.accessDenied);
				}
				if (ps.collaboratorIds.length > 0) {
					const users = await this.usersRepository.findBy({
						id: In(ps.collaboratorIds),
					});
					if (users.length !== ps.collaboratorIds.length) {
						throw new ApiError({
							message: 'One or more collaborator user IDs are invalid.',
							code: 'INVALID_COLLABORATOR_USER_IDS',
							id: '3e7c9a2b-4f8c-4d1e-9b7a-3f6e8c7d9a1b',
						});
					}
				}
				validatedCollaboratorIds = ps.collaboratorIds;
			}

			if (ps.isLocalOnly !== undefined) channel.isLocalOnly = ps.isLocalOnly;
			if (ps.transferAdminUserId !== undefined && channel.userId === me.id) {
				channel.userId = ps.transferAdminUserId;
			}

			await this.channelsRepository.update(channel.id, {
				...(ps.name ? { name: ps.name } : {}),
				...(ps.description !== undefined ? { description: ps.description } : {}),
				...(ps.pinnedNoteIds ? { pinnedNoteIds: ps.pinnedNoteIds } : {}),
				...(ps.color ? { color: ps.color } : {}),
				...(typeof ps.isArchived === 'boolean' ? { isArchived: ps.isArchived } : {}),
				...(banner ? { bannerId: banner.id } : {}),
				...(typeof ps.isSensitive === 'boolean' ? { isSensitive: ps.isSensitive } : {}),
				...(typeof ps.allowRenoteToExternal === 'boolean' ? { allowRenoteToExternal: ps.allowRenoteToExternal } : {}),
				...(ps.isLocalOnly !== undefined ? { isLocalOnly: ps.isLocalOnly } : {}),
				...(ps.transferAdminUserId !== undefined && channel.userId === ps.transferAdminUserId ? { userId: ps.transferAdminUserId } : {}),
				...(validatedCollaboratorIds !== undefined ? { collaboratorIds: validatedCollaboratorIds } : {}),
			});

			return await this.channelEntityService.pack(channel.id, me);
		});
	}
}
