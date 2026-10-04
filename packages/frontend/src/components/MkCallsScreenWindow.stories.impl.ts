/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onMounted, onUnmounted, shallowRef } from 'vue';
import MkCallsScreenWindow from './MkCallsScreenWindow.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	render() {
		return {
			components: { MkCallsScreenWindow },
			setup() {
				const stream = shallowRef<MediaStream | null>(null);
				onMounted(() => {
					const canvas = window.document.createElement('canvas');
					canvas.width = 640;
					canvas.height = 360;
					stream.value = canvas.captureStream();
				});
				onUnmounted(() => {
					stream.value?.getTracks().forEach(track => track.stop());
					stream.value = null;
				});
				return { stream };
			},
			template: '<MkCallsScreenWindow v-if="stream" :stream="stream" label="owner" />',
		};
	},
	parameters: { layout: 'fullscreen' },
} satisfies StoryObj<typeof MkCallsScreenWindow>;
