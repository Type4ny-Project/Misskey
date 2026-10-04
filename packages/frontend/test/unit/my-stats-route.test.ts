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

test.each(['alice', null])('opens the current account Stats, or the home page when logged out (%s)', async username => {
	account.current = username ? { username, policies: { chatAvailability: 'available' } } : null;
	vi.resetModules();
	const { ROUTE_DEF } = await import('@/router.definition.js');
	const router = new Nirax(ROUTE_DEF, '/', username != null, {});
	router.replaceByPath('/my/stats');
	expect(router.getCurrentFullPath()).toBe(username ? '/@alice/stats' : '/');
	if (username) {
		expect(router.current.props.get('acct')).toBe('alice');
		expect(router.current.props.get('page')).toBe('stats');
	}
});
