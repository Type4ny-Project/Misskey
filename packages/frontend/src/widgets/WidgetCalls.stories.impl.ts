/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { http, HttpResponse } from 'msw';
import { userDetailed } from '../../.storybook/fakes.js';
import { Default as RoomCard } from '../components/MkCallsRoomCard.stories.impl.js';
import WidgetCalls from './WidgetCalls.vue';
import type { StoryObj } from '@storybook/vue3';

const host = { ...userDetailed(), id: 'widget-host', isFollowing: true };
const friend = { ...userDetailed(), id: 'widget-friend', name: 'フォロー中の友だち', isFollowing: true };
const room = RoomCard.args.room;

export const Default = {
	render(args) { return { components: { WidgetCalls }, setup: () => ({ args }), template: '<div style="width: 320px"><WidgetCalls v-bind="args" /></div>' }; },
	args: {},
	parameters: {
		layout: 'centered',
		msw: { handlers: [
			http.post('/api/calls/rooms/list', () => HttpResponse.json([room])),
			http.post('/api/calls/rooms/show', () => HttpResponse.json({ room, participants: [
				{ id: 'widget-host-p', roomId: room.id, userId: host.id, role: 'host', state: 'active', isMuted: true },
				{ id: 'widget-friend-p', roomId: room.id, userId: friend.id, role: 'listener', state: 'active', isMuted: true },
			] })),
			http.post('/api/users/show', async ({ request }) => {
				const { userId } = await request.json() as { userId: string };
				return HttpResponse.json(userId === friend.id ? friend : host);
			}),
		] },
	},
} satisfies StoryObj<typeof WidgetCalls>;

export const Empty = {
	...Default,
	parameters: { layout: 'centered', msw: { handlers: [http.post('/api/calls/rooms/list', () => HttpResponse.json([]))] } },
} satisfies StoryObj<typeof WidgetCalls>;
