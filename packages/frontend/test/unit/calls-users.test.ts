/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api }));

let users: typeof import('@/utility/calls-users.js');
beforeEach(async () => {
	vi.resetModules();
	fixture.api.mockReset();
	users = await import('@/utility/calls-users.js');
});
afterEach(() => vi.useRealTimers());

test('batches overlapping callers and shares cached and pending users across views', async () => {
	let resolveUsers!: (value: { id: string; username: string }[]) => void;
	fixture.api.mockImplementation(() => new Promise(resolve => { resolveUsers = resolve; }));
	const userIds = Array.from({ length: 30 }, (_, index) => `user-${index}`);
	const loading = Array.from({ length: 5 }, () => users.loadCallsUsers(userIds));
	loading.push(users.loadCallsUsers(['user-0', 'friend', 'friend']));
	await Promise.resolve();
	loading.push(users.loadCallsUsers(['user-0']));
	expect(fixture.api).toHaveBeenCalledTimes(1);
	expect(fixture.api).toHaveBeenCalledWith('users/show', { userIds: [...userIds, 'friend'] });
	resolveUsers([...userIds, 'friend'].map(id => ({ id, username: id })));
	await Promise.all(loading);
	await users.loadCallsUsers(userIds);
	expect(users.callsUsersById.value.size).toBe(31);
	expect(fixture.api).toHaveBeenCalledTimes(1);
});

test('loads new users without waiting for an unrelated pending batch', async () => {
	let resolveUsers!: (value: { id: string }[]) => void;
	fixture.api.mockImplementationOnce(() => new Promise(resolve => { resolveUsers = resolve; }))
		.mockResolvedValueOnce([{ id: 'bob' }]);
	const loading = users.loadCallsUsers(['alice']);
	await Promise.resolve();
	await users.loadCallsUsers(['bob']);
	expect(users.callsUsersById.value.has('bob')).toBe(true);
	resolveUsers([{ id: 'alice' }]);
	await loading;
});

test.each(['rejected', 'omitted'])('holds off %s users for one minute without blocking other users', async failure => {
	vi.useFakeTimers();
	if (failure === 'rejected') fixture.api.mockRejectedValueOnce(new Error('Unavailable'));
	else fixture.api.mockResolvedValueOnce([]);
	await users.loadCallsUsers(['alice']);
	await users.loadCallsUsers(['alice']);
	expect(fixture.api).toHaveBeenCalledTimes(1);
	fixture.api.mockResolvedValueOnce([{ id: 'bob' }]);
	await users.loadCallsUsers(['alice', 'bob']);
	expect(fixture.api).toHaveBeenLastCalledWith('users/show', { userIds: ['bob'] });
	vi.advanceTimersByTime(60_000);
	fixture.api.mockResolvedValueOnce([{ id: 'alice' }]);
	await users.loadCallsUsers(['alice', 'bob']);
	expect(fixture.api).toHaveBeenLastCalledWith('users/show', { userIds: ['alice'] });
	expect(users.callsUsersById.value.has('alice')).toBe(true);
});
