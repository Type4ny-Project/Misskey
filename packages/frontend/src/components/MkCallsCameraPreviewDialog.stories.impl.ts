/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onUnmounted } from 'vue';
import MkCallsCameraPreviewDialog from './MkCallsCameraPreviewDialog.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	render() {
		return {
			components: { MkCallsCameraPreviewDialog },
			setup() {
				const canvas = window.document.createElement('canvas');
				canvas.width = 640;
				canvas.height = 360;
				const context = canvas.getContext('2d')!;
				context.fillStyle = window.getComputedStyle(window.document.documentElement).getPropertyValue('--MI_THEME-accent');
				context.fillRect(0, 0, canvas.width, canvas.height);
				const stream = canvas.captureStream();
				onUnmounted(() => stream.getTracks().forEach(track => track.stop()));
				return { stream };
			},
			template: '<MkCallsCameraPreviewDialog :stream="stream" />',
		};
	},
	parameters: { layout: 'fullscreen' },
} satisfies StoryObj<typeof MkCallsCameraPreviewDialog>;
