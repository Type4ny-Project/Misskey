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
		status: { type: 'string', enum: ['pending', 'approved', 'rejected'], nullable: true },
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
			const query = this.queryService.makePaginationQuery(this.eventsRepository.createQueryBuilder('event'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.andWhere('event.createdById = :userId', { userId: me.id });

			if (ps.status != null) {
				query.andWhere('event.status = :status', { status: ps.status });
			}

			const events = await query.limit(ps.limit).getMany();

			return await this.eventEntityService.packMany(events, me);
		});
	}
}
