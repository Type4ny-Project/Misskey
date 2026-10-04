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
		noSuchChannel: { message: 'No such channel.', code: 'NO_SUCH_CHANNEL', id: 'f9bad040-6ccb-438d-a2a5-14aea3efc318' },
		accessDenied: { message: 'You do not have permission to manage this channel.', code: 'ACCESS_DENIED', id: '93f735ad-e05d-470d-8612-2aa23d2a4a45' },
		noSuchRequest: { message: 'No such channel follow request.', code: 'NO_SUCH_CHANNEL_FOLLOW_REQUEST', id: 'b06622f9-6a22-479e-914c-13b37d944eb2' },
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
			if (!await this.channelFollowingService.rejectRequest({ id: ps.userId }, channel)) throw new ApiError(meta.errors.noSuchRequest);
		});
	}
}
