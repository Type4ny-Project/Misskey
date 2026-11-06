/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AccountShortcuts } from '@/utility/account-shortcuts.js';
import {
	accountShortcutActions,
	findAccountShortcutConflict,
	formatAccountShortcut,
	matchAccountShortcut,
	parseAccountShortcut,
	shortcutFromEvent,
} from '@/utility/account-shortcuts.js';

function keydown(init: KeyboardEventInit = {}): KeyboardEvent {
	const ev = new KeyboardEvent('keydown', {
		key: 'h',
		code: 'KeyH',
		altKey: true,
		shiftKey: true,
		bubbles: true,
		cancelable: true,
		...init,
	});
	// happy-dom incorrectly reports every Alt key as AltGraph.
	const getModifierState = ev.getModifierState.bind(ev);
	vi.spyOn(ev, 'getModifierState').mockImplementation(modifier => modifier === 'AltGraph' ? false : getModifierState(modifier));
	return ev;
}

function eventAt(target: Element, init: KeyboardEventInit = {}): KeyboardEvent {
	const ev = keydown(init);
	target.dispatchEvent(ev);
	return ev;
}

const timelineBindings: AccountShortcuts = {
	timelineHome: 'Alt+Shift+KeyH',
	timelineLocal: 'Alt+Shift+KeyL',
	timelineSocial: 'Alt+Shift+KeyS',
};

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe('parseAccountShortcut', () => {
	test('exposes only the supported account actions', () => {
		expect(accountShortcutActions).toEqual(['timelineHome', 'timelineLocal', 'timelineSocial', 'postVisibility']);
	});

	test('parses physical letter keys and exact modifiers', () => {
		expect(parseAccountShortcut('Alt+Shift+KeyH')).toEqual({
			code: 'KeyH', ctrl: false, alt: true, shift: true, meta: false,
		});
		expect(parseAccountShortcut('Alt+Shift+Meta+KeyH')).toEqual({
			code: 'KeyH', ctrl: false, alt: true, shift: true, meta: true,
		});
		expect(parseAccountShortcut('Ctrl+Shift+KeyB')).toEqual({
			code: 'KeyB', ctrl: true, alt: false, shift: true, meta: false,
		});
	});

	test('parses physical digit keys', () => {
		expect(parseAccountShortcut('Alt+Shift+Digit1')).toEqual({
			code: 'Digit1', ctrl: false, alt: true, shift: true, meta: false,
		});
	});

	test.each([
		undefined, null, false, true, 0, 42, [], {}, ['Alt+Shift+KeyH'],
	])('rejects a non-string binding: %j', (value) => {
		expect(parseAccountShortcut(value)).toBeNull();
	});

	test.each([
		'', ' ', 'KeyH', 'Shift+KeyH', 'Ctrl', 'Alt+Shift', 'Alt+Shift+ShiftLeft',
		'Alt+Shift+h', 'Alt+Shift+Keyh', 'Alt+Shift+KeyAA', 'Alt+Shift+Digit10',
		'Alt+Shift+Numpad1', 'Alt+Shift+Enter', 'Alt+Shift+Escape', 'Alt+Shift+F1',
		'Alt+Shift+ArrowLeft', 'Alt+Shift+Space', 'Alt+Shift+Unidentified',
		'Alt++KeyH', 'Alt+Alt+KeyH', 'Alt+Shift+KeyH+KeyL', 'Hyper+KeyH',
		'alt+shift+KeyH', ' Alt+Shift+KeyH', 'Alt+Shift+KeyH ', 'Shift+Alt+KeyH',
	])('rejects an invalid or unmodified binding: %s', (value) => {
		expect(parseAccountShortcut(value)).toBeNull();
	});

	test.each(['Ctrl+Alt+KeyH', 'Ctrl+Meta+KeyH', 'Ctrl+Alt+Shift+Meta+KeyH'])('rejects unsafe combined control modifiers: %s', (value) => {
		expect(parseAccountShortcut(value)).toBeNull();
	});

	test.each(['Ctrl', 'Meta', 'Ctrl+Shift', 'Shift+Meta'])('reserves browser and editing shortcuts with %s', (modifier) => {
		for (const code of ['Digit0', 'Digit1', 'Digit9', ...'ACDFHLNOPQRSTVWXYZ'.split('').map(letter => `Key${letter}`)]) {
			expect(parseAccountShortcut(`${modifier}+${code}`), `${modifier}+${code}`).toBeNull();
		}
	});
});

