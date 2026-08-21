/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { ChannelFollowingService } from '@/core/ChannelFollowingService.js';
import { ChannelService } from '@/core/ChannelService.js';
import { RoleService } from '@/core/RoleService.js';
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
		noSuchChannel: { message: 'No such channel.', code: 'NO_SUCH_CHANNEL', id: '99490eaf-ef2c-4431-98db-7b632ec6002f' },
		accessDenied: { message: 'You do not have permission to manage this channel.', code: 'ACCESS_DENIED', id: 'f357e948-98bc-40c6-b25e-f76ebfdd75b5' },
		noSuchRequest: { message: 'No such channel follow request.', code: 'NO_SUCH_CHANNEL_FOLLOW_REQUEST', id: 'bcac94b8-f83b-48e5-84da-3281b94a10b0' },
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
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const channel = await this.channelsRepository.findOneBy({ id: ps.channelId });
			if (channel == null) throw new ApiError(meta.errors.noSuchChannel);
			const isModerator = await this.roleService.isModerator(me);
			if (!await this.channelService.canEditChannel(channel, me, isModerator)) throw new ApiError(meta.errors.accessDenied);
			if (!await this.channelFollowingService.approveRequest({ id: ps.userId }, channel)) throw new ApiError(meta.errors.noSuchRequest);
		});
	}
}
