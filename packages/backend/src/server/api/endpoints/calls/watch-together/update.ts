/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsWatchTogetherService } from '@/core/calls/CallsWatchTogetherService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { callsApiError, callsErrors } from '../_shared.js';
import { watchTogetherSchema } from './_shared.js';

export const meta = {
	tags: ['calls'], stability: 'experimental', requireCredential: true, kind: 'write:calls',
	prohibitMoved: true, limit: { duration: 60000, max: 60 },
	errors: callsErrors, res: watchTogetherSchema,
} as const;
export const paramDef = {
	type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' },
																															expectedRevision: { type: 'integer', minimum: 0 },
																															videoId: { type: 'string', nullable: true, pattern: '^[A-Za-z0-9_-]{11}$' },
																															playing: { type: 'boolean' },
																															position: { type: 'number', minimum: 0 } },
	required: ['roomId', 'expectedRevision'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsWatchTogetherService) {
		super(meta, paramDef, async (ps, me) => {
			try { return await service.update(me, ps.roomId, ps); } catch (error) { callsApiError(error); }
		});
	}
}
