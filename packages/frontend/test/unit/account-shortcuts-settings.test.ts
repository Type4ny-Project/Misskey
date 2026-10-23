/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import locales from 'i18n';
import type { AccountShortcuts } from '@/utility/account-shortcuts.js';
import Settings from '@/pages/settings/keyboard-shortcuts.vue';
import { prefer } from '@/preferences.js';
import { PREF_DEF } from '@/preferences/def.js';
import { i18n, updateI18n } from '@/i18n.js';

vi.mock('@/preferences.js', async () => {
	const { ref } = await import('vue');
	const shortcuts = ref<AccountShortcuts>({});
	return {
		prefer: {
			r: { accountShortcuts: shortcuts },
			commit: vi.fn((_key: string, value: AccountShortcuts) => { shortcuts.value = value; }),
		},
	};
});
vi.mock('@/preferences/manager.js', () => ({ definePreferences: <T>(definition: T) => definition }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));

beforeEach(() => {
	updateI18n(locales['ja-JP']);
	prefer.r.accountShortcuts.value = {};
	vi.mocked(prefer.commit).mockClear();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	updateI18n(locales['en-US']);
});

function keydown(init: KeyboardEventInit = {}): KeyboardEvent {
	const ev = new KeyboardEvent('keydown', {
		key: 'h', code: 'KeyH', altKey: true, shiftKey: true, bubbles: true, cancelable: true, ...init,
	});
	// happy-dom incorrectly reports every Alt key as AltGraph.
	const getModifierState = ev.getModifierState.bind(ev);
	vi.spyOn(ev, 'getModifierState').mockImplementation(modifier => modifier === 'AltGraph' ? false : getModifierState(modifier));
	return ev;
}

describe('account shortcut preference', () => {
	test('is account-specific and leaves all shortcuts unassigned by default', () => {
		expect(PREF_DEF.accountShortcuts.accountDependent).toBe(true);
		expect(PREF_DEF.accountShortcuts.default).toEqual({});
	});
});

