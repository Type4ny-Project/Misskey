/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import MkCallsControls from './MkCallsControls.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	render(args) {
		return { components: { MkCallsControls }, setup: () => ({ args }), template: '<MkCallsControls v-bind="args" />' };
	},
	args: {
		state: { role: 'speaker', canSpeak: true, canPublishVideo: true, canShareScreen: true, muted: false, cameraOn: false, screenOn: false, status: 'connected', busy: false, joining: false, screenSupported: true, speakerRequestEnabled: true, speakerRequested: false },
	},
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkCallsControls>;

export const Sharing = { ...Default, args: { state: { ...Default.args.state, cameraOn: true, screenOn: true } } } satisfies StoryObj<typeof MkCallsControls>;
export const Connecting = { ...Default, args: { state: { ...Default.args.state, status: 'negotiating', joining: true } } } satisfies StoryObj<typeof MkCallsControls>;
export const Listener = { ...Default, args: { state: { ...Default.args.state, role: 'listener', canSpeak: false, canPublishVideo: false, canShareScreen: false } } } satisfies StoryObj<typeof MkCallsControls>;
