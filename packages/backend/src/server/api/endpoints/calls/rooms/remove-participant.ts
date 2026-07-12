/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsRoomService } from '@/core/calls/CallsRoomService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { callsApiError, callsErrors } from '../_shared.js';
export const meta = { tags: ['calls'], stability: 'experimental', requireCredential: true, prohibitMoved: true, kind: 'write:calls', errors: callsErrors } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' }, participantId: { type: 'string', format: 'misskey:id' }, expectedRevision: { type: 'integer', minimum: 0 }, reason: { type: 'string', maxLength: 512 } }, required: ['roomId', 'participantId', 'expectedRevision'] } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsRoomService) { super(meta, paramDef, async (ps, me) => { try { await service.removeParticipant(me, ps.roomId, ps.participantId, ps.expectedRevision, ps.reason); } catch (error) { callsApiError(error); } }); }
}
