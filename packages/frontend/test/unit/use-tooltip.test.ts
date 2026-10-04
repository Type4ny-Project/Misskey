/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, nextTick, ref } from 'vue';
import { useTooltip } from '@/composables/use-tooltip.js';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

test('reconnects a tooltip when its button returns after compact display', async () => {
	vi.useFakeTimers();
	const onShow = vi.fn();
	const component = defineComponent({
		props: { compact: Boolean },
		setup() {
			const button = ref<HTMLElement | null>(null);
			useTooltip(button, onShow);
			return { button };
		},
		template: '<button v-if="!compact" ref="button">Renote</button>',
	});
	const result = render(component, { props: { compact: false } });
	await nextTick();
	const originalButton = result.getByRole('button');
	await fireEvent.mouseOver(originalButton);
	await vi.advanceTimersByTimeAsync(300);
	expect(onShow).toHaveBeenCalledTimes(1);
	await fireEvent.mouseLeave(originalButton);

	await result.rerender({ compact: true });
	await result.rerender({ compact: false });
	await fireEvent.mouseOver(result.getByRole('button'));
	await vi.advanceTimersByTimeAsync(300);
	expect(onShow).toHaveBeenCalledTimes(2);
});
