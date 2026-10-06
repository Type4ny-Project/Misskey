/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { DrawingError } from '@/core/drawing/DrawingService.js';
import { ApiError } from '@/server/api/error.js';
import { callsApiError, callsErrors } from '../calls/_shared.js';

export const drawingErrors = {
	...callsErrors,
	drawingAccessDenied: { message: 'You cannot access this canvas.', code: 'DRAWING_ACCESS_DENIED', id: '3e6830dc-0b80-41fe-84d3-dc7d4fe0d725' },
	drawingInvalidState: { message: 'The canvas is not in the required state.', code: 'DRAWING_INVALID_STATE', id: '175cdb1a-5156-472b-8387-a94f64e2cc12' },
	drawingRoomFull: { message: 'The canvas has reached its participant limit.', code: 'DRAWING_ROOM_FULL', id: '5489fcf0-205d-4800-b460-4bba2929da29' },
	drawingCanvasFull: { message: 'Export or clear the canvas before continuing.', code: 'DRAWING_CANVAS_FULL', id: 'f47a90a1-766c-4c4c-a7c3-78ace3ca86ed' },
} as const;

export function drawingApiError(error: unknown): never {
	if (error instanceof DrawingError) {
		const definition = {
			accessDenied: drawingErrors.drawingAccessDenied,
			invalidState: drawingErrors.drawingInvalidState,
			roomFull: drawingErrors.drawingRoomFull,
			canvasFull: drawingErrors.drawingCanvasFull,
		}[error.code];
		throw new ApiError(definition);
	}
	return callsApiError(error);
}

export const strokeSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		color: { type: 'string', optional: false, nullable: false, pattern: '^#[0-9a-fA-F]{6}$' },
		width: { type: 'number', optional: false, nullable: false, minimum: 1, maximum: 64 },
		eraser: { type: 'boolean', optional: false, nullable: false },
		points: { type: 'array', optional: false, nullable: false, minItems: 1, maxItems: 64, items: {
			type: 'array', optional: false, nullable: false, minItems: 2, maxItems: 2,
			items: { type: 'number', optional: false, nullable: false, minimum: 0, maximum: 1280 },
		} },
	}, required: ['color', 'width', 'eraser', 'points'], additionalProperties: false,
} as const;

export const messageSchema = { type: 'object', optional: false, nullable: false, properties: {
	id: { type: 'string', optional: false, nullable: false },
	userId: { type: 'string', optional: false, nullable: false },
	text: { type: 'string', optional: false, nullable: false },
} } as const;

export const snapshotSchema = {
	type: 'object', optional: false, nullable: true,
	properties: {
		canvasId: { type: 'string', optional: false, nullable: false },
		version: { type: 'number', optional: false, nullable: false },
		scope: { type: 'string', optional: false, nullable: false, enum: ['public', 'chatRoom', 'calls'] },
		ended: { type: 'boolean', optional: false, nullable: false },
		participantIds: { type: 'array', optional: false, nullable: false, items: { type: 'string', optional: false, nullable: false } },
		strokes: { type: 'array', optional: false, nullable: false, items: strokeSchema },
		messages: { type: 'array', optional: false, nullable: false, items: messageSchema },
	},
} as const;
