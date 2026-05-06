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

	kind: 'write:account',

	errors: {
		noSuchEvent: {
			message: 'No such event.',
			code: 'NO_SUCH_EVENT',
			id: 'e5f7a9b1-c2d3-6e8f-1a4b-7c9d2e4f6a8b',
		},
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'f6a8b1c2-d3e4-7f9a-2b5c-8d1e3f5a7b9c',
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
				const event = await this.eventService.reject(me, ps.eventId);
				return await this.eventEntityService.pack(event, me);
			} catch (e) {
				if (e instanceof EventService.NoSuchEventError) {
					throw new ApiError(meta.errors.noSuchEvent);
				}
				if (e instanceof EventService.AccessDeniedError) {
					throw new ApiError(meta.errors.accessDenied);
				}
				throw e;
			}
		});
	}
}
