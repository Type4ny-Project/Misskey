/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsMediaService } from '@/core/calls/CallsMediaService.js';
import { CallsMediaCredentialService } from '@/core/calls/CallsMediaCredentialService.js';
import { CallsOperationGuardService } from '@/core/calls/CallsOperationGuardService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { callsApplicationId, callsMediaApiError, callsMediaErrors, executeCallsMediaOperation, operationIdParam, sessionDescriptionParam } from '../_media-shared.js';
export const meta = { tags: ['calls'], stability: 'experimental', requireCredential: true, prohibitMoved: true, kind: 'write:calls', limit: { key: 'calls-media', duration: 60 * 1000, max: 120 }, errors: callsMediaErrors, res: { type: 'object', optional: false, nullable: false, properties: {
	participantId: { type: 'string', format: 'id', optional: false, nullable: false }, generation: { type: 'integer', optional: false, nullable: false },
	sessionDescription: { ...sessionDescriptionParam, optional: false, nullable: true },
	mediaCredential: { type: 'string', optional: false, nullable: false }, credentialExpiresAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
} } } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' }, connectionId: { type: 'string', minLength: 8, maxLength: 128 }, operationId: operationIdParam, sessionDescription: sessionDescriptionParam }, required: ['roomId', 'connectionId', 'operationId'] } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsMediaService, credentials: CallsMediaCredentialService, guard: CallsOperationGuardService) {
		super(meta, paramDef, async (ps, me, token) => {
			try {
				return executeCallsMediaOperation(guard, me, token, ps, 'session-create', async () => {
					const result = await service.createSession(me, { ...ps, applicationId: callsApplicationId(token, me) });
					const issued = credentials.issue({ userId: me.id, applicationId: callsApplicationId(token, me), roomId: ps.roomId, participantId: result.participantId, connectionId: ps.connectionId, generation: result.generation, canPublish: result.canPublish });
					return { participantId: result.participantId, generation: result.generation, sessionDescription: result.sessionDescription ?? null, mediaCredential: issued.credential, credentialExpiresAt: issued.expiresAt };
				});
			} catch (error) { callsMediaApiError(error); }
		});
	}
}
