/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import { callsUsersById, loadCallsUsers } from '@/utility/calls-users.js';

const fixture = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api }));

test('shares pending requests and keeps users cached for later callers', async () => {
	let resolveUser!: (user: { id: string; username: string }) => void;
	fixture.api.mockImplementation(() => new Promise(resolve => { resolveUser = resolve; }));
	const loading = loadCallsUsers(['alice', 'alice']);
	await loadCallsUsers(['alice']);
	expect(fixture.api).toHaveBeenCalledTimes(1);
	resolveUser({ id: 'alice', username: 'Alice' });
	await loading;
	await loadCallsUsers(['alice']);
	expect(callsUsersById.value.get('alice')?.username).toBe('Alice');
	expect(fixture.api).toHaveBeenCalledTimes(1);
});
