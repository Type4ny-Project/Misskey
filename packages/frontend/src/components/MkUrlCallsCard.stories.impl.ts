/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { http, HttpResponse } from 'msw';
import MkUrlCallsCard from './MkUrlCallsCard.vue';
import { Default as RoomCard } from './MkCallsRoomCard.stories.impl.js';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	args: { roomId: RoomCard.args.room.id },
	parameters: RoomCard.parameters,
} satisfies StoryObj<typeof MkUrlCallsCard>;

export const Unavailable = {
	args: { roomId: 'unavailable' },
	parameters: { msw: { handlers: [http.post('/api/calls/rooms/show', () => new HttpResponse(null, { status: 404 }))] } },
} satisfies StoryObj<typeof MkUrlCallsCard>;
