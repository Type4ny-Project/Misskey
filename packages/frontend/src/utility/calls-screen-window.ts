/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { shallowRef } from 'vue';
import * as os from '@/os.js';

export const callsScreenWindowStream = shallowRef<MediaStream | null>(null);
export const callsScreenWindowLabel = shallowRef('');
let disposeWindow: (() => void) | null = null;

export function clearCallsScreenWindow(): void {
	callsScreenWindowStream.value = null;
	callsScreenWindowLabel.value = '';
	disposeWindow?.();
	disposeWindow = null;
}

export async function showCallsScreenWindow(stream: MediaStream, label: string): Promise<void> {
	if (callsScreenWindowStream.value === stream) {
		clearCallsScreenWindow();
		return;
	}
	callsScreenWindowStream.value = stream;
	callsScreenWindowLabel.value = label;
	if (disposeWindow != null) return;

	const { default: ScreenWindow } = await import('@/components/MkCallsScreenWindow.vue');
	if (callsScreenWindowStream.value == null || disposeWindow != null) return;

	const { dispose } = os.popup(ScreenWindow, {}, { closed: clearCallsScreenWindow });
	disposeWindow = dispose;
}
