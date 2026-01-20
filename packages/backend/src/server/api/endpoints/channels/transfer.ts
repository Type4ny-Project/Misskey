/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ChannelsRepository, UsersRepository } from '@/models/_.js';
import { ChannelEntityService } from '@/core/entities/ChannelEntityService.js';
import { DI } from '@/di-symbols.js';
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

		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'a3f02e4d-5c3a-4b7c-9e3f-1d2a3b4c5d6e',
		},

		cannotTransferToSelf: {
			message: 'Cannot transfer channel to yourself.',
			code: 'CANNOT_TRANSFER_TO_SELF',
			id: 'b4f06e5d-6c4b-5d8c-0f1e-2d3b4c5e6f7a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		channelId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['channelId', 'userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private channelEntityService: ChannelEntityService,

		private channelService: ChannelService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const channel = await this.channelsRepository.findOneBy({
				id: ps.channelId,
			});

			if (channel == null) {
				throw new ApiError(meta.errors.noSuchChannel);
			}

			const canTransfer = await this.channelService.canTransferChannel(channel, me);
			if (!canTransfer) {
				throw new ApiError(meta.errors.accessDenied);
			}

			if (ps.userId === me.id) {
				throw new ApiError(meta.errors.cannotTransferToSelf);
			}

			const newOwner = await this.usersRepository.findOneBy({ id: ps.userId });
			if (newOwner == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			await this.channelService.transferOwnership(channel, ps.userId);

			return await this.channelEntityService.pack(channel.id, me);
		});
	}
}
