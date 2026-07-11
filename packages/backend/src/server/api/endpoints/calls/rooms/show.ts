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
	tags: ['calls'], stability: 'experimental', requireCredential: true, kind: 'read:calls', errors: callsErrors,
	res: { type: 'object', optional: false, nullable: false, properties: {
		room: { type: 'object', optional: false, nullable: false, ref: 'CallsRoom' },
		participants: { type: 'array', optional: false, nullable: false, items: { type: 'object', optional: false, nullable: false, ref: 'CallsParticipant' } },
	} },
} as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' } }, required: ['roomId'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(callsRoomService: CallsRoomService, callsEntityService: CallsEntityService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const snapshot = await callsRoomService.snapshot(me, ps.roomId);
				return { room: callsEntityService.packRoom(snapshot.room), participants: snapshot.participants.map(callsEntityService.packParticipant) };
			} catch (error) { callsApiError(error); }
		});
	}
}
