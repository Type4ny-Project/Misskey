/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, beforeAll, test } from 'vitest';
import { api, castAsError, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('Channel', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	beforeAll(async () => {
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
	});

	describe('Update', () => {
		let channel: misskey.entities.ChannelsCreateResponse;

		beforeAll(async () => {
			channel = (await api('channels/create', { name: 'update-test-channel' }, alice)).body;
		});

		test('所有者が共同管理者を追加できる', async () => {
			const res = await api('channels/update', {
				channelId: channel.id,
				collaboratorIds: [bob.id],
			}, alice);

			assert.strictEqual(res.status, 200, JSON.stringify(res.body));
			assert.deepStrictEqual(res.body.collaboratorIds, [bob.id]);
		});

		test('共同管理者が未変更の共同管理者一覧を含めてチャンネル名を変更できる', async () => {
			const res = await api('channels/update', {
				channelId: channel.id,
				name: 'updated-by-collaborator',
				collaboratorIds: [bob.id],
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.name, 'updated-by-collaborator');
		});

		test('共同管理者は共同管理者一覧を変更できない', async () => {
			const res = await api('channels/update', {
				channelId: channel.id,
				collaboratorIds: [],
			}, bob);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body).error.code, 'ACCESS_DENIED');
		});
	});

	describe('Federation', () => {
		test('連合可能なチャンネルで投稿単位の連合なし設定を保持する', async () => {
			const channel = (await api('channels/create', {
				name: 'federated-channel',
				isLocalOnly: false,
			}, alice)).body;

			const res = await api('notes/create', {
				text: 'local-only channel note',
				channelId: channel.id,
				localOnly: true,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.createdNote.localOnly, true);
		});

		test('連合なしチャンネルでは投稿単位の設定にかかわらず連合なしにする', async () => {
			const channel = (await api('channels/create', {
				name: 'local-only-channel',
				isLocalOnly: true,
			}, alice)).body;

			const res = await api('notes/create', {
				text: 'forced local-only channel note',
				channelId: channel.id,
				localOnly: false,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.createdNote.localOnly, true);
		});
	});

	describe('Follow', () => {
		let channel: misskey.entities.ChannelsCreateResponse;

		beforeAll(async () => {
			const res = await api('channels/create', { name: 'follow-test-channel' }, alice);
			channel = res.body;
		});

		test('フォローしているチャンネルを再度フォローするとALREADY_FOLLOWINGエラーになる', async () => {
			const res1 = await api('channels/follow', { channelId: channel.id }, alice);
			assert.strictEqual(res1.status, 200);
			assert.strictEqual(res1.body.state, 'following');
			const followedChannel = await api('channels/show', { channelId: channel.id }, alice);
			assert.strictEqual(followedChannel.body.isFollowing, true, JSON.stringify(followedChannel.body));

			const res2 = await api('channels/follow', { channelId: channel.id }, alice);
			assert.strictEqual(res2.status, 400, JSON.stringify(res2.body));
			assert.strictEqual(castAsError(res2.body as any).error.code, 'ALREADY_FOLLOWING');
		});
	});
});
