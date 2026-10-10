/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onMounted, onUnmounted, shallowRef } from 'vue';
import MkCallsVideo from './MkCallsVideo.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	render(args) {
		return {
			components: { MkCallsVideo },
			setup() {
				const stream = shallowRef<MediaStream | null>(null);
				onMounted(() => {
					const canvas = window.document.createElement('canvas');
					canvas.width = 640;
					canvas.height = 360;
					stream.value = canvas.captureStream();
				});
				onUnmounted(() => stream.value?.getTracks().forEach(track => track.stop()));
				return { args, stream };
			},
			template: '<div style="width: min(640px, 100vw)"><MkCallsVideo v-if="stream" v-bind="args" :stream="stream" /></div>',
		};
	},
	args: { label: 'owner' },
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkCallsVideo>;

export const Speaking = { ...Default, args: { ...Default.args, speaking: true } } satisfies StoryObj<typeof MkCallsVideo>;

export const Screen = { ...Default, args: { ...Default.args, screenWindow: true, screen: true } } satisfies StoryObj<typeof MkCallsVideo>;

export const ScreenWithAudio = { ...Screen, args: { ...Screen.args, audioVolume: 75 } } satisfies StoryObj<typeof MkCallsVideo>;
