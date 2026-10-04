/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, onScopeDispose, reactive, toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import { useStream } from '@/stream.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const roomIdsByUserId = reactive(new Map<string, string | null>());
const observerCounts = new Map<string, number>();
const pendingUserIds = new Set<string>();
let flushTimer: number | null = null;
let streamStarted = false;

function schedule(userId: string): void {
	if (!roomIdsByUserId.has(userId)) pendingUserIds.add(userId);
	if (flushTimer == null) flushTimer = window.setTimeout(() => void flush(), 0);
	startStream();
}

function retain(userId: string): void {
	observerCounts.set(userId, (observerCounts.get(userId) ?? 0) + 1);
	schedule(userId);
}

function release(userId: string): void {
	const next = (observerCounts.get(userId) ?? 1) - 1;
	if (next > 0) {
		observerCounts.set(userId, next);
		return;
	}
	observerCounts.delete(userId);
	pendingUserIds.delete(userId);
	roomIdsByUserId.delete(userId);
}

async function flush(): Promise<void> {
	flushTimer = null;
	const userIds = [...pendingUserIds].slice(0, 100);
	for (const userId of userIds) pendingUserIds.delete(userId);
	if (userIds.length === 0) return;
	try {
		const active = await misskeyApi('calls/users/active-rooms', { userIds });
		const activeByUserId = new Map(active.map(entry => [entry.userId, entry.roomId]));
		for (const userId of userIds) if (observerCounts.has(userId)) roomIdsByUserId.set(userId, activeByUserId.get(userId) ?? null);
	} catch {
		for (const userId of userIds) if (observerCounts.has(userId)) roomIdsByUserId.set(userId, null);
	}
	if (pendingUserIds.size > 0 && flushTimer == null) flushTimer = window.setTimeout(() => void flush(), 0);
}

function refreshObservedUsers(): void {
	for (const userId of observerCounts.keys()) {
		roomIdsByUserId.delete(userId);
		pendingUserIds.add(userId);
	}
	if (pendingUserIds.size > 0 && flushTimer == null) flushTimer = window.setTimeout(() => void flush(), 0);
}

function startStream(): void {
	if (streamStarted) return;
	streamStarted = true;
	const connection = useStream().useChannel('callsRooms');
	connection.on('created', refreshObservedUsers);
	connection.on('updated', refreshObservedUsers);
}

export function useCallsUserRoom(userId: MaybeRefOrGetter<string>) {
	let retainedUserId: string | null = null;
	const stop = watch(() => toValue(userId), nextUserId => {
		if (retainedUserId === nextUserId) return;
		if (retainedUserId != null) release(retainedUserId);
		retainedUserId = nextUserId;
		retain(nextUserId);
	}, { immediate: true });
	onScopeDispose(() => {
		stop();
		if (retainedUserId != null) release(retainedUserId);
	});
	return computed(() => roomIdsByUserId.get(toValue(userId)) ?? null);
}
