/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import MkCallsActivities from './MkCallsActivities.vue';
import type { StoryObj } from '@storybook/vue3';
import type * as Misskey from 'misskey-js';

const room = {
	id: 'calls-activities-story', attachment: { type: 'personal', ownerUserId: 'host' },
	title: 'アクティビティのあるコール', description: '', mode: 'open', visibility: 'public',
	moderatorUserIds: [], state: 'open', scheduledAt: null, startedAt: '2026-10-06T00:00:00.000Z', endedAt: null,
	revision: 1, createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z',
} satisfies Misskey.entities.CallsRoom;

export const Default = {
	render(args) { return { components: { MkCallsActivities }, setup: () => ({ args }), template: '<MkCallsActivities v-bind="args" style="width: min(600px, 100%); box-sizing: border-box;" />' }; },
	args: { room },
} satisfies StoryObj<typeof MkCallsActivities>;
