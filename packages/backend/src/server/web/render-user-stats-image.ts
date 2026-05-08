/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createCanvas } from '@napi-rs/canvas';

export type UserStatsImageData = {
	username: string;
	sinceDate: Date;
	notesCount: number;
	reactionsCount: number;
	receivedReactionsCount: number;
	postingDaysCount: number;
	topReactions: { reaction: string; count: number }[];
	topReceivedReactions: { reaction: string; count: number }[];
};

export async function renderUserStatsImage(stats: UserStatsImageData): Promise<Buffer> {
	const width = 1200;
	const height = 630;
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');
	const accent = '#86b300';
	const bg = '#18191c';
	const panel = '#22242a';
	const fg = '#f4f4f5';
	const muted = '#a7abb3';

	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, width, height);
	ctx.fillStyle = '#202818';
	ctx.beginPath();
	ctx.arc(1030, 58, 270, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = accent;
	ctx.fillRect(0, 0, width, 12);
	ctx.fillStyle = panel;
	roundRect(ctx, 64, 64, width - 128, height - 128, 32);
	ctx.fill();

	drawText(ctx, 'Weekly Stats', 96, 132, 52, fg, 800, 'bold');
	drawText(ctx, `@${stats.username}`, 98, 174, 25, muted, 800);
	drawText(ctx, `${stats.sinceDate.toLocaleDateString()} からのまとめ`, 98, 210, 24, muted, 800);

	drawMetric(ctx, '投稿数', stats.notesCount, 96, 280, accent, fg);
	drawMetric(ctx, 'リアクションした数', stats.reactionsCount, 320, 280, accent, fg);
	drawMetric(ctx, 'もらったリアクション', stats.receivedReactionsCount, 604, 280, accent, fg);
	drawMetric(ctx, '投稿した日数', stats.postingDaysCount, 884, 280, accent, fg);

	drawText(ctx, 'よく使った絵文字 Top 3', 96, 420, 26, fg, 480, 'bold');
	drawRanking(ctx, stats.topReactions, 96, 468, fg, muted);
	drawText(ctx, 'もらった絵文字 Top 3', 604, 420, 26, fg, 480, 'bold');
	drawRanking(ctx, stats.topReceivedReactions, 604, 468, fg, muted);

	drawText(ctx, 'Misskey Weekly Summary', 96, 574, 22, muted, 900);

	return await canvas.encode('png');
}

function drawMetric(ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>, label: string, value: number, x: number, y: number, accent: string, fg: string): void {
	drawText(ctx, label, x, y, 22, fg, 260);
	drawText(ctx, value.toLocaleString(), x, y + 62, 54, accent, 240, 'bold');
}

function drawRanking(ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>, items: { reaction: string; count: number }[], x: number, y: number, fg: string, muted: string): void {
	if (items.length === 0) {
		drawText(ctx, 'なし', x, y, 26, muted, 420);
		return;
	}

	items.forEach((item, index) => {
		drawText(ctx, `${index + 1}. ${item.reaction}`, x, y + (index * 38), 28, fg, 320);
		drawText(ctx, `x${item.count.toLocaleString()}`, x + 340, y + (index * 38), 28, muted, 120, 'bold');
	});
}

function drawText(ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>, text: string, x: number, y: number, size: number, color: string, maxWidth: number, weight = 'normal'): void {
	ctx.fillStyle = color;
	ctx.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
	ctx.fillText(text, x, y, maxWidth);
}

function roundRect(ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>, x: number, y: number, width: number, height: number, radius: number): void {
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.arcTo(x + width, y, x + width, y + height, radius);
	ctx.arcTo(x + width, y + height, x, y + height, radius);
	ctx.arcTo(x, y + height, x, y, radius);
	ctx.arcTo(x, y, x + width, y, radius);
	ctx.closePath();
}
