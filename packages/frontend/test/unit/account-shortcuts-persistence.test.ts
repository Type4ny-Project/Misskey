/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import type { StorageProvider } from '@/preferences/manager.js';
import { PreferencesManager } from '@/preferences/manager.js';

vi.mock('@/os.js', () => ({}));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));

function createStorage(): StorageProvider {
	let persisted: string | null = null;
	return {
		load: () => persisted == null ? null : JSON.parse(persisted),
		save: ({ profile }) => { persisted = JSON.stringify(profile); },
		cloudGetBulk: async () => ({}),
		cloudGet: async () => null,
		cloudSet: async () => {},
	};
}

test('persists account A and B shortcuts separately across account changes and reloads', async () => {
	const storage = createStorage();
	const accountA = new PreferencesManager(storage, { id: 'account-a' });
	await accountA.cloudReady;
	expect(accountA.s.accountShortcuts).toEqual({});
	accountA.commit('accountShortcuts', { timelineHome: 'Alt+Shift+KeyH' });
	expect(accountA.r.accountShortcuts.value).toEqual({ timelineHome: 'Alt+Shift+KeyH' });
	expect(accountA.getMatchedRecordOf('accountShortcuts')[0].account).toBe('account-a');

	const accountB = new PreferencesManager(storage, { id: 'account-b' });
	await accountB.cloudReady;
	expect(accountB.s.accountShortcuts).toEqual({});
	expect(accountB.r.accountShortcuts.value).toEqual({});
	accountB.commit('accountShortcuts', { postVisibility: 'Alt+Shift+KeyV' });
	expect(accountB.getMatchedRecordOf('accountShortcuts')[0].account).toBe('account-b');

	const accountAReturned = new PreferencesManager(storage, { id: 'account-a' });
	await accountAReturned.cloudReady;
	expect(accountAReturned.s.accountShortcuts).toEqual({ timelineHome: 'Alt+Shift+KeyH' });
	expect(accountAReturned.r.accountShortcuts.value).toEqual({ timelineHome: 'Alt+Shift+KeyH' });

	const accountBReloaded = new PreferencesManager(storage, { id: 'account-b' });
	await accountBReloaded.cloudReady;
	expect(accountBReloaded.s.accountShortcuts).toEqual({ postVisibility: 'Alt+Shift+KeyV' });

	const guest = new PreferencesManager(storage, null);
	await guest.cloudReady;
	expect(guest.s.accountShortcuts).toEqual({});
});

test('clearing one account shortcuts does not clear another account', async () => {
	const storage = createStorage();
	const accountA = new PreferencesManager(storage, { id: 'account-a' });
	await accountA.cloudReady;
	accountA.commit('accountShortcuts', { timelineHome: 'Alt+Shift+KeyH' });
	const accountB = new PreferencesManager(storage, { id: 'account-b' });
	await accountB.cloudReady;
	accountB.commit('accountShortcuts', { timelineLocal: 'Alt+Shift+KeyL' });

	const accountAReturned = new PreferencesManager(storage, { id: 'account-a' });
	await accountAReturned.cloudReady;
	accountAReturned.commit('accountShortcuts', {});
	const accountBReturned = new PreferencesManager(storage, { id: 'account-b' });
	await accountBReturned.cloudReady;
	expect(accountBReturned.s.accountShortcuts).toEqual({ timelineLocal: 'Alt+Shift+KeyL' });
	const accountAReloaded = new PreferencesManager(storage, { id: 'account-a' });
	await accountAReloaded.cloudReady;
	expect(accountAReloaded.s.accountShortcuts).toEqual({});
});
