/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import type { EventsRepository } from '@/models/_.js';
import { EventEntityService } from '@/core/entities/EventEntityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['events'],

	requireCredential: false,

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
		includeChannelEvents: { type: 'boolean', default: false },
		channelId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.eventsRepository)
		private eventsRepository: EventsRepository,

		private queryService: QueryService,
		private eventEntityService: EventEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.queryService.makePaginationQuery(this.eventsRepository.createQueryBuilder('event'), ps.sinceId, ps.untilId)
				.andWhere('event.status = :status', { status: 'approved' });

			// Include any event whose time range overlaps the requested window.
			// This keeps long-running or month-spanning events visible in calendar views.
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

			if (ps.channelId != null) {
				query.andWhere('event.channelId = :channelId', { channelId: ps.channelId });
			} else if (ps.includeChannelEvents !== true) {
				query.andWhere('event.channelId IS NULL');
			}

			const events = await query
				.orderBy('event.startAt', 'ASC')
				.limit(ps.limit)
				.getMany();

			return await this.eventEntityService.packMany(events, me);
		});
	}
}
