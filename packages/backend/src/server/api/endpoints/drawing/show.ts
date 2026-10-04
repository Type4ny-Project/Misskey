/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { DrawingService } from '@/core/drawing/DrawingService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { drawingApiError, drawingErrors, snapshotSchema } from './_shared.js';

export const meta = {
	tags: ['calls'], requireCredential: true, kind: 'read:calls',
	limit: { duration: 1000 * 60, max: 60 }, errors: drawingErrors,
	res: { type: 'object', optional: false, nullable: false, properties: { canvas: snapshotSchema } },
} as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' } }, required: ['roomId'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(drawingService: DrawingService) {
		super(meta, paramDef, async (ps, me) => {
			try { return { canvas: await drawingService.snapshot(me, ps.roomId) }; } catch (error) { drawingApiError(error); }
		});
	}
}
