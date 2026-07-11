/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsMediaService } from '@/core/calls/CallsMediaService.js';
import { CallsMediaCredentialService } from '@/core/calls/CallsMediaCredentialService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { callsMediaApiError, callsMediaErrors, negotiationResponseSchema, sanitizeNegotiation, verifyCallsMediaCredential } from '../_media-shared.js';
export const meta = { tags: ['calls'], stability: 'experimental', requireCredential: true, prohibitMoved: true, kind: 'write:calls', limit: { key: 'calls-media', duration: 60 * 1000, max: 120 }, errors: callsMediaErrors, res: negotiationResponseSchema } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' }, participantId: { type: 'string', format: 'misskey:id' }, connectionId: { type: 'string', minLength: 8, maxLength: 128 }, generation: { type: 'integer', minimum: 1 }, mediaCredential: { type: 'string', minLength: 32, maxLength: 4096 }, publicationIds: { type: 'array', minItems: 1, maxItems: 64, uniqueItems: true, items: { type: 'string', format: 'misskey:id' } } }, required: ['roomId', 'participantId', 'connectionId', 'generation', 'mediaCredential', 'publicationIds'] } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsMediaService, credentials: CallsMediaCredentialService) { super(meta, paramDef, async (ps, me, token) => { try { verifyCallsMediaCredential(credentials, ps.mediaCredential, me, token, ps); return sanitizeNegotiation(await service.subscribe(me, ps)); } catch (error) { callsMediaApiError(error); } }); }
}
