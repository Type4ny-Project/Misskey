/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsRoomService } from '@/core/calls/CallsRoomService.js';
import { CallsEntityService } from '@/core/entities/CallsEntityService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { callsApiError, callsErrors } from '../_shared.js';

export const meta = {
	tags: ['calls'], stability: 'experimental', requireCredential: true, prohibitMoved: true, kind: 'write:calls',
	limit: { duration: 60 * 60 * 1000, max: 20 },
	errors: callsErrors,
	res: { type: 'object', optional: false, nullable: false, ref: 'CallsRoom' },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		attachmentType: { type: 'string', enum: ['personal', 'chatRoom'] },
		chatRoomId: { type: 'string', format: 'misskey:id' },
		title: { type: 'string', minLength: 1, maxLength: 256 },
		description: { type: 'string', maxLength: 2048, default: '' },
		visibility: { type: 'string', enum: ['public', 'followers', 'specified'], default: 'specified' },
		visibleUserIds: { type: 'array', maxItems: 100, uniqueItems: true, items: { type: 'string', format: 'misskey:id' } },
		scheduledAt: { type: 'integer', minimum: -8_640_000_000_000_000, maximum: 8_640_000_000_000_000, nullable: true },
	},
	required: ['attachmentType', 'title'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(callsRoomService: CallsRoomService, callsEntityService: CallsEntityService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const room = await callsRoomService.create(me, {
					attachmentType: ps.attachmentType, chatRoomId: ps.chatRoomId, title: ps.title,
					description: ps.description, visibility: ps.visibility, visibleUserIds: ps.visibleUserIds,
					scheduledAt: ps.scheduledAt == null ? null : new Date(ps.scheduledAt),
				});
				return callsEntityService.packRoom(room);
			} catch (error) { callsApiError(error); }
		});
	}
}
