/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { EventEntityService } from '@/core/entities/EventEntityService.js';
import { QueryService } from '@/core/QueryService.js';
import { DI } from '@/di-symbols.js';
import type { ChannelFavoritesRepository, ChannelFollowingsRepository, EventsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['events', 'account'],

	requireCredential: true,

	kind: 'read:account',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Event',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.eventsRepository)
		private eventsRepository: EventsRepository,

		@Inject(DI.channelFollowingsRepository)
		private channelFollowingsRepository: ChannelFollowingsRepository,

		@Inject(DI.channelFavoritesRepository)
		private channelFavoritesRepository: ChannelFavoritesRepository,

		private queryService: QueryService,
		private eventEntityService: EventEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const [followings, favorites] = await Promise.all([
				this.channelFollowingsRepository.find({
					select: ['followeeId'],
					where: { followerId: me.id },
				}),
				this.channelFavoritesRepository.find({
					select: ['channelId'],
					where: { userId: me.id },
				}),
			]);

			const channelIds = [...new Set([
				...followings.map(following => following.followeeId),
				...favorites.map(favorite => favorite.channelId),
			])];

			const query = this.queryService.makePaginationQuery(
				this.eventsRepository.createQueryBuilder('event'),
				ps.sinceId,
				ps.untilId,
			)
				.andWhere('event.status = :status', { status: 'approved' });

			if (ps.sinceDate != null && ps.untilDate != null) {
				query.andWhere('(event.startAt <= :untilDate AND COALESCE(event.endAt, event.startAt) >= :sinceDate)', {
					sinceDate: new Date(ps.sinceDate),
					untilDate: new Date(ps.untilDate),
				});
			} else if (ps.sinceDate != null) {
				query.andWhere('COALESCE(event.endAt, event.startAt) >= :sinceDate', {
					sinceDate: new Date(ps.sinceDate),
				});
			} else if (ps.untilDate != null) {
				query.andWhere('event.startAt <= :untilDate', {
					untilDate: new Date(ps.untilDate),
				});
			}

			query.andWhere(new Brackets(qb => {
				qb.where('event.channelId IS NULL');

				if (channelIds.length > 0) {
					qb.orWhere('event.channelId IN (:...channelIds)', { channelIds });
				}
			}));

			const events = await query
				.orderBy('event.startAt', 'ASC')
				.limit(ps.limit)
				.getMany();

			return await this.eventEntityService.packMany(events, me);
		});
	}
}
