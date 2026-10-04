/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { http, HttpResponse } from 'msw';
import { userLite } from '../../.storybook/fakes.js';
import MkCallsRoomWindow from './MkCallsRoomWindow.vue';
import type { StoryObj } from '@storybook/vue3';
import type * as Misskey from 'misskey-js';

const host = { ...userLite(), isFollowing: false, isFollowed: false };
const room = {
	id: 'calls-window-story', attachment: { type: 'personal', ownerUserId: host.id },
	channelId: null,
	title: '今日のMisskeyについて話そう', description: '', mode: 'stage', visibility: 'public',
	moderatorUserIds: [], state: 'open', scheduledAt: null, startedAt: '2026-10-02T00:00:00.000Z', endedAt: null,
	revision: 1, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
} satisfies Misskey.entities.CallsRoom;

export const Default = {
	render(args) { return { components: { MkCallsRoomWindow }, setup: () => ({ args }), template: '<MkCallsRoomWindow v-bind="args" />' }; },
	args: { roomId: room.id },
	parameters: {
		layout: 'fullscreen',
		msw: { handlers: [
			http.post('/api/calls/rooms/show', () => HttpResponse.json({ room, participants: [{ id: 'calls-host-story', roomId: room.id, userId: host.id, role: 'host', state: 'active', isMuted: true, joinedAt: room.startedAt, leftAt: null, speakerRequestedAt: null, user: host }] })),
		] },
	},
} satisfies StoryObj<typeof MkCallsRoomWindow>;
