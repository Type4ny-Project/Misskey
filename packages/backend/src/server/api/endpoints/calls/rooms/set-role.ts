/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsRoomService } from '@/core/calls/CallsRoomService.js';
import { CallsEntityService } from '@/core/entities/CallsEntityService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { callsApiError, callsErrors } from '../_shared.js';
export const meta = { tags: ['calls'], stability: 'experimental', requireCredential: true, prohibitMoved: true, kind: 'write:calls', errors: callsErrors, res: { type: 'object', optional: false, nullable: false, ref: 'CallsParticipant' } } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' }, participantId: { type: 'string', format: 'misskey:id' }, role: { type: 'string', enum: ['speaker', 'listener'] }, expectedRevision: { type: 'integer', minimum: 0 } }, required: ['roomId', 'participantId', 'role', 'expectedRevision'] } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsRoomService, entity: CallsEntityService) { super(meta, paramDef, async (ps, me) => { try { return entity.packParticipant(await service.setRole(me, ps.roomId, ps.participantId, ps.role, ps.expectedRevision)); } catch (error) { callsApiError(error); } }); }
}
