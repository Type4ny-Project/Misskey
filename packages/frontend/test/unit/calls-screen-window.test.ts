/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkCallsScreenWindow from '@/components/MkCallsScreenWindow.vue';
import { callsScreenWindows, clearCallsScreenWindow, clearCallsScreenWindows, showCallsScreenWindow } from '@/utility/calls-screen-window.js';

const fixture = vi.hoisted(() => ({ popup: vi.fn() }));
vi.mock('@/os.js', () => ({ popup: fixture.popup, alert: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { somethingHappened: 'Error' } } }));
vi.mock('@/components/MkWindow.vue', () => ({ default: { template: '<section><header><slot name="header"/></header><slot/></section>' } }));

beforeEach(() => {
	fixture.popup.mockReset().mockImplementation(() => ({ dispose: vi.fn() }));
});
afterEach(() => {
	cleanup();
	clearCallsScreenWindows();
	vi.restoreAllMocks();
});

test('opens different streams independently and toggles only the selected window', async () => {
	const first = new MediaStream();
	const second = new MediaStream();
	await Promise.all([showCallsScreenWindow(first, 'First'), showCallsScreenWindow(second, 'Second')]);

	expect(fixture.popup).toHaveBeenCalledTimes(2);
	expect(fixture.popup.mock.calls.map(([, props]) => props)).toEqual([{ stream: first, label: 'First' }, { stream: second, label: 'Second' }]);
	const [firstWindow, secondWindow] = fixture.popup.mock.results.map(result => result.value);
	await showCallsScreenWindow(first, 'First');
	expect(callsScreenWindows.has(first)).toBe(false);
	expect(callsScreenWindows.has(second)).toBe(true);
	expect(firstWindow.dispose).toHaveBeenCalledOnce();
	expect(secondWindow.dispose).not.toHaveBeenCalled();
	await showCallsScreenWindow(first, 'First');
	expect(fixture.popup).toHaveBeenCalledTimes(3);
	expect(callsScreenWindows.size).toBe(2);
});

test('closing a window leaves other windows open and clearing closes the rest', async () => {
	const first = new MediaStream();
	const second = new MediaStream();
	await showCallsScreenWindow(first, 'First');
	await showCallsScreenWindow(second, 'Second');
	fixture.popup.mock.calls[0][2].closed();
	expect(callsScreenWindows.has(first)).toBe(false);
	expect(callsScreenWindows.has(second)).toBe(true);
	clearCallsScreenWindows();
	expect(callsScreenWindows.size).toBe(0);
	for (const result of fixture.popup.mock.results) expect(result.value.dispose).toHaveBeenCalledOnce();
});

test('does not open a window cleared while its component is loading', async () => {
	const stream = new MediaStream();
	const opening = showCallsScreenWindow(stream, 'First');
	clearCallsScreenWindow(stream);
	await opening;
	expect(fixture.popup).not.toHaveBeenCalled();
	expect(callsScreenWindows.size).toBe(0);
});

test('each window displays its own stream and label without stopping the other stream', async () => {
	const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
	const first = new MediaStream();
	const second = new MediaStream();
	const firstWindow = render(MkCallsScreenWindow, { props: { stream: first, label: 'First' } });
	const secondWindow = render(MkCallsScreenWindow, { props: { stream: second, label: 'Second' } });
	await nextTick();
	const firstVideo = firstWindow.container.querySelector('video')!;
	const secondVideo = secondWindow.container.querySelector('video')!;

	expect(firstVideo.srcObject).toBe(first);
	expect(secondVideo.srcObject).toBe(second);
	expect(firstVideo.getAttribute('aria-label')).toBe('First');
	expect(secondVideo.getAttribute('aria-label')).toBe('Second');
	expect(firstWindow.container.querySelector('header')?.textContent).toContain('First');
	expect(secondWindow.container.querySelector('header')?.textContent).toContain('Second');
	expect(play).toHaveBeenCalledTimes(2);
	firstWindow.unmount();
	expect(secondVideo.srcObject).toBe(second);
});
