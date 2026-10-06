/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { AnnouncementsRepository, AnnouncementReactionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { QueryService } from '@/core/QueryService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:announcements',
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string', format: 'id', optional: false, nullable: false },
				createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
				reaction: { type: 'string', optional: false, nullable: false },
				user: { type: 'object', ref: 'UserLite', optional: false, nullable: false },
			},
		},
	},
	errors: {
		noSuchAnnouncement: {
			message: 'No such announcement.',
			code: 'NO_SUCH_ANNOUNCEMENT',
			id: '8b7fb619-a3cb-4cca-9b8e-68e0214ae375',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		announcementId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['announcementId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.announcementsRepository)
		private announcementsRepository: AnnouncementsRepository,

		@Inject(DI.announcementReactionsRepository)
		private announcementReactionsRepository: AnnouncementReactionsRepository,

		private queryService: QueryService,
		private userEntityService: UserEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const announcement = await this.announcementsRepository.findOneBy({ id: ps.announcementId });
			if (announcement == null) throw new ApiError(meta.errors.noSuchAnnouncement);

			const reactions = await this.queryService.makePaginationQuery(this.announcementReactionsRepository.createQueryBuilder('reaction'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.andWhere('reaction.announcementId = :announcementId', { announcementId: announcement.id })
				.innerJoinAndSelect('reaction.user', 'user')
				.limit(ps.limit)
				.getMany();

			const users = await this.userEntityService.packMany(reactions.map(reaction => reaction.user!), me, { schema: 'UserLite' });
			return reactions.map((reaction, index) => ({
				id: reaction.id,
				createdAt: this.idService.parse(reaction.id).date.toISOString(),
				reaction: reaction.reaction,
				user: users[index],
			}));
		});
	}
}
