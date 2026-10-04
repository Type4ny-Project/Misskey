/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { DrawingService, DrawingError } from '@/core/drawing/DrawingService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { drawingApiError, drawingErrors, strokeSchema } from './_shared.js';

export const meta = {
	tags: ['calls'], requireCredential: true, prohibitMoved: true, kind: 'write:calls',
	limit: { duration: 1000 * 60, max: 300 }, errors: drawingErrors,
} as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' }, canvasId: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' }, stroke: strokeSchema }, required: ['roomId', 'canvasId', 'stroke'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(drawingService: DrawingService) {
		super(meta, paramDef, async (ps, me) => {
			try { if (ps.stroke.points.some(point => point[1] > 720)) throw new DrawingError('invalidState'); await drawingService.update(me, ps.roomId, 'stroke', { canvasId: ps.canvasId, stroke: ps.stroke }); } catch (error) { drawingApiError(error); }
		});
	}
}
