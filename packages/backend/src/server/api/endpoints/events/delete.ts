/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
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
			id: 'a1b3c5d7-e9f2-4a6b-8c1d-3e5f7a9b2c4d',
		},
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'b2c4d6e8-f1a3-5b7c-9d2e-4f6a8b1c3d5e',
		},
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
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				await this.eventService.delete(me, ps.eventId);
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
