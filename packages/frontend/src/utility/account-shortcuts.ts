/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const accountShortcutActions = ['timelineHome', 'timelineLocal', 'timelineSocial', 'postVisibility'] as const;
export type AccountShortcutAction = typeof accountShortcutActions[number];
export type AccountShortcuts = Partial<Record<AccountShortcutAction, string>>;

type Shortcut = {
	code: string;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	meta: boolean;
};

const modifiers = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;

function serializeShortcut(shortcut: Shortcut): string {
	return [
		...(shortcut.ctrl ? ['Ctrl'] : []),
		...(shortcut.alt ? ['Alt'] : []),
		...(shortcut.shift ? ['Shift'] : []),
		...(shortcut.meta ? ['Meta'] : []),
		shortcut.code,
	].join('+');
}

/** Keep ordinary typing, editing, browser navigation and the existing hotkeys intact. */
export function parseAccountShortcut(value: unknown): Shortcut | null {
	if (typeof value !== 'string') return null;
	const parts = value.split('+');
	const code = parts.pop();
	if (code == null || !/^(Key[A-Z]|Digit[0-9])$/.test(code)) return null;
	if (parts.some(part => !modifiers.includes(part as typeof modifiers[number]))) return null;
	if (new Set(parts).size !== parts.length) return null;
	const shortcut = {
		code,
		ctrl: parts.includes('Ctrl'),
		alt: parts.includes('Alt'),
		shift: parts.includes('Shift'),
		meta: parts.includes('Meta'),
	};
	if (!shortcut.ctrl && !shortcut.alt && !shortcut.meta) return null;
	// Ctrl+Alt may produce characters with AltGr even where getModifierState is unavailable.
	if (shortcut.ctrl && shortcut.alt) return null;
	if (shortcut.ctrl && shortcut.meta) return null;
	if ((shortcut.ctrl || shortcut.meta) && !shortcut.alt) {
		if (/^Digit/.test(code) || /^Key[ACDFHLNOPQRSTVWXYZ]$/.test(code)) return null;
	}
	if (serializeShortcut(shortcut) !== value) return null;
	return shortcut;
}

export function shortcutFromEvent(ev: KeyboardEvent): string | null {
	if (ev.isComposing || ev.keyCode === 229 || ev.repeat || ev.getModifierState('AltGraph')) return null;
	if (['Dead', 'Process', 'Unidentified'].includes(ev.key)) return null;
	const value = serializeShortcut({ code: ev.code, ctrl: ev.ctrlKey, alt: ev.altKey, shift: ev.shiftKey, meta: ev.metaKey });
	return parseAccountShortcut(value) == null ? null : value;
}

export function formatAccountShortcut(value: string): string {
	return value.replace(/Key([A-Z])$/, '$1').replace(/Digit([0-9])$/, '$1');
}

export function findAccountShortcutConflict(bindings: AccountShortcuts, action: AccountShortcutAction, shortcut: string): AccountShortcutAction | null {
	return accountShortcutActions.find(other => other !== action && bindings[other] === shortcut) ?? null;
}

function isEditable(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) return false;
	return target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]') != null;
}

/** Reads the current account's bindings at dispatch time; malformed/imported conflicts fail closed. */
export function matchAccountShortcut(ev: KeyboardEvent, bindings: AccountShortcuts, actions: readonly AccountShortcutAction[], allowEditable = false): AccountShortcutAction | null {
	if (ev.defaultPrevented) return null;
	if (!allowEditable && (isEditable(ev.target) || isEditable(window.document.activeElement) || ev.composedPath().some(isEditable))) return null;
	const shortcut = shortcutFromEvent(ev);
	if (shortcut == null || bindings == null || typeof bindings !== 'object') return null;
	const matches = accountShortcutActions.filter(action => bindings[action] === shortcut);
	return matches.length === 1 && actions.includes(matches[0]) ? matches[0] : null;
}
