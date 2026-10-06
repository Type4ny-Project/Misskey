/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test } from 'vitest';
import { focusTrap } from '@/utility/focus-trap.js';

const releases: (() => void)[] = [];

afterEach(() => {
	for (const release of releases.reverse()) release();
	releases.length = 0;
	document.body.replaceChildren();
});

function createElement(zIndex = 0): HTMLElement {
	const element = document.createElement('div');
	element.style.zIndex = String(zIndex);
	document.body.append(element);
	return element;
}

function trap(element: HTMLElement): () => void {
	const { release } = focusTrap(element);
	releases.push(release);
	return release;
}

test('keeps a front window interactive when the calls drawer opens', () => {
	const background = createElement();
	const pageWindow = createElement(1000000);
	const frontWindow = createElement(2000000);
	const drawer = createElement(1000100);
	const popupContainer = createElement();
	popupContainer.append(pageWindow, frontWindow, drawer);
	const release = trap(drawer);

	expect(frontWindow.inert).toBe(false);
	expect(drawer.inert).toBe(false);
	expect(pageWindow.inert).toBe(true);
	expect(background.inert).toBe(true);

	release();
	expect(pageWindow.inert).toBe(false);
	expect(background.inert).toBe(false);
});

test('restores the front window after closing a menu above the calls drawer', () => {
	const background = createElement();
	const frontWindow = createElement(2000000);
	const drawer = createElement(1000100);
	trap(drawer);
	const menu = createElement(3000000);
	const releaseMenu = trap(menu);

	expect(frontWindow.inert).toBe(true);
	expect(drawer.inert).toBe(true);
	expect(menu.inert).toBe(false);

	releaseMenu();
	menu.remove();
	expect(frontWindow.inert).toBe(false);
	expect(drawer.inert).toBe(false);
	expect(background.inert).toBe(true);
});

test('keeps the highest modal active when a lower drawer opens', () => {
	const background = createElement();
	const frontWindow = createElement(2000000);
	const modal = createElement(3000000);
	const releaseModal = trap(modal);
	const drawer = createElement(1000100);
	trap(drawer);

	expect(modal.inert).toBe(false);
	expect(frontWindow.inert).toBe(true);
	expect(drawer.inert).toBe(true);

	releaseModal();
	modal.remove();
	expect(frontWindow.inert).toBe(false);
	expect(drawer.inert).toBe(false);
	expect(background.inert).toBe(true);
});
