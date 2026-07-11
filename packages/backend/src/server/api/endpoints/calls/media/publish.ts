/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsMediaService } from '@/core/calls/CallsMediaService.js';
import { CallsMediaCredentialService } from '@/core/calls/CallsMediaCredentialService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { callsMediaApiError, callsMediaErrors, negotiationResponseSchema, sanitizeNegotiation, sessionDescriptionParam, verifyCallsMediaCredential } from '../_media-shared.js';
export const meta = { tags: ['calls'], stability: 'experimental', requireCredential: true, prohibitMoved: true, kind: 'write:calls', limit: { key: 'calls-media', duration: 60 * 1000, max: 120 }, errors: callsMediaErrors, res: { type: 'object', optional: false, nullable: false, properties: { publicationId: { type: 'string', format: 'id', optional: false, nullable: false }, negotiation: negotiationResponseSchema } } } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' }, participantId: { type: 'string', format: 'misskey:id' }, connectionId: { type: 'string', minLength: 8, maxLength: 128 }, generation: { type: 'integer', minimum: 1 }, mediaCredential: { type: 'string', minLength: 32, maxLength: 4096 }, mid: { type: 'string', minLength: 1, maxLength: 64 }, sessionDescription: sessionDescriptionParam }, required: ['roomId', 'participantId', 'connectionId', 'generation', 'mediaCredential', 'mid', 'sessionDescription'] } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsMediaService, credentials: CallsMediaCredentialService) { super(meta, paramDef, async (ps, me, token) => { try { verifyCallsMediaCredential(credentials, ps.mediaCredential, me, token, ps, true); const result = await service.publish(me, ps); return { publicationId: result.publicationId, negotiation: sanitizeNegotiation(result.negotiation) }; } catch (error) { callsMediaApiError(error); } }); }
}
