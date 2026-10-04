/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';

export const callsUsersById = shallowRef(new Map<string, Misskey.entities.UserDetailed>());
const pendingUsersById = new Map<string, Promise<void>>();
const retryAfterByUserId = new Map<string, number>();
const queuedUserIds = new Set<string>();
let queuedRequest: Promise<void> | null = null;

export async function loadCallsUsers(userIds: string[]): Promise<void> {
	const missingIds = [...new Set(userIds)].filter(userId => !callsUsersById.value.has(userId) && !pendingUsersById.has(userId) && (retryAfterByUserId.get(userId) ?? 0) <= Date.now());
	if (missingIds.length > 0) {
		for (const userId of missingIds) queuedUserIds.add(userId);
		// Cards mounted in the same tick share one batch, including different rooms.
		queuedRequest ??= Promise.resolve().then(async () => {
			const batchIds = [...queuedUserIds];
			queuedUserIds.clear();
			queuedRequest = null;
			try {
				const users = await misskeyApi('users/show', { userIds: batchIds }).catch(() => []);
				const next = new Map(callsUsersById.value);
				for (const user of users) next.set(user.id, user);
				callsUsersById.value = next;
				for (const userId of batchIds) {
					if (next.has(userId)) retryAfterByUserId.delete(userId);
					else retryAfterByUserId.set(userId, Date.now() + 60_000);
				}
			} finally {
				for (const userId of batchIds) pendingUsersById.delete(userId);
			}
		});
		for (const userId of missingIds) pendingUsersById.set(userId, queuedRequest);
	}
	await Promise.all(userIds.map(userId => pendingUsersById.get(userId)));
}
