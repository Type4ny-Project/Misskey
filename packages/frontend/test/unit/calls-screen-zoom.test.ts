/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { nextTick } from 'vue';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import MkCallsVideo from '@/components/MkCallsVideo.vue';

beforeEach(() => {
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

async function setup(screen = true) {
	const select = vi.fn();
	const view = render(MkCallsVideo, { props: { stream: new window.MediaStream(), label: 'Screen', screen, onSelect: select } });
	const viewport = view.container.querySelector('figure')!;
	const video = view.container.querySelector('video')!;
	Object.defineProperties(viewport, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
	Object.defineProperties(video, { videoWidth: { value: 1600 }, videoHeight: { value: 900 } });
	vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect);
	await nextTick();
	return { ...view, viewport, video, select };
}

function wheel(element: HTMLElement, deltaY: number, clientX = 400, clientY = 300) {
	// happy-dom's WheelEvent omits the MouseEvent coordinates.
	const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
	Object.assign(event, { clientX, clientY });
	return fireEvent(element, event);
}

test('zooms at the pointer and pans by dragging without selecting the video', async () => {
	const view = await setup();
	await wheel(view.viewport, -Math.log(2) / 0.002, 600, 300);
	expect(view.getByRole('slider').getAttribute('value')).toBe('200');
	expect(view.video.style.transform).toBe('translate(-200px, 0px) scale(2)');
	const pan = view.viewport.querySelector('div')!;
	const capture = vi.fn();
	pan.setPointerCapture = capture;
	await fireEvent.pointerDown(pan, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
	await fireEvent.pointerMove(pan, { pointerId: 1, clientX: 500, clientY: 350 });
	expect(capture).toHaveBeenCalledWith(1);
	expect(view.video.style.transform).toBe('translate(-100px, 50px) scale(2)');
	await fireEvent.pointerUp(pan, { pointerId: 1 });
	await fireEvent.pointerMove(pan, { pointerId: 1, clientX: 700, clientY: 500 });
	expect(view.video.style.transform).toBe('translate(-100px, 50px) scale(2)');
	await fireEvent.click(pan);
	expect(view.select).not.toHaveBeenCalled();
});

test('slider controls the zoom, limits panning to the image and resets at 100%', async () => {
	const view = await setup();
	await fireEvent.input(view.getByRole('slider'), { target: { value: '200' } });
	expect(view.getByText('200%')).toBeTruthy();
	const pan = view.viewport.querySelector('div')!;
	pan.setPointerCapture = vi.fn();
	await fireEvent.pointerDown(pan, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
	await fireEvent.pointerMove(pan, { pointerId: 1, clientX: 2000, clientY: -2000 });
	expect(view.video.style.transform).toBe('translate(400px, -150px) scale(2)');
	await fireEvent.input(view.getByRole('slider'), { target: { value: '100' } });
	expect(view.video.style.transform).toBe('translate(0px, 0px) scale(1)');
	expect(view.viewport.querySelector('div')).toBeNull();
	await wheel(view.viewport, -10000);
	expect(view.getByText('400%')).toBeTruthy();
	await view.rerender({ stream: new window.MediaStream() });
	expect(view.getByText('100%')).toBeTruthy();
});

test('preserves camera scrolling and video selection', async () => {
	const view = await setup(false);
	const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
	await fireEvent(view.viewport, event);
	expect(event.defaultPrevented).toBe(false);
	expect(view.queryByRole('slider')).toBeNull();
	expect(view.video.style.transform).toBe('');
	await fireEvent.click(view.getByRole('button'));
	expect(view.select).toHaveBeenCalledOnce();
});
