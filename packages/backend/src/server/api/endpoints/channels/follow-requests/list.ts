/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { ChannelService } from '@/core/ChannelService.js';
import { IdService } from '@/core/IdService.js';
import { QueryService } from '@/core/QueryService.js';
import { RoleService } from '@/core/RoleService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';
import type { ChannelFollowRequestsRepository, ChannelsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['channels', 'account'],
	requireCredential: true,
	kind: 'read:channels',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string', format: 'id', optional: false, nullable: false },
				createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
				user: { type: 'object', ref: 'UserLite', optional: false, nullable: false },
			},
		},
	},

	errors: {
		noSuchChannel: {
			message: 'No such channel.',
			code: 'NO_SUCH_CHANNEL',
			id: '448f1a4e-9cd0-4d6b-a9b8-302c486ad552',
		},
		accessDenied: {
			message: 'You do not have permission to manage this channel.',
			code: 'ACCESS_DENIED',
			id: '34fc619d-9f19-4e52-8a29-04642575f7cf',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		channelId: { type: 'string', format: 'misskey:id' },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: ['channelId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,
		@Inject(DI.channelFollowRequestsRepository)
		private channelFollowRequestsRepository: ChannelFollowRequestsRepository,
		private channelService: ChannelService,
		private roleService: RoleService,
		private queryService: QueryService,
		private userEntityService: UserEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const channel = await this.channelsRepository.findOneBy({ id: ps.channelId });
			if (channel == null) throw new ApiError(meta.errors.noSuchChannel);

			const isModerator = await this.roleService.isModerator(me);
			if (!await this.channelService.canEditChannel(channel, me, isModerator)) {
				throw new ApiError(meta.errors.accessDenied);
			}

			const query = this.queryService.makePaginationQuery(
				this.channelFollowRequestsRepository.createQueryBuilder('request'),
				ps.sinceId,
				ps.untilId,
			).andWhere('request.channelId = :channelId', { channelId: channel.id });
			const requests = await query.limit(ps.limit).getMany();
			const users = await this.userEntityService.packMany(requests.map(request => request.followerId), me);
			const usersById = new Map(users.map(user => [user.id, user]));

			return requests.map(request => ({
				id: request.id,
				createdAt: this.idService.parse(request.id).date.toISOString(),
				user: usersById.get(request.followerId)!,
			}));
		});
	}
}