describe('shortcutFromEvent', () => {
	test('records modifiers in canonical order', () => {
		expect(shortcutFromEvent(keydown({ metaKey: true }))).toBe('Alt+Shift+Meta+KeyH');
		expect(shortcutFromEvent(keydown({ code: 'KeyB', ctrlKey: true, altKey: false }))).toBe('Ctrl+Shift+KeyB');
	});

	test('uses the physical key rather than the keyboard-layout-dependent character', () => {
		expect(shortcutFromEvent(keydown({ key: 'ß' }))).toBe('Alt+Shift+KeyH');
		expect(shortcutFromEvent(keydown({ key: '!', code: 'Digit1' }))).toBe('Alt+Shift+Digit1');
	});

	test.each([
		{ altKey: false, shiftKey: false },
		{ altKey: false },
		{ code: 'ShiftLeft', key: 'Shift' },
		{ code: 'AltLeft', key: 'Alt' },
		{ code: 'ControlLeft', key: 'Control', ctrlKey: true },
		{ code: 'MetaLeft', key: 'Meta', metaKey: true },
		{ code: '', key: 'h' },
		{ code: 'Enter', key: 'Enter' },
		{ key: 'Dead' },
		{ key: 'Process' },
		{ key: 'Unidentified' },
		{ isComposing: true },
		{ repeat: true },
	])('does not record unsafe or incomplete key events: %j', (init) => {
		expect(shortcutFromEvent(keydown(init))).toBeNull();
	});

	test('does not record legacy IME keyCode 229 events', () => {
		const ev = keydown();
		Object.defineProperty(ev, 'keyCode', { value: 229 });
		expect(shortcutFromEvent(ev)).toBeNull();
	});

	test('does not turn AltGraph text input into a Ctrl+Alt shortcut', () => {
		const ev = keydown({ ctrlKey: true });
		vi.spyOn(ev, 'getModifierState').mockImplementation(modifier => modifier === 'AltGraph');
		expect(shortcutFromEvent(ev)).toBeNull();
	});
});

describe('findAccountShortcutConflict', () => {
	test('finds a shortcut already assigned to another action', () => {
		expect(findAccountShortcutConflict(timelineBindings, 'postVisibility', 'Alt+Shift+KeyH')).toBe('timelineHome');
	});

	test('allows keeping the current action binding', () => {
		expect(findAccountShortcutConflict(timelineBindings, 'timelineHome', 'Alt+Shift+KeyH')).toBeNull();
	});

	test('allows an unused key and distinguishes modifier combinations', () => {
		expect(findAccountShortcutConflict(timelineBindings, 'postVisibility', 'Alt+Shift+KeyV')).toBeNull();
		expect(findAccountShortcutConflict(timelineBindings, 'postVisibility', 'Alt+Shift+Meta+KeyH')).toBeNull();
	});

	test('ignores malformed stored bindings', () => {
		const bindings = { timelineHome: null, timelineLocal: 42, timelineSocial: 'invalid' } as unknown as AccountShortcuts;
		expect(findAccountShortcutConflict(bindings, 'postVisibility', 'Alt+Shift+KeyV')).toBeNull();
	});
});

