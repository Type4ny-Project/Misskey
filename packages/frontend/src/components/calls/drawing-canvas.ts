/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { entities } from 'misskey-js';
export type DrawingSnapshot = NonNullable<entities.DrawingShowResponse['canvas']>;
export type DrawingStroke = DrawingSnapshot['strokes'][number];

export const DRAWING_PAPER_COLOR = '#ffffff';

export function paintStroke(context: CanvasRenderingContext2D, stroke: DrawingStroke) {
	context.save();
	context.globalCompositeOperation = stroke.eraser ? 'destination-out' : 'source-over';
	context.strokeStyle = stroke.color;
	context.fillStyle = stroke.color;
	context.lineWidth = stroke.width;
	context.lineCap = 'round';
	context.lineJoin = 'round';
	context.beginPath();
	context.moveTo(stroke.points[0][0], stroke.points[0][1]);
	for (const point of stroke.points.slice(1)) context.lineTo(point[0], point[1]);
	if (stroke.points.length === 1) {
		context.arc(stroke.points[0][0], stroke.points[0][1], stroke.width / 2, 0, Math.PI * 2);
		context.fill();
	} else {
		context.stroke();
	}
	context.restore();
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	// The paper remains white in exported images regardless of the current UI theme.
	const image = window.document.createElement('canvas');
	image.width = canvas.width;
	image.height = canvas.height;
	const context = image.getContext('2d')!;
	context.fillStyle = DRAWING_PAPER_COLOR;
	context.fillRect(0, 0, image.width, image.height);
	context.drawImage(canvas, 0, 0);
	return new Promise((resolve, reject) => image.toBlob(blob => blob == null ? reject(new Error('Canvas export failed')) : resolve(blob), 'image/png'));
}
