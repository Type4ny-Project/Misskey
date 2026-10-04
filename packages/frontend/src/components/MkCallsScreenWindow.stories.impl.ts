/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onMounted, onUnmounted } from 'vue';
import MkCallsScreenWindow from './MkCallsScreenWindow.vue';
import { callsScreenWindowLabel, callsScreenWindowStream } from '@/utility/calls-screen-window.js';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	render() {
		return {
			components: { MkCallsScreenWindow },
			setup() {
				onMounted(() => {
					const canvas = window.document.createElement('canvas');
					canvas.width = 640;
					canvas.height = 360;
					callsScreenWindowLabel.value = 'owner';
					callsScreenWindowStream.value = canvas.captureStream();
				});
				onUnmounted(() => {
					callsScreenWindowStream.value?.getTracks().forEach(track => track.stop());
					callsScreenWindowStream.value = null;
					callsScreenWindowLabel.value = '';
				});
			},
			template: '<MkCallsScreenWindow />',
		};
	},
	parameters: { layout: 'fullscreen' },
} satisfies StoryObj<typeof MkCallsScreenWindow>;
