/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import MkCallsMicrophoneTest from './MkCallsMicrophoneTest.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	render: args => ({ components: { MkCallsMicrophoneTest }, setup: () => ({ args }), template: '<MkCallsMicrophoneTest v-bind="args"/>' }),
	args: { getSettings: () => ({ autoGainControl: true, noiseSuppression: 'rnnoise', inputSensitivity: -100, inputLevel: -32, transmitting: true, busy: false, microphones: [], cameras: [], outputDevices: [], microphoneId: '', cameraId: '', outputDeviceId: '', inputVolume: 100, outputVolume: 100, supportsOutputDevice: false }) },
} satisfies StoryObj<typeof MkCallsMicrophoneTest>;
