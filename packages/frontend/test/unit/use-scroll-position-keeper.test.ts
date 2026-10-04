/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import { useScrollPositionKeeper } from '@/composables/use-scroll-position-keeper.js';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

test.each([false, true])('restores the reading anchor after settings (compact: %s)', async (compact) => {
	vi.useFakeTimers();
	const active = ref(true);
	const noteHeight = ref(800);
	const timeline = defineComponent({
		setup() {
			const container = ref<HTMLElement | null>(null);
			useScrollPositionKeeper(container);
			return () => h('div', { ref: container, 'data-testid': 'page' }, [
				h('div', { 'data-sticky-container-header-height': '60' }, [
					h('div', { 'data-scroll-anchor': 'note' }),
				]),
			]);
		},
	});
	const result = render(defineComponent({
		setup: () => () => h(KeepAlive, null, { default: () => active.value ? h(timeline) : h('div', 'settings') }),
	}));
	await nextTick();
	await vi.advanceTimersByTimeAsync(100);
	const page = result.getByTestId('page');
	const note = page.querySelector<HTMLElement>('[data-scroll-anchor]')!;
	vi.spyOn(page, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 1280, 600));
	vi.spyOn(note, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 60 + 3 * noteHeight.value - page.scrollTop, 1280, noteHeight.value));
	page.scrollTop = 2700;
	page.dispatchEvent(new Event('pointerdown'));

	active.value = false;
	await nextTick();
	if (compact) noteHeight.value = 32;
	active.value = true;
	await nextTick();
	await vi.advanceTimersByTimeAsync(100);

	expect(note.getBoundingClientRect().top).toBe(compact ? 60 : -240);
});
