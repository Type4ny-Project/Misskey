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
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['events'],

	requireCredential: true,

	kind: 'read:account',

	errors: {
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'fe8d7103-0ea8-4ec3-814d-f8b401dc69e6',
		},
	},

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
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const isModerator = await this.roleService.isModerator(me);
			if (!isModerator) {
				throw new ApiError(meta.errors.accessDenied);
			}

			const query = this.queryService.makePaginationQuery(this.eventsRepository.createQueryBuilder('event'), ps.sinceId, ps.untilId)
				.andWhere('event.status = :status', { status: 'pending' });

			const events = await query
				.orderBy('event.createdAt', 'ASC')
				.limit(ps.limit)
				.getMany();

			return await this.eventEntityService.packMany(events, me);
		});
	}
}
