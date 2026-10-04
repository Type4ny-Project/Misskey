/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsRoomError, CallsRoomService } from '@/core/calls/CallsRoomService.js';
import { CallsEntityService } from '@/core/entities/CallsEntityService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { callsApiError, callsErrors } from '../_shared.js';
export const meta = { tags: ['calls'], stability: 'experimental', requireCredential: true, prohibitMoved: true, kind: 'write:calls', errors: callsErrors, res: { type: 'object', optional: false, nullable: false, ref: 'CallsRoom' } } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' }, expectedRevision: { type: 'integer', minimum: 0 }, connectionId: { type: 'string', minLength: 8, maxLength: 128 }, generation: { type: 'integer', minimum: 1 } }, required: ['roomId', 'expectedRevision'] } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsRoomService, entity: CallsEntityService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				if ((ps.connectionId != null) !== (ps.generation != null)) throw new CallsRoomError('invalid-state');
				return entity.packRoom(await service.end(me, ps.roomId, ps.expectedRevision, ps.connectionId != null ? { connectionId: ps.connectionId, generation: ps.generation! } : undefined));
			} catch (error) { callsApiError(error); }
		});
	}
}
