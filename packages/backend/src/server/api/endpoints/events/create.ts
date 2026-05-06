/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { EventEntityService } from '@/core/entities/EventEntityService.js';
import { EventService } from '@/core/EventService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['events'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Event',
	},

	errors: {
		tooManyEvents: {
			message: 'You cannot create events any more today.',
			code: 'TOO_MANY_EVENTS',
			id: 'a3c7d6e1-8b2f-4d5e-9a1c-3f7e8b2d4a6c',
		},
		noSuchChannel: {
			message: 'No such channel.',
			code: 'NO_SUCH_CHANNEL',
			id: 'b4d8e2f3-9c1a-4e6d-8b3f-5a7c9d1e2f4b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		title: { type: 'string', minLength: 1, maxLength: 128 },
		startAt: { type: 'integer' },
		endAt: { type: 'integer', nullable: true },
		description: { type: 'string', nullable: true, maxLength: 2048 },
		url: { type: 'string', nullable: true, maxLength: 512 },
		tags: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 64 }, maxItems: 16, uniqueItems: true },
		channelId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['title', 'startAt'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private eventEntityService: EventEntityService,
		private eventService: EventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const event = await this.eventService.create({
					user: me,
					title: ps.title,
					startAt: new Date(ps.startAt),
					endAt: ps.endAt != null ? new Date(ps.endAt) : null,
					description: ps.description ?? null,
					url: ps.url ?? null,
					tags: ps.tags ?? [],
					channelId: ps.channelId ?? null,
				});
				return await this.eventEntityService.pack(event, me);
			} catch (e) {
				if (e instanceof EventService.TooManyEventsError) {
					throw new ApiError(meta.errors.tooManyEvents);
				}
				if (e instanceof EventService.NoSuchChannelError) {
					throw new ApiError(meta.errors.noSuchChannel);
				}
				throw e;
			}
		});
	}
}
