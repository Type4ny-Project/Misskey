/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';

export const callsUsersById = shallowRef(new Map<string, Misskey.entities.UserDetailed>());
const pendingUserIds = new Set<string>();

export async function loadCallsUsers(userIds: string[]): Promise<void> {
	const missingIds = [...new Set(userIds)].filter(userId => !callsUsersById.value.has(userId) && !pendingUserIds.has(userId));
	await Promise.all(missingIds.map(async userId => {
		pendingUserIds.add(userId);
		try {
			const user = await misskeyApi('users/show', { userId }).catch(() => null);
			if (user != null) callsUsersById.value = new Map(callsUsersById.value).set(user.id, user);
		} finally {
			pendingUserIds.delete(userId);
		}
	}));
}
