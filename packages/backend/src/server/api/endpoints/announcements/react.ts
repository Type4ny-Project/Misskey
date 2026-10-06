/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { EntityNotFoundError } from 'typeorm';
import { AnnouncementService } from '@/core/AnnouncementService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['meta'],
	requireCredential: true,
	kind: 'write:reactions',
	prohibitMoved: true,
	limit: { duration: 1000 * 60, max: 60 },
	res: { type: 'object', optional: false, nullable: false, ref: 'Announcement' },
	errors: {
		noSuchAnnouncement: {
			message: 'No such announcement.',
			code: 'NO_SUCH_ANNOUNCEMENT',
			id: 'bf20203c-70fc-4793-aba5-73acfbee7055',
		},
		reactionsDisabled: {
			message: 'Reactions are disabled for this announcement.',
			code: 'REACTIONS_DISABLED',
			id: '5edec300-834a-4b06-9dfc-6505af527e78',
		},
		invalidReaction: {
			message: 'This emoji cannot be used as a reaction.',
			code: 'INVALID_REACTION',
			id: '75b25e24-caa7-474f-a2c3-4d813453649e',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		announcementId: { type: 'string', format: 'misskey:id' },
		reaction: { type: 'string', nullable: true, minLength: 1, maxLength: 128 },
	},
	required: ['announcementId', 'reaction'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private announcementService: AnnouncementService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.announcementService.react(me, ps.announcementId, ps.reaction);
			} catch (err) {
				if (err instanceof EntityNotFoundError) throw new ApiError(meta.errors.noSuchAnnouncement);
				if (err instanceof IdentifiableError) {
					if (err.id === 'REACTIONS_DISABLED') throw new ApiError(meta.errors.reactionsDisabled);
					if (err.id === 'INVALID_REACTION') throw new ApiError(meta.errors.invalidReaction);
				}
				throw err;
			}
		});
	}
}