describe('account shortcut settings', () => {
	test('shows four unassigned, accessibly labelled actions without saving', () => {
		const view = render(Settings);
		for (const action of ['timelineHome', 'timelineLocal', 'timelineSocial', 'postVisibility'] as const) {
			const button = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts[action]}`) });
			expect(button.textContent).toContain(i18n.ts._accountShortcuts.unassigned);
			expect(button.getAttribute('aria-pressed')).toBe('false');
		}
		expect(prefer.commit).not.toHaveBeenCalled();
	});

	test('captures and saves a shortcut immediately, then allows replacing it', async () => {
		const view = render(Settings);
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		await fireEvent.click(home);
		expect(document.activeElement).toBe(home);
		expect(home.getAttribute('aria-pressed')).toBe('true');
		expect(home.textContent).toContain(i18n.ts._accountShortcuts.recording);
		await fireEvent(home, keydown());
		expect(prefer.commit).toHaveBeenLastCalledWith('accountShortcuts', { timelineHome: 'Alt+Shift+KeyH' });
		expect(home.getAttribute('aria-pressed')).toBe('false');
		expect(home.textContent).toContain('Alt+Shift+H');
		expect(view.getByRole('status').textContent).toBe(i18n.ts._accountShortcuts.saved);
		await fireEvent.click(home);
		await fireEvent(home, keydown({ key: 'l', code: 'KeyL' }));
		expect(prefer.commit).toHaveBeenLastCalledWith('accountShortcuts', { timelineHome: 'Alt+Shift+KeyL' });
		expect(home.textContent).toContain('Alt+Shift+L');
	});

	test('preserves another action when saving a new binding', async () => {
		prefer.r.accountShortcuts.value = { timelineLocal: 'Alt+Shift+KeyL' };
		const view = render(Settings);
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		await fireEvent.click(home);
		await fireEvent(home, keydown());
		expect(prefer.commit).toHaveBeenCalledWith('accountShortcuts', {
			timelineHome: 'Alt+Shift+KeyH', timelineLocal: 'Alt+Shift+KeyL',
		});
	});

	test('switching recording buttons applies only to the latest selected action', async () => {
		const view = render(Settings);
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		const local = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineLocal}`) });
		await fireEvent.click(home);
		await fireEvent.click(home);
		await fireEvent.click(local);
		expect(document.activeElement).toBe(local);
		expect(home.getAttribute('aria-pressed')).toBe('false');
		expect(local.getAttribute('aria-pressed')).toBe('true');
		await fireEvent(home, keydown());
		expect(prefer.commit).not.toHaveBeenCalled();
		await fireEvent(local, keydown({ code: 'KeyL', key: 'l' }));
		expect(prefer.commit).toHaveBeenCalledExactlyOnceWith('accountShortcuts', { timelineLocal: 'Alt+Shift+KeyL' });
	});

	test('reports a duplicate without changing either existing binding', async () => {
		const bindings: AccountShortcuts = { timelineHome: 'Alt+Shift+KeyH', timelineLocal: 'Alt+Shift+KeyL' };
		prefer.r.accountShortcuts.value = { ...bindings };
		const view = render(Settings);
		const local = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineLocal}`) });
		await fireEvent.click(local);
		await fireEvent(local, keydown());
		expect(prefer.commit).not.toHaveBeenCalled();
		expect(prefer.r.accountShortcuts.value).toEqual(bindings);
		expect(view.getByRole('alert').textContent).toContain(i18n.ts._accountShortcuts.timelineHome);
		expect(local.getAttribute('aria-pressed')).toBe('true');
		await fireEvent(local, keydown({ code: 'KeyS', key: 's' }));
		expect(prefer.commit).toHaveBeenCalledWith('accountShortcuts', { ...bindings, timelineLocal: 'Alt+Shift+KeyS' });
		expect(view.queryByRole('alert')).toBeNull();
	});

	test.each([
		{ key: 'h', code: 'KeyH', altKey: false, shiftKey: false },
		{ key: 's', code: 'KeyS', altKey: false, shiftKey: false, ctrlKey: true },
		{ key: 'Enter', code: 'Enter', altKey: false, shiftKey: false, ctrlKey: true },
	])('rejects unmodified, reserved, and existing hotkey combinations: %j', async (init) => {
		const view = render(Settings);
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		await fireEvent.click(home);
		await fireEvent(home, keydown(init));
		expect(prefer.commit).not.toHaveBeenCalled();
		expect(view.getByRole('alert').textContent).toBe(i18n.ts._accountShortcuts.invalid);
	});

	test.each(['Escape', 'Tab'])('%s cancels recording and keeps the previous binding', async (key) => {
		prefer.r.accountShortcuts.value = { timelineHome: 'Alt+Shift+KeyH' };
		const view = render(Settings);
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		await fireEvent.click(home);
		const ev = keydown({ key, code: key, altKey: false, shiftKey: false });
		await fireEvent(home, ev);
		expect(home.getAttribute('aria-pressed')).toBe('false');
		expect(home.textContent).toContain('Alt+Shift+H');
		expect(prefer.commit).not.toHaveBeenCalled();
		expect(ev.defaultPrevented).toBe(key === 'Escape');
		await fireEvent(home, keydown({ code: 'KeyL', key: 'l' }));
		expect(prefer.commit).not.toHaveBeenCalled();
	});

	test('moving focus cancels recording without saving', async () => {
		const view = render(Settings);
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		await fireEvent.click(home);
		await fireEvent.blur(home);
		expect(home.getAttribute('aria-pressed')).toBe('false');
		await fireEvent(home, keydown());
		expect(prefer.commit).not.toHaveBeenCalled();
	});

	test('the cancel button exits capture without saving', async () => {
		const view = render(Settings);
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		await fireEvent.click(home);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.cancel }));
		expect(home.getAttribute('aria-pressed')).toBe('false');
		expect(prefer.commit).not.toHaveBeenCalled();
	});

	test.each([
		{ isComposing: true }, { repeat: true }, { key: 'Shift', code: 'ShiftLeft' },
	])('does not save an interrupted or incomplete key event: %j', async (init) => {
		const view = render(Settings);
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		await fireEvent.click(home);
		await fireEvent(home, keydown(init));
		expect(prefer.commit).not.toHaveBeenCalled();
		expect(home.getAttribute('aria-pressed')).toBe('true');
		expect(view.queryByRole('alert')).toBeNull();
	});

	test.each([{ isComposing: true }, { repeat: true }])('does not leak interrupted capture to existing global hotkeys: %j', async (init) => {
		const view = render(Settings);
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		await fireEvent.click(home);
		const ev = keydown(init);
		const stopPropagation = vi.spyOn(ev, 'stopPropagation');
		await fireEvent(home, ev);
		expect(stopPropagation).toHaveBeenCalled();
		expect(ev.defaultPrevented).toBe(false);
		expect(prefer.commit).not.toHaveBeenCalled();
	});

	test('ignores legacy IME events while keeping capture active', async () => {
		const view = render(Settings);
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		await fireEvent.click(home);
		const ev = keydown();
		Object.defineProperty(ev, 'keyCode', { value: 229 });
		await fireEvent(home, ev);
		expect(prefer.commit).not.toHaveBeenCalled();
		expect(home.getAttribute('aria-pressed')).toBe('true');
	});

	test('Escape during IME composition keeps capture active and leaves IME cancellation intact', async () => {
		const view = render(Settings);
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		await fireEvent.click(home);
		const ev = keydown({ key: 'Escape', code: 'Escape', isComposing: true, altKey: false, shiftKey: false });
		const stopPropagation = vi.spyOn(ev, 'stopPropagation');
		await fireEvent(home, ev);
		expect(home.getAttribute('aria-pressed')).toBe('true');
		expect(ev.defaultPrevented).toBe(false);
		expect(stopPropagation).toHaveBeenCalled();
		expect(prefer.commit).not.toHaveBeenCalled();
		await fireEvent(home, keydown());
		expect(prefer.commit).toHaveBeenCalledWith('accountShortcuts', { timelineHome: 'Alt+Shift+KeyH' });
	});

	test('clears only the selected action and updates the displayed state', async () => {
		prefer.r.accountShortcuts.value = { timelineHome: 'Alt+Shift+KeyH', postVisibility: 'Alt+Shift+KeyV' };
		const view = render(Settings);
		const clearName = i18n.tsx._accountShortcuts.clearBinding({ action: i18n.ts._accountShortcuts.timelineHome });
		await fireEvent.click(view.getByRole('button', { name: clearName }));
		expect(prefer.commit).toHaveBeenCalledWith('accountShortcuts', { postVisibility: 'Alt+Shift+KeyV' });
		expect(view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) }).textContent).toContain(i18n.ts._accountShortcuts.unassigned);
		expect(view.queryByRole('button', { name: clearName })).toBeNull();
	});

	test('updates displayed bindings when the active account preference changes', async () => {
		prefer.r.accountShortcuts.value = { timelineHome: 'Alt+Shift+KeyH' };
		const view = render(Settings);
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		expect(home.textContent).toContain('Alt+Shift+H');
		prefer.r.accountShortcuts.value = {};
		await nextTick();
		expect(home.textContent).toContain(i18n.ts._accountShortcuts.unassigned);
		expect(prefer.commit).not.toHaveBeenCalled();
	});

	test('recovers malformed imported bindings while preserving valid assignments', async () => {
		prefer.r.accountShortcuts.value = {
			timelineHome: 42,
			timelineLocal: null,
			timelineSocial: 'invalid',
			postVisibility: 'Alt+Shift+KeyV',
		} as unknown as AccountShortcuts;
		const view = render(Settings);
		for (const action of ['timelineHome', 'timelineLocal', 'timelineSocial'] as const) {
			expect(view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts[action]}`) }).textContent).toContain(i18n.ts._accountShortcuts.unassigned);
		}
		expect(view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.postVisibility}`) }).textContent).toContain('Alt+Shift+V');
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		await fireEvent.click(home);
		await fireEvent(home, keydown());
		expect(prefer.commit).toHaveBeenCalledWith('accountShortcuts', { timelineHome: 'Alt+Shift+KeyH', postVisibility: 'Alt+Shift+KeyV' });
	});

	test.each([null, 42])('treats an invalid imported preference record as unassigned: %j', (value) => {
		prefer.r.accountShortcuts.value = value as unknown as AccountShortcuts;
		const view = render(Settings);
		expect(view.getAllByText(i18n.ts._accountShortcuts.unassigned)).toHaveLength(4);
		expect(prefer.commit).not.toHaveBeenCalled();
	});

	test('captures only on its recording button and leaves no global capture after unmount', async () => {
		const view = render(Settings);
		const home = view.getByRole('button', { name: new RegExp(`^${i18n.ts._accountShortcuts.timelineHome}`) });
		await fireEvent.click(home);
		const globalEvent = keydown();
		await fireEvent(document.body, globalEvent);
		expect(prefer.commit).not.toHaveBeenCalled();
		expect(globalEvent.defaultPrevented).toBe(false);
		view.unmount();
		const afterUnmount = keydown();
		await fireEvent(document.body, afterUnmount);
		expect(prefer.commit).not.toHaveBeenCalled();
		expect(afterUnmount.defaultPrevented).toBe(false);
	});
});
