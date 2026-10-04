/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { beforeAll, describe, expect, test } from 'vitest';
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
});
