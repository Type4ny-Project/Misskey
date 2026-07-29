/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsRoomError, CallsRoomService } from '@/core/calls/CallsRoomService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { callsApiError, callsErrors } from '../_shared.js';
export const meta = { tags: ['calls'], stability: 'experimental', requireCredential: true, prohibitMoved: true, kind: 'write:calls', errors: callsErrors } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' }, reconnectToken: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' }, connectionId: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' }, generation: { type: 'integer', minimum: 1 } }, required: ['roomId'] } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsRoomService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const reconnectFieldCount = [ps.reconnectToken, ps.connectionId, ps.generation].filter(value => value != null).length;
				if (reconnectFieldCount !== 0 && reconnectFieldCount !== 3) throw new CallsRoomError('invalid-state');
				await service.leave(me, ps.roomId, reconnectFieldCount === 3 ? { token: ps.reconnectToken!, connectionId: ps.connectionId!, generation: ps.generation! } : undefined);
			} catch (error) {
				callsApiError(error);
			}
		});
	}
}
