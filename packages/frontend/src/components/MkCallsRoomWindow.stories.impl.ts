/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { http, HttpResponse } from 'msw';
import { within } from '@storybook/test';
import { channel, note, userLite } from '../../.storybook/fakes.js';
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

const chatChannel = { ...channel('calls-chat-story', room.title, null), isUnlisted: true, isLocalOnly: true };
const listener = userLite('calls-listener-story', 'listener', null, '聞き専の人');
const chatNotes = [
	{ ...note('calls-chat-note-2'), text: '聞き専ですが、ここから参加しています！', user: listener, userId: listener.id },
	{ ...note('calls-chat-note-1'), text: '通話の感想や質問は、このチャンネルにどうぞ。', user: host, userId: host.id },
].map(item => ({ ...item, channelId: chatChannel.id, channel: { id: chatChannel.id, name: chatChannel.name, color: chatChannel.color }, localOnly: true, createdAt: room.startedAt }));

export const ChannelChat = {
	...Default,
	parameters: {
		...Default.parameters,
		msw: { handlers: [
			http.post('/api/calls/rooms/show', () => HttpResponse.json({ room: { ...room, channelId: chatChannel.id }, participants: [
				{ id: 'calls-host-story', roomId: room.id, userId: host.id, role: 'host', state: 'active', isMuted: true, joinedAt: room.startedAt, leftAt: null, speakerRequestedAt: null, user: host },
				{ id: 'calls-listener-story', roomId: room.id, userId: listener.id, role: 'listener', state: 'active', isMuted: true, joinedAt: room.startedAt, leftAt: null, speakerRequestedAt: null, user: listener },
			] })),
			http.post('/api/channels/show', () => HttpResponse.json(chatChannel)),
			http.post('/api/channels/timeline', async ({ request }) => {
				const params = await request.json() as { untilId?: string };
				return HttpResponse.json(params.untilId == null ? chatNotes : []);
			}),
		] },
	},
	async play() {
		const body = within(document.body);
		(await body.findByRole('button', { name: 'キャンセル' })).click();
		(await body.findByRole('button', { name: 'チャット' })).click();
	},
} satisfies StoryObj<typeof MkCallsRoomWindow>;
