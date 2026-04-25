/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';

const LONG_HOVER_DELAY = 1000;

export function useLongHover() {
	const activeElement = ref<HTMLElement | null>(null);
	let timeoutId: number | null = null;

	const onPointerEnter = (ev: PointerEvent) => {
		if (ev.pointerType === 'touch') return;

		const el = ev.currentTarget as HTMLElement;

		timeoutId = window.setTimeout(() => {
			activeElement.value = el;
		}, LONG_HOVER_DELAY);
	};

	const onPointerLeave = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
		activeElement.value = null;
	};

	return {
		activeElement,
		onPointerEnter,
		onPointerLeave,
	};
}
