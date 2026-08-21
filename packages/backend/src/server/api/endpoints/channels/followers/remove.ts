/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { ChannelFollowingService } from '@/core/ChannelFollowingService.js';
import { ChannelService } from '@/core/ChannelService.js';
import { DI } from '@/di-symbols.js';
import type { ChannelsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['channels'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:channels',
	errors: {
		noSuchChannel: { message: 'No such channel.', code: 'NO_SUCH_CHANNEL', id: '0426c4c2-11e0-4c62-8004-97e5b42b9bee' },
		accessDenied: { message: 'You do not have permission to manage this channel.', code: 'ACCESS_DENIED', id: '450ed3ae-138c-4ab3-8538-92fb50c9dec7' },
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
		private channelService: ChannelService,
		private channelFollowingService: ChannelFollowingService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const channel = await this.channelsRepository.findOneBy({ id: ps.channelId });
			if (channel == null) throw new ApiError(meta.errors.noSuchChannel);
			if (!this.channelService.isChannelManager(channel, me)) throw new ApiError(meta.errors.accessDenied);
			if (this.channelService.isChannelManager(channel, { id: ps.userId })) throw new ApiError(meta.errors.accessDenied);
			await this.channelFollowingService.unfollow({ id: ps.userId }, channel);
		});
	}
}
