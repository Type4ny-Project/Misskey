/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsRoomService } from '@/core/calls/CallsRoomService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { callsApiError, callsErrors } from '../_shared.js';
export const meta = { tags: ['calls'], stability: 'experimental', requireCredential: true, prohibitMoved: true, kind: 'write:calls', errors: callsErrors } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' }, participantId: { type: 'string', format: 'misskey:id' }, mediaSource: { type: 'string', enum: ['camera', 'screen'] }, expectedRevision: { type: 'integer', minimum: 0 } }, required: ['roomId', 'participantId', 'mediaSource', 'expectedRevision'] } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsRoomService) { super(meta, paramDef, async (ps, me) => { try { await service.stopParticipantVideo(me, ps.roomId, ps.participantId, ps.mediaSource, ps.expectedRevision); } catch (error) { callsApiError(error); } }); }
}
