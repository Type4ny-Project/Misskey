/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { EventsRepository } from '@/models/_.js';
import { EventEntityService } from '@/core/entities/EventEntityService.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['events'],

	requireCredential: false,

	kind: 'read:account',

	errors: {
		noSuchEvent: {
			message: 'No such event.',
			code: 'NO_SUCH_EVENT',
			id: 'c5e8f3a1-2d4b-6e9f-8a1c-3b5d7f9e1a2c',
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
		@Inject(DI.eventsRepository)
		private eventsRepository: EventsRepository,

		private eventEntityService: EventEntityService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const event = await this.eventsRepository.findOneBy({
				id: ps.eventId,
			});

			if (event == null) {
				throw new ApiError(meta.errors.noSuchEvent);
			}

			// Non-approved events are only visible to the creator or moderators
			if (event.status !== 'approved' && (me == null || (event.createdById !== me.id && !(await this.roleService.isModerator(me))))) {
				throw new ApiError(meta.errors.noSuchEvent);
			}

			return await this.eventEntityService.pack(event, me);
		});
	}
}
