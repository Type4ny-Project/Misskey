/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref } from 'vue';
import MkCallsGeneralSettings from './MkCallsGeneralSettings.vue';
import type { StoryObj } from '@storybook/vue3';
import type { CallsNoiseSuppressionMode } from '@/utility/calls-noise-suppression.js';

export const Default = {
	render() {
		const mode = ref<CallsNoiseSuppressionMode>('rnnoise');
		const threshold = ref(-45);
		const autoGainControl = ref(true);
		const settings = computed(() => ({ autoGainControl: autoGainControl.value, noiseSuppression: mode.value, inputSensitivity: threshold.value, inputLevel: -32, transmitting: true, busy: false, microphones: [], cameras: [], outputDevices: [], microphoneId: '', cameraId: '', outputDeviceId: '', inputVolume: 100, outputVolume: 100, supportsOutputDevice: true }));
		return {
			components: { MkCallsGeneralSettings },
			setup: () => ({ setAutoGainControl: async (enabled: boolean) => { autoGainControl.value = enabled; }, setDevice: async () => {}, refreshDevices: async () => {}, setInputVolume: () => {}, setOutputVolume: () => {}, getInfo: async () => null, getSettings: () => settings.value, async setNoiseSuppression(value: CallsNoiseSuppressionMode) { mode.value = value; }, setInputSensitivity(value: number) { threshold.value = value; } }),
			template: '<MkCallsGeneralSettings :setDevice="setDevice" :refreshDevices="refreshDevices" :setInputVolume="setInputVolume" :setOutputVolume="setOutputVolume" :getSettings="getSettings" :setAutoGainControl="setAutoGainControl" :setNoiseSuppression="setNoiseSuppression" :setInputSensitivity="setInputSensitivity"/>',
		};
	},
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkCallsGeneralSettings>;
