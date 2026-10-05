/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import MkCallsRoomSummary from './MkCallsRoomSummary.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	render(args) {
		return { components: { MkCallsRoomSummary }, setup: () => ({ args }), template: '<div style="width: min(440px, 100vw)"><MkCallsRoomSummary v-bind="args" /></div>' };
	},
	args: { room: { startedAt: '2026-10-02T14:30:00.000Z', endedAt: '2026-10-02T15:42:35.000Z' } },
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkCallsRoomSummary>;

export const ShortCall = { ...Default, args: { room: { startedAt: '2026-10-02T14:30:00.000Z', endedAt: '2026-10-02T14:32:05.000Z' } } } satisfies StoryObj<typeof MkCallsRoomSummary>;
export const OverOneDay = { ...Default, args: { room: { startedAt: '2026-10-02T14:30:00.000Z', endedAt: '2026-10-03T15:32:05.000Z' } } } satisfies StoryObj<typeof MkCallsRoomSummary>;
export const MissingTimestamps = { ...Default, args: { room: { startedAt: null, endedAt: null } } } satisfies StoryObj<typeof MkCallsRoomSummary>;
export const Narrow = {
	...Default,
	render(args) {
		return { components: { MkCallsRoomSummary }, setup: () => ({ args }), template: '<div style="width: 240px"><MkCallsRoomSummary v-bind="args" /></div>' };
	},
} satisfies StoryObj<typeof MkCallsRoomSummary>;
