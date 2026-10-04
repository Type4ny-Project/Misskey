/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { http, HttpResponse } from 'msw';
import { userLite } from '../../.storybook/fakes.js';
import MkAnnouncementReactionUsers from './MkAnnouncementReactionUsers.vue';

export const Default = {
	render(args) {
		return {
			components: { MkAnnouncementReactionUsers },
			setup: () => ({ args }),
			template: '<MkAnnouncementReactionUsers v-bind="args" />',
		};
	},
	args: { announcementId: 'announcement' },
	parameters: {
		msw: { handlers: [http.post('/api/admin/announcements/reactions', () => HttpResponse.json([
			{ id: 'reaction-b', createdAt: '2026-10-04T00:00:00.000Z', reaction: '🎉', user: userLite('bob', 'bob', null, 'Bob') },
			{ id: 'reaction-a', createdAt: '2026-10-04T00:00:00.000Z', reaction: '👍', user: userLite('alice', 'alice', null, 'Alice') },
		]))] },
	},
} satisfies StoryObj<typeof MkAnnouncementReactionUsers>;

export const Empty = {
	...Default,
	parameters: {
		msw: { handlers: [http.post('/api/admin/announcements/reactions', () => HttpResponse.json([]))] },
	},
} satisfies StoryObj<typeof MkAnnouncementReactionUsers>;
