/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'node:assert';
import { beforeAll, describe, test } from 'vitest';
import { api, channel, signup } from '../utils.js';
import type * as Misskey from 'misskey-js';

describe('チャンネルのフォロー承認', () => {
	let owner: Misskey.entities.SignupResponse;
	let collaborator: Misskey.entities.SignupResponse;
	let follower: Misskey.entities.SignupResponse;
	let outsider: Misskey.entities.SignupResponse;
	let targetChannel: Misskey.entities.Channel;

	beforeAll(async () => {
		owner = await signup({ username: 'owner' });
		collaborator = await signup({ username: 'collaborator' });
		follower = await signup({ username: 'follower' });
		outsider = await signup({ username: 'outsider' });
		targetChannel = await channel(owner, {
			name: 'private-channel',
			isUnlisted: true,
			isFollowApprovalRequired: true,
		});

		const update = await api('channels/update', {
			channelId: targetChannel.id,
			name: targetChannel.name,
			collaboratorIds: [collaborator.id],
		}, owner);
		assert.strictEqual(update.status, 200, JSON.stringify(update.body));
	}, 1000 * 60 * 2);

	test('非掲載チャンネルを共同管理者が承認し、フォロワーを削除できる', async () => {
		const list = await api('channels/search', { query: '' }, follower);
		assert.strictEqual(list.status, 200);
		assert.strictEqual(list.body.some(channel => channel.id === targetChannel.id), false);

		const search = await api('channels/search', { query: 'private-channel' }, follower);
		assert.strictEqual(search.status, 200);
		assert.strictEqual(search.body.some(channel => channel.id === targetChannel.id), true);

		const featured = await api('channels/featured', {}, follower);
		assert.strictEqual(featured.status, 200);
		assert.strictEqual(featured.body.some(channel => channel.id === targetChannel.id), false);

		const directShow = await api('channels/show', { channelId: targetChannel.id }, follower);
		assert.strictEqual(directShow.status, 200);
		assert.strictEqual(directShow.body.isUnlisted, true);
		assert.strictEqual(directShow.body.isFollowApprovalRequired, true);

		const follow = await api('channels/follow', { channelId: targetChannel.id }, follower);
		assert.strictEqual(follow.status, 200);
		assert.strictEqual(follow.body.state, 'pending');

		const pendingShow = await api('channels/show', { channelId: targetChannel.id }, follower);
		assert.strictEqual(pendingShow.body.isFollowing, false);
		assert.strictEqual(pendingShow.body.hasPendingFollowRequest, true);
		assert.strictEqual(pendingShow.body.followersCount, 0);

		const unauthorizedList = await api('channels/follow-requests/list', { channelId: targetChannel.id }, outsider);
		assert.strictEqual(unauthorizedList.status, 400);

		const collaboratorFollow = await api('channels/follow', { channelId: targetChannel.id }, collaborator);
		assert.strictEqual(collaboratorFollow.status, 200);
		assert.strictEqual(collaboratorFollow.body.state, 'following');
		const collaboratorFollowingShow = await api('channels/show', { channelId: targetChannel.id }, collaborator);
		assert.strictEqual(collaboratorFollowingShow.body.followersCount, 1);
		const removeCollaborator = await api('channels/followers/remove', {
			channelId: targetChannel.id,
			userId: collaborator.id,
		}, owner);
		assert.strictEqual(removeCollaborator.status, 400);

		const requests = await api('channels/follow-requests/list', { channelId: targetChannel.id }, collaborator);
		assert.strictEqual(requests.status, 200);
		assert.strictEqual(requests.body.length, 1);
		assert.strictEqual(requests.body[0].user.id, follower.id);

		const approve = await api('channels/follow-requests/approve', {
			channelId: targetChannel.id,
			userId: follower.id,
		}, collaborator);
		assert.strictEqual(approve.status, 204);

		const approvedShow = await api('channels/show', { channelId: targetChannel.id }, follower);
		assert.strictEqual(approvedShow.body.isFollowing, true);
		assert.strictEqual(approvedShow.body.hasPendingFollowRequest, false);
		assert.strictEqual(approvedShow.body.followersCount, 2);

		const followers = await api('channels/followers', { channelId: targetChannel.id }, collaborator);
		assert.strictEqual(followers.status, 200);
		assert.strictEqual(followers.body.some(following => following.user.id === follower.id), true);
		assert.strictEqual(followers.body.some(following => following.user.id === collaborator.id), true);

		const remove = await api('channels/followers/remove', {
			channelId: targetChannel.id,
			userId: follower.id,
		}, collaborator);
		assert.strictEqual(remove.status, 204);

		const removedShow = await api('channels/show', { channelId: targetChannel.id }, follower);
		assert.strictEqual(removedShow.body.isFollowing, false);
		assert.strictEqual(removedShow.body.followersCount, 1);

		const secondFollow = await api('channels/follow', { channelId: targetChannel.id }, follower);
		assert.strictEqual(secondFollow.body.state, 'pending');
		const disableApproval = await api('channels/update', {
			channelId: targetChannel.id,
			isFollowApprovalRequired: false,
		}, collaborator);
		assert.strictEqual(disableApproval.status, 200);

		const approvalDisabledShow = await api('channels/show', { channelId: targetChannel.id }, follower);
		assert.strictEqual(approvalDisabledShow.body.isFollowApprovalRequired, false);
		assert.strictEqual(approvalDisabledShow.body.isFollowing, true);
		assert.strictEqual(approvalDisabledShow.body.hasPendingFollowRequest, false);
		assert.strictEqual(approvalDisabledShow.body.followersCount, 2);
	});

	test('承認制ではないチャンネルでも既存フォロワーを管理できる', async () => {
		const openChannel = await channel(owner, {
			name: 'open-channel',
			isFollowApprovalRequired: false,
		});

		const follow = await api('channels/follow', { channelId: openChannel.id }, follower);
		assert.strictEqual(follow.status, 200);
		assert.strictEqual(follow.body.state, 'following');

		const openChannelFollowers = await api('channels/followers', { channelId: openChannel.id }, owner);
		assert.strictEqual(openChannelFollowers.status, 200);
		assert.strictEqual(openChannelFollowers.body.some(following => following.user.id === follower.id), true);

		const removeFromOpenChannel = await api('channels/followers/remove', {
			channelId: openChannel.id,
			userId: follower.id,
		}, owner);
		assert.strictEqual(removeFromOpenChannel.status, 204);

		const removedFromOpenChannelShow = await api('channels/show', { channelId: openChannel.id }, follower);
		assert.strictEqual(removedFromOpenChannelShow.body.isFollowing, false);
		assert.strictEqual(removedFromOpenChannelShow.body.followersCount, 0);
	});
});
