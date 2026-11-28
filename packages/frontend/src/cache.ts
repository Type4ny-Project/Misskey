/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { Cache } from '@/utility/cache.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';

// ページの再読み込みをまたいで保持するキャッシュの保存設定。
// 保存先はアカウントごとに分け、ログアウト時はsignout()がIndexedDB/localStorageごと消す。
function persistList<T extends unknown[]>(name: string) {
	return {
		key: () => $i == null ? null : `listCache:${$i.id}:${name}`,
		validate: (value: unknown): value is T => Array.isArray(value),
	};
}

export const clipsCache = new Cache<Misskey.entities.Clip[]>(1000 * 60 * 30, () => misskeyApi('clips/list', { limit: 30 }));
export const rolesCache = new Cache(1000 * 60 * 30, () => misskeyApi('admin/roles/list', { limit: 30 }));
export const userListsCache = new Cache<Misskey.entities.UserList[]>(1000 * 60 * 30, () => misskeyApi('users/lists/list'), persistList('userLists'));
export const userFavoriteListsCache = new Cache<Misskey.entities.UserList[]>(1000 * 60 * 30, () => misskeyApi('users/lists/list-favorite' as any), persistList('userFavoriteLists'));
export const antennasCache = new Cache<Misskey.entities.Antenna[]>(1000 * 60 * 30, () => misskeyApi('antennas/list', { limit: 30 }), persistList('antennas'));
export const userChannelsCache = new Cache<Misskey.entities.Channel[]>(1000 * 60 * 30, () => misskeyApi('channels/owned' as any), persistList('userChannels'));
export const userChannelFollowingsCache = new Cache<Misskey.entities.Channel[]>(1000 * 60 * 30, () => misskeyApi('channels/followed' as any), persistList('userChannelFollowings'));
export const favoritedChannelsCache = new Cache<Misskey.entities.Channel[]>(1000 * 60 * 30, () => misskeyApi('channels/my-favorites', { limit: 100 }));
export const followedHashtagsCache = new Cache<Misskey.entities.HashtagsFollowedResponse>(1000 * 60 * 30, () => misskeyApi('hashtags/followed', { limit: 100 }), persistList('followedHashtags'));
export const favoritedClipsCache = new Cache<Misskey.entities.Clip[]>(1000 * 60 * 30, () => misskeyApi('clips/my-favorites', {}));
