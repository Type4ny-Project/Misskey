/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import { http, HttpResponse } from 'msw';
import { userLite } from '../../.storybook/fakes.js';
import MkCallsRoomCard from './MkCallsRoomCard.vue';
import type { StoryObj } from '@storybook/vue3';
import type * as Misskey from 'misskey-js';

const host = { ...userLite(), isFollowing: false, isFollowed: false };
const room = {
	id: 'calls-room-story', attachment: { type: 'personal', ownerUserId: host.id },
	title: '今日のMisskeyについて話そう', description: '', mode: 'stage', visibility: 'public',
	moderatorUserIds: [], state: 'open', scheduledAt: null, startedAt: '2026-10-02T00:00:00.000Z', endedAt: null,
	revision: 1, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
} satisfies Misskey.entities.CallsRoom;

export const Default = {
	render(args) {
		return { components: { MkCallsRoomCard }, setup: () => ({ args }), template: '<div style="width: min(560px, 100vw)"><MkCallsRoomCard v-bind="args" /></div>' };
	},
	args: { room },
	parameters: {
		layout: 'centered',
		msw: {
			handlers: [
				http.post('/api/calls/rooms/show', () => HttpResponse.json({ room, participants: [{ id: 'calls-host-story', roomId: room.id, userId: host.id, role: 'host', state: 'active', isMuted: true, joinedAt: room.startedAt, leftAt: null, speakerRequestedAt: null, user: host }] })),
			],
		},
	},
} satisfies StoryObj<typeof MkCallsRoomCard>;

export const LongTitle = { ...Default, args: { room: { ...room, title: '長いルーム名でも参加者とルームを開く操作が分かりやすく表示されることを確認するための通話' } } } satisfies StoryObj<typeof MkCallsRoomCard>;
export const Compact = { ...Default, args: { room, compact: true } } satisfies StoryObj<typeof MkCallsRoomCard>;

const endedRoom = { ...room, id: 'calls-ended-room-story', state: 'ended', endedAt: '2026-10-02T01:12:35.000Z' } satisfies Misskey.entities.CallsRoom;
export const Ended = {
	...Default,
	args: { room: endedRoom },
	parameters: {
		...Default.parameters,
		msw: { handlers: [http.post('/api/calls/rooms/show', () => HttpResponse.json({ room: endedRoom, participants: [] }))] },
	},
} satisfies StoryObj<typeof MkCallsRoomCard>;

export const EndedNarrow = {
	...Ended,
	render(args) {
		return { components: { MkCallsRoomCard }, setup: () => ({ args }), template: '<div style="width: 280px"><MkCallsRoomCard v-bind="args" /></div>' };
	},
} satisfies StoryObj<typeof MkCallsRoomCard>;
