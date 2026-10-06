/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { api, castAsError, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('Calls', () => {
	let alice: misskey.entities.SignupResponse;

	beforeAll(async () => {
		alice = await signup({ username: 'calls_alice' });
	});

	describe('rooms/join', () => {
		test('reconnectTokenはUUIDでなければならない', async () => {
			const response = await api('calls/rooms/join', {
				roomId: '9a000000000000000000000000000000',
				reconnectToken: 'invalid-token',
			}, alice);

			expect(response.status).toBe(400);
		});
	});

	describe('rooms/create', () => {
		test('modeはopenまたはstageでなければならない', async () => {
			const response = await api('calls/rooms/create', {
				attachmentType: 'personal',
				title: 'Invalid mode',
				mode: 'invalid' as never,
			}, alice);

			expect(response.status).toBe(400);
		});
	});

	describe('rooms/cancel-speaker-request', () => {
		test('参加していないルームのリクエストは取り消せない', async () => {
			const response = await api('calls/rooms/cancel-speaker-request', {
				roomId: '9a000000000000000000000000000000',
			}, alice);

			expect(response.status).toBe(400);
		});
	});

	describe('rooms/leave', () => {
		test('再接続用の値は3項目すべてを指定する', async () => {
			const response = await api('calls/rooms/leave', {
				roomId: '9a000000000000000000000000000000',
				reconnectToken: '11111111-1111-4111-8111-111111111111',
			}, alice);

			expect(response.status).toBe(400);
			expect(castAsError(response.body ?? {}).error.code).toBe('CALLS_INVALID_STATE');
		});
	});

	describe('drawing/stroke', () => {
		test.each([
			{ color: '#112233', width: 4, eraser: false, points: [] },
			{ color: '#112233', width: 65, eraser: false, points: [[10, 20]] },
			{ color: 'invalid', width: 4, eraser: false, points: [[10, 20]] },
		])('描画入力のサイズと色を検証する (%j)', async stroke => {
			const response = await api('drawing/stroke', {
				roomId: '9a000000000000000000000000000000',
				canvasId: '11111111-1111-4111-8111-111111111111',
				stroke,
			}, alice);
			expect(response.status).toBe(400);
			expect(castAsError(response.body ?? {}).error.code).toBe('INVALID_PARAM');
		});
	});

	describe.runIf(loadConfig().cloudflareRealtime?.enabled === true)('Drawing room lifecycle', () => {
		test('公開キャンバスで参加・描画・文字チャット・退出・消去・終了を同期する', async () => {
			const bob = await signup({ username: 'drawing_bob' });
			const created = await api('calls/rooms/create', { attachmentType: 'personal', title: 'Drawing', visibility: 'public' }, alice);
			expect(created.status).toBe(200);
			const roomId = created.body.id;
			await api('calls/rooms/open', { roomId, expectedRevision: created.body.revision }, alice);
			expect((await api('drawing/show', { roomId }, alice)).body.canvas).toBeNull();
			expect((await api('drawing/start', { roomId, scope: 'public' }, alice)).status).toBe(204);
			const canvasId = (await api('drawing/show', { roomId }, alice)).body.canvas!.canvasId;
			expect((await api('drawing/join', { roomId, canvasId }, bob)).status).toBe(204);
			const stroke = { color: '#112233', width: 4, eraser: false, points: [[10, 20], [30, 40]] };
			expect((await api('drawing/stroke', { roomId, canvasId, stroke }, bob)).status).toBe(204);
			expect((await api('drawing/message', { roomId, canvasId, text: 'hello' }, bob)).status).toBe(204);
			expect((await api('drawing/show', { roomId }, alice)).body.canvas).toMatchObject({ strokes: [stroke], messages: [{ userId: bob.id, text: 'hello' }] });
			await api('drawing/leave', { roomId, canvasId }, bob);
			expect(castAsError((await api('drawing/stroke', { roomId, canvasId, stroke }, bob)).body ?? {}).error.code).toBe('DRAWING_ACCESS_DENIED');
			await api('drawing/join', { roomId, canvasId }, bob);
			await api('drawing/kick', { roomId, canvasId, userId: bob.id }, alice);
			expect(castAsError((await api('drawing/show', { roomId }, bob)).body ?? {}).error.code).toBe('DRAWING_ACCESS_DENIED');
			await api('drawing/clear', { roomId, canvasId }, alice);
			const cleared = (await api('drawing/show', { roomId }, alice)).body.canvas!;
			expect(cleared.strokes).toEqual([]);
			expect(cleared.canvasId).not.toBe(canvasId);
			await api('drawing/end', { roomId, canvasId: cleared.canvasId }, alice);
			expect((await api('drawing/show', { roomId }, alice)).body.canvas?.ended).toBe(true);
		});
	});
});
