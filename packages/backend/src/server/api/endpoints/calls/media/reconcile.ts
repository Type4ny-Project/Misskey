/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsMediaService } from '@/core/calls/CallsMediaService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { callsMediaApiError, callsMediaErrors } from '../_media-shared.js';
export const meta = { tags: ['calls'], stability: 'experimental', requireCredential: true, kind: 'read:calls', errors: callsMediaErrors, res: { type: 'object', optional: false, nullable: false, properties: {
	roomRevision: { type: 'integer', optional: false, nullable: false },
	publications: { type: 'array', optional: false, nullable: false, items: { type: 'object', properties: { id: { type: 'string', format: 'id', optional: false, nullable: false }, participantId: { type: 'string', format: 'id', optional: false, nullable: false }, mediaKind: { type: 'string', enum: ['audio'], optional: false, nullable: false } } } },
} } } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' } }, required: ['roomId'] } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsMediaService) { super(meta, paramDef, async (ps, me) => { try { return await service.reconcile(me, ps.roomId); } catch (error) { callsMediaApiError(error); } }); }
}