describe('matchAccountShortcut', () => {
	test.each([
		['KeyH', 'timelineHome'], ['KeyL', 'timelineLocal'], ['KeyS', 'timelineSocial'],
	] as const)('matches %s to %s', (code, action) => {
		expect(matchAccountShortcut(keydown({ code }), timelineBindings, accountShortcutActions)).toBe(action);
	});

	test('leaves every action unassigned when bindings are empty', () => {
		expect(matchAccountShortcut(keydown(), {}, accountShortcutActions)).toBeNull();
	});

	test('matches only actions enabled in the current context', () => {
		expect(matchAccountShortcut(keydown(), timelineBindings, ['postVisibility'])).toBeNull();
		expect(matchAccountShortcut(keydown(), timelineBindings, [])).toBeNull();
	});

	test.each([
		{ ctrlKey: true }, { metaKey: true }, { altKey: false }, { shiftKey: false },
	])('requires the exact modifier combination: %j', (init) => {
		expect(matchAccountShortcut(keydown(init), timelineBindings, accountShortcutActions)).toBeNull();
	});

	test('ignores an event already handled elsewhere', () => {
		const ev = keydown();
		ev.preventDefault();
		expect(matchAccountShortcut(ev, timelineBindings, accountShortcutActions)).toBeNull();
	});

	test.each([{ repeat: true }, { isComposing: true }])('does not trigger on repeated or composing input: %j', (init) => {
		expect(matchAccountShortcut(keydown(init), timelineBindings, accountShortcutActions)).toBeNull();
	});

	test.each(['Dead', 'Process', 'Unidentified'])('does not trigger on %s text input', (key) => {
		expect(matchAccountShortcut(keydown({ key }), timelineBindings, accountShortcutActions)).toBeNull();
	});

	test('does not trigger on legacy IME events', () => {
		const ev = keydown();
		Object.defineProperty(ev, 'keyCode', { value: 229 });
		expect(matchAccountShortcut(ev, timelineBindings, accountShortcutActions)).toBeNull();
	});

	test('does not trigger on AltGraph input', () => {
		const ev = keydown({ ctrlKey: true });
		vi.spyOn(ev, 'getModifierState').mockImplementation(modifier => modifier === 'AltGraph');
		expect(matchAccountShortcut(ev, { timelineHome: 'Ctrl+Alt+Shift+KeyH' }, accountShortcutActions)).toBeNull();
	});

	test.each(['input', 'textarea', 'select'])('does not navigate from a %s', (tag) => {
		const element = document.createElement(tag);
		document.body.append(element);
		expect(matchAccountShortcut(eventAt(element), timelineBindings, accountShortcutActions)).toBeNull();
	});

	test.each(['true', '', 'plaintext-only'])('does not navigate from a descendant of contenteditable="%s"', (contenteditable) => {
		const editor = document.createElement('div');
		editor.setAttribute('contenteditable', contenteditable);
		const nested = document.createElement('span');
		editor.append(nested);
		document.body.append(editor);
		expect(matchAccountShortcut(eventAt(nested), timelineBindings, accountShortcutActions)).toBeNull();
	});

	test('does not navigate from a custom textbox descendant', () => {
		const editor = document.createElement('div');
		editor.setAttribute('role', 'textbox');
		const nested = document.createElement('span');
		editor.append(nested);
		document.body.append(editor);
		expect(matchAccountShortcut(eventAt(nested), timelineBindings, accountShortcutActions)).toBeNull();
	});

	test('checks the focused editor even if the event target is not the input', () => {
		const editor = document.createElement('textarea');
		document.body.append(editor);
		editor.focus();
		expect(document.activeElement).toBe(editor);
		expect(matchAccountShortcut(eventAt(document.body), timelineBindings, accountShortcutActions)).toBeNull();
	});

	test('allows a post-form action to opt into editable targets', () => {
		const editor = document.createElement('textarea');
		document.body.append(editor);
		editor.focus();
		expect(matchAccountShortcut(eventAt(editor), { postVisibility: 'Alt+Shift+KeyH' }, ['postVisibility'], true)).toBe('postVisibility');
	});

	test('still ignores composition and handled events when editable targets are allowed', () => {
		const editor = document.createElement('textarea');
		document.body.append(editor);
		const bindings: AccountShortcuts = { postVisibility: 'Alt+Shift+KeyH' };
		expect(matchAccountShortcut(eventAt(editor, { isComposing: true }), bindings, ['postVisibility'], true)).toBeNull();
		const ev = eventAt(editor);
		ev.preventDefault();
		expect(matchAccountShortcut(ev, bindings, ['postVisibility'], true)).toBeNull();
	});

	test('allows navigation from a noneditable element', () => {
		const element = document.createElement('div');
		element.setAttribute('contenteditable', 'false');
		document.body.append(element);
		expect(matchAccountShortcut(eventAt(element), timelineBindings, accountShortcutActions)).toBe('timelineHome');
	});

	test('fails closed when two actions share a shortcut', () => {
		const bindings: AccountShortcuts = { timelineHome: 'Alt+Shift+KeyH', timelineLocal: 'Alt+Shift+KeyH' };
		expect(matchAccountShortcut(keydown(), bindings, accountShortcutActions)).toBeNull();
	});

	test('fails closed even when a duplicate belongs to another action context', () => {
		const bindings: AccountShortcuts = { timelineHome: 'Alt+Shift+KeyH', postVisibility: 'Alt+Shift+KeyH' };
		expect(matchAccountShortcut(keydown(), bindings, ['timelineHome'])).toBeNull();
	});

	test.each([null, undefined, false, 42, 'Alt+Shift+KeyH'])('ignores an invalid imported binding record: %j', (value) => {
		expect(matchAccountShortcut(keydown(), value as unknown as AccountShortcuts, accountShortcutActions)).toBeNull();
	});

	test('ignores invalid stored values without hiding valid bindings', () => {
		const bindings = { timelineHome: 'Alt+Shift+KeyH', timelineLocal: null, timelineSocial: ['Alt+Shift+KeyH'] } as unknown as AccountShortcuts;
		expect(matchAccountShortcut(keydown(), bindings, accountShortcutActions)).toBe('timelineHome');
	});

	test('reads changed and cleared bindings on the next event', () => {
		const bindings: AccountShortcuts = { timelineHome: 'Alt+Shift+KeyH' };
		expect(matchAccountShortcut(keydown(), bindings, accountShortcutActions)).toBe('timelineHome');
		bindings.timelineHome = 'Alt+Shift+KeyL';
		expect(matchAccountShortcut(keydown(), bindings, accountShortcutActions)).toBeNull();
		expect(matchAccountShortcut(keydown({ code: 'KeyL' }), bindings, accountShortcutActions)).toBe('timelineHome');
		delete bindings.timelineHome;
		expect(matchAccountShortcut(keydown({ code: 'KeyL' }), bindings, accountShortcutActions)).toBeNull();
	});

	test('keeps different account binding records independent', () => {
		const firstAccount: AccountShortcuts = { timelineHome: 'Alt+Shift+KeyH' };
		const secondAccount: AccountShortcuts = { timelineLocal: 'Alt+Shift+KeyH' };
		expect(matchAccountShortcut(keydown(), firstAccount, accountShortcutActions)).toBe('timelineHome');
		expect(matchAccountShortcut(keydown(), secondAccount, accountShortcutActions)).toBe('timelineLocal');
		expect(matchAccountShortcut(keydown(), {}, accountShortcutActions)).toBeNull();
	});
});

describe('formatAccountShortcut', () => {
	test('uses readable letter and digit labels', () => {
		expect(formatAccountShortcut('Alt+Shift+KeyH')).toBe('Alt+Shift+H');
		expect(formatAccountShortcut('Alt+Shift+Digit1')).toBe('Alt+Shift+1');
	});
});
