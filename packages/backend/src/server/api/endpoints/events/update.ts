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

	errors: {
		noSuchEvent: {
			message: 'No such event.',
			code: 'NO_SUCH_EVENT',
			id: 'd6e9f2a3-4b1c-8e5d-7f3a-9c2b1d4e6f8a',
		},
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'e7f1a3b4-5c2d-9e6f-8a4b-1d3c5e7f9a2b',
		},
		noSuchChannel: {
			message: 'No such channel.',
			code: 'NO_SUCH_CHANNEL',
			id: 'f8a2b4c5-6d3e-1f7a-9b5c-2e4d6f8a1b3c',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Event',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		eventId: { type: 'string', format: 'misskey:id' },
		title: { type: 'string', minLength: 1, maxLength: 128 },
		startAt: { type: 'integer' },
		endAt: { type: 'integer', nullable: true },
		description: { type: 'string', nullable: true, maxLength: 2048 },
		url: { type: 'string', nullable: true, maxLength: 512 },
		tags: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 64 }, maxItems: 16, uniqueItems: true },
		channelId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['eventId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private eventService: EventService,
		private eventEntityService: EventEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				await this.eventService.update(me, ps.eventId, {
					title: ps.title,
					startAt: ps.startAt != null ? new Date(ps.startAt) : undefined,
					endAt: ps.endAt !== undefined ? (ps.endAt != null ? new Date(ps.endAt) : null) : undefined,
					description: ps.description,
					url: ps.url,
					tags: ps.tags,
					channelId: ps.channelId,
				});
			} catch (e) {
				if (e instanceof EventService.NoSuchEventError) {
					throw new ApiError(meta.errors.noSuchEvent);
				}
				if (e instanceof EventService.AccessDeniedError) {
					throw new ApiError(meta.errors.accessDenied);
				}
				if (e instanceof EventService.NoSuchChannelError) {
					throw new ApiError(meta.errors.noSuchChannel);
				}
				throw e;
			}

			return await this.eventEntityService.pack(ps.eventId, me);
		});
	}
}
