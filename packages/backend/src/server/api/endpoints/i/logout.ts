/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsMediaRevocationService } from '@/core/calls/CallsMediaRevocationService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	requireCredential: true,
	secure: true,
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(callsMediaRevocationService: CallsMediaRevocationService) {
		super(meta, paramDef, async (_ps, me) => {
			await callsMediaRevocationService.revokeUser(me.id, 'logout');
		});
	}
}
