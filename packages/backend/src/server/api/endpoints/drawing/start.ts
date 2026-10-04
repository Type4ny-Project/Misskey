/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { DrawingService } from '@/core/drawing/DrawingService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { drawingApiError, drawingErrors } from './_shared.js';

export const meta = {
	tags: ['calls'], requireCredential: true, prohibitMoved: true, kind: 'write:calls',
	limit: { duration: 1000 * 60, max: 60 }, errors: drawingErrors,
} as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' }, scope: { type: 'string', enum: ['public', 'chatRoom', 'calls'] } }, required: ['roomId', 'scope'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(drawingService: DrawingService) {
		super(meta, paramDef, async (ps, me) => {
			try { await drawingService.update(me, ps.roomId, 'start', { scope: ps.scope }); } catch (error) { drawingApiError(error); }
		});
	}
}
