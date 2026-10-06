/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import MkCallsConnectionChart from './MkCallsConnectionChart.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	render(args) { return { components: { MkCallsConnectionChart }, setup: () => ({ args }), template: '<div style="width: min(520px, 100vw)"><MkCallsConnectionChart v-bind="args"/></div>' }; },
	args: {
		samples: Array.from({ length: 30 }, (_, index) => ({ at: 1791291600000 + index * 2000, info: { state: 'connected' as const, turnServers: [], relay: false, protocol: 'udp', roundTripTime: (21 + Math.sin(index) * 5) / 1000, sendLoss: 0.1 + index / 100, receiveLoss: index / 200 } })),
	},
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkCallsConnectionChart>;

export const Gaps = { ...Default, args: { samples: Default.args.samples.map((sample, index) => ({ ...sample, info: index >= 10 && index <= 15 ? null : sample.info })) } } satisfies StoryObj<typeof MkCallsConnectionChart>;
