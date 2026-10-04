/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { action } from 'storybook/actions';
import { ref } from 'vue';
import { http, HttpResponse } from 'msw';
import type * as Misskey from 'misskey-js';
import MkAnnouncementReactions from './MkAnnouncementReactions.vue';

export const Default = {
	render(args) {
		return {
			components: { MkAnnouncementReactions },
			setup() {
				const announcement = ref({ ...args.announcement });
				return { args, announcement, onUpdate: (state: Pick<Misskey.entities.Announcement, 'reactions' | 'myReaction' | 'isRead'>) => {
					Object.assign(announcement.value, state);
					action('update')(state);
				} };
			},
			template: '<MkAnnouncementReactions v-bind="args" :announcement="announcement" @update="onUpdate" />',
		};
	},
	args: {
		announcement: {
			id: 'announcement',
			title: 'Title',
			needConfirmationToRead: false,
			reactionsEnabled: true,
			reactions: { '👍': 12, '🎉': 3 },
			myReaction: '👍',
		},
	},
} satisfies StoryObj<typeof MkAnnouncementReactions>;

export const Empty = {
	...Default,
	args: { ...Default.args, announcement: { ...Default.args.announcement, reactions: {}, myReaction: null } },
} satisfies StoryObj<typeof MkAnnouncementReactions>;

export const Disabled = {
	...Default,
	args: { ...Default.args, announcement: { ...Default.args.announcement, reactionsEnabled: false } },
} satisfies StoryObj<typeof MkAnnouncementReactions>;

export const Interactive = {
	...Default,
	args: { ...Default.args, interactive: true, announcement: { ...Default.args.announcement, reactions: { '👍': 1 } } },
	parameters: {
		msw: { handlers: [http.post('/api/announcements/react', async ({ request }) => {
			const { reaction } = await request.json() as Misskey.entities.AnnouncementsReactRequest;
			return HttpResponse.json({ reactions: reaction == null ? {} : { [reaction]: 1 }, myReaction: reaction, isRead: true });
		})] },
	},
} satisfies StoryObj<typeof MkAnnouncementReactions>;

export const ConfirmationRequired = {
	...Interactive,
	args: { ...Interactive.args, announcement: { ...Interactive.args.announcement, myReaction: null, isRead: false, needConfirmationToRead: true } },
} satisfies StoryObj<typeof MkAnnouncementReactions>;
