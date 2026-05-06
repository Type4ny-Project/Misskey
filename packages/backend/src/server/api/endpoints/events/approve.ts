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
			id: 'c3d5e7f9-a1b2-4c6d-8e3f-5a7b9c1d2e4f',
		},
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'd4e6f8a1-b2c3-5d7e-9f4a-6b8c1d3e5f7a',
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
				const event = await this.eventService.approve(me, ps.eventId);
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
