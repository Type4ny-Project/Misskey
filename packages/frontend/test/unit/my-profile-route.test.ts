/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import { Nirax } from '@/lib/nirax.js';

const account = vi.hoisted(() => ({ current: null as { username: string; policies: { chatAvailability: string } } | null }));
vi.mock('@/i.js', () => ({ get $i() { return account.current; }, iAmModerator: false }));
vi.mock('@/pages/_loading_.vue', () => ({ default: {} }));
vi.mock('@/pages/_error_.vue', () => ({ default: {} }));
vi.mock('@/pages/timeline.vue', () => ({ default: {} }));

test.each([
	['alice', '/:my', '/@alice'],
	['alice', '/:my/stats', '/@alice/stats'],
	['alice', '/:my/notes?from=shared#latest', '/@alice/notes?from=shared#latest'],
	['alice', '/:my/followers', '/@alice/followers'],
	['alice', '/:my/pages/my%20page?foo=bar#section', '/@alice/pages/my%20page?foo=bar#section'],
	[null, '/:my/stats', '/'],
] as const)('resolves the current profile alias for %s: %s', async (username, path, expected) => {
	account.current = username ? { username, policies: { chatAvailability: 'available' } } : null;
	vi.resetModules();
	const { ROUTE_DEF } = await import('@/router.definition.js');
	const router = new Nirax(ROUTE_DEF, '/', username != null, {});
	router.replaceByPath(path);
	expect(router.getCurrentFullPath()).toBe(expected);
	if (username) expect(router.current.route.path).not.toBe('/:(*)');
});

test('does not treat other paths as the current profile alias', async () => {
	const { ROUTE_DEF } = await import('@/router.definition.js');
	const router = new Nirax(ROUTE_DEF, '/', false, {});
	expect(router.resolve('/:my-other/stats')?.route.path).toBe('/:(*)');
	expect(router.resolve('/other/stats')?.route.path).toBe('/:(*)');
});
