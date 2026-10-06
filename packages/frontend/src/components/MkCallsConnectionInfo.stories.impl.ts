/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import MkCallsConnectionInfo from './MkCallsConnectionInfo.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	render(args) {
		return { components: { MkCallsConnectionInfo }, setup: () => ({ args }), template: '<MkCallsConnectionInfo v-bind="args" />' };
	},
	args: {
		getInfo: async () => ({ state: 'connected' as const, turnServers: [{ host: 'turn.cloudflare.com', udp: ['3478', '443'], tcp: ['3478', '80'], tls: ['5349', '443'] }], relay: false, protocol: 'udp', roundTripTime: 0.021, sendLoss: 0.1, receiveLoss: 0 }),
	},
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkCallsConnectionInfo>;

export const Unavailable = { ...Default, args: { getInfo: async () => null } } satisfies StoryObj<typeof MkCallsConnectionInfo>;
