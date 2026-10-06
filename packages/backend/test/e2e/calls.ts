/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { beforeAll, describe, expect, test } from 'vitest';
import { api, castAsError, createAppToken, signup } from '../utils.js';
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
	describe('Watch Together', () => {
		test('共有状態の取得と操作権限、入力、終了後の制限', async () => {
			const viewer = await signup({ username: 'watch_viewer' });
			const created = await api('calls/rooms/create', { attachmentType: 'personal', title: 'Watch Together', visibility: 'public' }, alice);
			expect(created.status).toBe(200);
			const roomId = created.body.id;
			await api('calls/rooms/open', { roomId, expectedRevision: created.body.revision }, alice);
			const invalid = await api('calls/watch-together/update', { roomId, expectedRevision: 0, videoId: 'https://example.com/video' }, alice);
			expect(invalid.status).toBe(400);
			const selected = await api('calls/watch-together/update', { roomId, expectedRevision: 0, videoId: 'M7lc1UVf-VE' }, alice);
			expect(selected.status).toBe(200);
			const show = await api('calls/watch-together/show', { roomId }, viewer);
			expect(show.status).toBe(200);
			expect(show.body).toMatchObject({ videoId: 'M7lc1UVf-VE', playing: false, revision: 1 });
			const denied = await api('calls/watch-together/update', { roomId, expectedRevision: 1, playing: true }, viewer);
			expect(castAsError(denied.body).error.code).toBe('CALLS_ACCESS_DENIED');
			const readOnlyToken = await createAppToken(alice, ['read:calls']);
			expect((await api('calls/watch-together/update', { roomId, expectedRevision: 1, playing: true }, { token: readOnlyToken })).status).toBe(403);
			const playing = await api('calls/watch-together/update', { roomId, expectedRevision: 1, playing: true, position: 30 }, alice);
			expect(playing.body).toMatchObject({ playing: true, position: 30, revision: 2 });
			const queued = await api('calls/watch-together/update', { roomId, expectedRevision: 2, queue: ['dQw4w9WgXcQ'] }, alice);
			expect(queued.status).toBe(200);
			expect(queued.body).toMatchObject({ videoId: 'M7lc1UVf-VE', playing: true, queue: ['dQw4w9WgXcQ'], revision: 3 });
			expect((await api('calls/watch-together/show', { roomId }, viewer)).body.queue).toEqual(['dQw4w9WgXcQ']);
			expect(castAsError((await api('calls/watch-together/update', { roomId, expectedRevision: 3, queue: [] }, viewer)).body).error.code).toBe('CALLS_ACCESS_DENIED');
			expect((await api('calls/watch-together/update', { roomId, expectedRevision: 3, queue: ['invalid'] }, alice)).status).toBe(400);
			const snapshot = await api('calls/rooms/show', { roomId }, alice);
			await api('calls/rooms/end', { roomId, expectedRevision: snapshot.body.room.revision }, alice);
			expect((await api('calls/watch-together/show', { roomId }, viewer)).body.playing).toBe(false);
			expect(castAsError((await api('calls/watch-together/update', { roomId, expectedRevision: 2, playing: true }, alice)).body).error.code).toBe('CALLS_INVALID_STATE');
		});

		test('非公開ルームの視聴状態を外部ユーザーに公開しない', async () => {
			const outsider = await signup({ username: 'watch_outsider' });
			const room = await api('calls/rooms/create', { attachmentType: 'personal', title: 'Private Watch Together', visibility: 'specified', visibleUserIds: [] }, alice);
			expect(room.status).toBe(200);
			expect(castAsError((await api('calls/watch-together/show', { roomId: room.body.id }, outsider)).body).error.code).toBe('CALLS_ACCESS_DENIED');
		});
	});

});
