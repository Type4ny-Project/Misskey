/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsTurnNotConfiguredError, CallsTurnProviderError, CallsTurnService } from '@/core/calls/CallsTurnService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { callsApiError, callsErrors } from '../_shared.js';
const errors = { ...callsErrors, turnUnavailable: { message: 'TURN is unavailable.', code: 'CALLS_TURN_UNAVAILABLE', id: '23c66189-018d-42a9-aa2b-6e20f299527e' } } as const;
export const meta = { tags: ['calls'], stability: 'experimental', requireCredential: true, prohibitMoved: true, kind: 'write:calls', limit: { duration: 60 * 1000, max: 10 }, errors, res: { type: 'object', optional: false, nullable: false, properties: {
	iceServers: { type: 'array', optional: false, nullable: false, items: { type: 'object', properties: { urls: { type: 'array', optional: false, nullable: false, items: { type: 'string' } }, username: { type: 'string', optional: true, nullable: false }, credential: { type: 'string', optional: true, nullable: false } } } },
	expiresAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
} } } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' } }, required: ['roomId'] } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsTurnService) { super(meta, paramDef, async (ps, me) => { try { return await service.issue(me, ps.roomId); } catch (error) { if (error instanceof CallsTurnNotConfiguredError || error instanceof CallsTurnProviderError) throw new ApiError(errors.turnUnavailable); callsApiError(error); } }); }
}
