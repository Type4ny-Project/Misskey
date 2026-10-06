/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref } from 'vue';
import MkCallsSettings from './MkCallsSettings.vue';
import type { StoryObj } from '@storybook/vue3';
import type { CallsNoiseSuppressionMode } from '@/utility/calls-noise-suppression.js';

export const Default = {
	render() {
		const mode = ref<CallsNoiseSuppressionMode>('rnnoise');
		const threshold = ref(-45);
		const settings = computed(() => ({ noiseSuppression: mode.value, inputSensitivity: threshold.value, inputLevel: -32, transmitting: true, busy: false }));
		return {
			components: { MkCallsSettings },
			setup: () => ({ getInfo: async () => null, getSettings: () => settings.value, async setNoiseSuppression(value: CallsNoiseSuppressionMode) { mode.value = value; }, setInputSensitivity(value: number) { threshold.value = value; } }),
			template: '<MkCallsSettings :getInfo="getInfo" :getSettings="getSettings" :setNoiseSuppression="setNoiseSuppression" :setInputSensitivity="setInputSensitivity"/>',
		};
	},
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkCallsSettings>;
