/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { shallowReactive } from 'vue';
import * as os from '@/os.js';

export const callsScreenWindows = shallowReactive(new Map<MediaStream, { dispose?: () => void }>());

export function clearCallsScreenWindow(stream: MediaStream): void {
	const screenWindow = callsScreenWindows.get(stream);
	callsScreenWindows.delete(stream);
	screenWindow?.dispose?.();
}

export function clearCallsScreenWindows(): void {
	for (const stream of callsScreenWindows.keys()) clearCallsScreenWindow(stream);
}

export async function showCallsScreenWindow(stream: MediaStream, label: string): Promise<void> {
	if (callsScreenWindows.has(stream)) {
		clearCallsScreenWindow(stream);
		return;
	}

	const screenWindow: { dispose?: () => void } = {};
	callsScreenWindows.set(stream, screenWindow);
	try {
		const { default: ScreenWindow } = await import('@/components/MkCallsScreenWindow.vue');
		if (callsScreenWindows.get(stream) !== screenWindow) return;

		const { dispose } = os.popup(ScreenWindow, { stream, label }, { closed: () => clearCallsScreenWindow(stream) });
		screenWindow.dispose = dispose;
	} catch (error) {
		clearCallsScreenWindow(stream);
		throw error;
	}
}
