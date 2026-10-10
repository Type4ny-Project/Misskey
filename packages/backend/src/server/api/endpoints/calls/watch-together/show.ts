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
	tags: ['calls'], stability: 'experimental', requireCredential: true, kind: 'read:calls',

	errors: callsErrors, res: watchTogetherSchema,
} as const;
export const paramDef = {
	type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' } },
	required: ['roomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsWatchTogetherService) {
		super(meta, paramDef, async (ps, me) => {
			try { return await service.show(me, ps.roomId); } catch (error) { callsApiError(error); }
		});
	}
}
