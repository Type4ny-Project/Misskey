/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { http, HttpResponse } from 'msw';
import MkCallsWatchTogetherVideoPreview from './MkCallsWatchTogetherVideoPreview.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	render(args) { return { components: { MkCallsWatchTogetherVideoPreview }, setup: () => ({ args }), template: '<MkCallsWatchTogetherVideoPreview v-bind="args" style="max-width: 600px;" />' }; },
	args: { videoId: 'M7lc1UVf-VE' },
	parameters: { msw: { handlers: [http.get('/url', () => HttpResponse.json({ title: 'YouTube Developers Live', description: 'Embedded Web Player Customization' }))] } },
} satisfies StoryObj<typeof MkCallsWatchTogetherVideoPreview>;
