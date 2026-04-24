/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, onUnmounted } from 'vue';

const LONG_HOVER_DELAY = 1000;

export function useLongHover() {
	const isLongHovering = ref(false);
	let timeoutId: number | null = null;
	let activeEl: HTMLElement | null = null;

	const clear = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
		if (activeEl) {
			activeEl.classList.remove('long-hover');
			activeEl = null;
		}
		isLongHovering.value = false;
	};

	const onPointerEnter = (ev: PointerEvent) => {
		if (ev.pointerType === 'touch') return;

		const el = ev.currentTarget as HTMLElement;
		activeEl = el;

		timeoutId = window.setTimeout(() => {
			if (activeEl === el) {
				el.classList.add('long-hover');
				isLongHovering.value = true;
			}
		}, LONG_HOVER_DELAY);
	};

	const onPointerLeave = () => {
		clear();
	};

	onUnmounted(() => {
		clear();
	});

	return {
		isLongHovering,
		clear,
		onPointerEnter,
		onPointerLeave,
	};
}
