/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsMediaCredentialService } from '@/core/calls/CallsMediaCredentialService.js';
import { CallsMediaService } from '@/core/calls/CallsMediaService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { callsApplicationId, callsMediaApiError, callsMediaErrors } from '../_media-shared.js';
export const meta = { tags: ['calls'], stability: 'experimental', requireCredential: true, prohibitMoved: true, kind: 'write:calls', limit: { duration: 60 * 1000, max: 10 }, errors: callsMediaErrors, res: { type: 'object', optional: false, nullable: false, properties: { mediaCredential: { type: 'string', optional: false, nullable: false }, credentialExpiresAt: { type: 'string', format: 'date-time', optional: false, nullable: false } } } } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' }, participantId: { type: 'string', format: 'misskey:id' }, connectionId: { type: 'string', minLength: 8, maxLength: 128 }, generation: { type: 'integer', minimum: 1 }, mediaCredential: { type: 'string', minLength: 32, maxLength: 4096 } }, required: ['roomId', 'participantId', 'connectionId', 'generation', 'mediaCredential'] } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(credentials: CallsMediaCredentialService, media: CallsMediaService) {
		super(meta, paramDef, async (ps, me, token) => {
			try {
				const applicationId = callsApplicationId(token, me);
				const claims = credentials.verify(ps.mediaCredential, { ...ps, userId: me.id, applicationId });
				await media.reconcile(me, ps.roomId);
				const issued = credentials.issue({ userId: me.id, applicationId, roomId: ps.roomId, participantId: ps.participantId, connectionId: ps.connectionId, generation: ps.generation, canPublish: claims.canPublish });
				return { mediaCredential: issued.credential, credentialExpiresAt: issued.expiresAt };
			} catch (error) { callsMediaApiError(error); }
		});
	}
}
