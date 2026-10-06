/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { http, HttpResponse } from 'msw';
import MkCallsWatchTogether from './MkCallsWatchTogether.vue';
import type { StoryObj } from '@storybook/vue3';
import type * as Misskey from 'misskey-js';

const room = {
	id: 'watch-together-story', attachment: { type: 'personal', ownerUserId: 'host' },
	title: 'Watch Together', description: '', mode: 'open', visibility: 'public', moderatorUserIds: [],
	state: 'open', scheduledAt: null, startedAt: '2026-10-06T00:00:00.000Z', endedAt: null,
	revision: 1, createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z',
} satisfies Misskey.entities.CallsRoom;

export const Default = {
	render(args) { return { components: { MkCallsWatchTogether }, setup: () => ({ args }), template: '<MkCallsWatchTogether v-bind="args" style="max-width: 800px;" />' }; },
	args: { room, canControl: true },
	parameters: { msw: { handlers: [http.post('/api/calls/watch-together/show', () => HttpResponse.json({ queue: [], videoId: null, playing: false, position: 0, updatedAt: Date.now(), revision: 0, serverTime: Date.now() }))] } },
} satisfies StoryObj<typeof MkCallsWatchTogether>;

export const Viewer = { ...Default, args: { room, canControl: false } } satisfies StoryObj<typeof MkCallsWatchTogether>;
