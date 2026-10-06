/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import MkCallsActivities from './MkCallsActivities.vue';
import type { StoryObj } from '@storybook/vue3';
import { i18n } from '@/i18n.js';

export const Default = {
	render(args) { return { components: { MkCallsActivities }, setup: () => ({ args }), template: '<MkCallsActivities v-bind="args" style="width: min(600px, 100%); box-sizing: border-box;"><template #default="{ activity }"><p>{{ activity }}</p></template></MkCallsActivities>' }; },
	args: { activities: [{ id: 'sample', title: i18n.ts._calls.activities, description: i18n.ts._calls.title, icon: 'ti ti-device-gamepad-2' }] },
} satisfies StoryObj<typeof MkCallsActivities>;

export const Empty = { ...Default, args: { activities: [] } } satisfies StoryObj<typeof MkCallsActivities>;
