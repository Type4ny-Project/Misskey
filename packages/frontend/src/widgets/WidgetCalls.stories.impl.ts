/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { http, HttpResponse } from 'msw';
import { userLite } from '../../.storybook/fakes.js';
import { Default as RoomCard } from '../components/MkCallsRoomCard.stories.impl.js';
import WidgetCalls from './WidgetCalls.vue';
import type { StoryObj } from '@storybook/vue3';

const host = { ...userLite(), id: 'widget-host', isFollowing: true, isFollowed: false };
const friend = { ...userLite(), id: 'widget-friend', name: 'フォロー中の友だち', isFollowing: true, isFollowed: false };
const room = RoomCard.args.room;

export const Default = {
	render(args) { return { components: { WidgetCalls }, setup: () => ({ args }), template: '<div style="width: 320px"><WidgetCalls v-bind="args" /></div>' }; },
	args: {},
	parameters: {
		layout: 'centered',
		msw: { handlers: [
			http.post('/api/calls/rooms/list', () => HttpResponse.json([room])),
			http.post('/api/calls/rooms/show', () => HttpResponse.json({ room, participants: [
				{ id: 'widget-host-p', roomId: room.id, userId: host.id, role: 'host', state: 'active', isMuted: true, user: host },
				{ id: 'widget-friend-p', roomId: room.id, userId: friend.id, role: 'listener', state: 'active', isMuted: true, user: friend },
			] })),
		] },
	},
} satisfies StoryObj<typeof WidgetCalls>;

export const Empty = {
	...Default,
	parameters: { layout: 'centered', msw: { handlers: [http.post('/api/calls/rooms/list', () => HttpResponse.json([]))] } },
} satisfies StoryObj<typeof WidgetCalls>;
