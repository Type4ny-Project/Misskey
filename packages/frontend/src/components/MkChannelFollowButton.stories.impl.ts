/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { HttpResponse, http } from 'msw';
import { action } from 'storybook/actions';
import { expect, userEvent, within } from '@storybook/test';
import { channel } from '../../.storybook/fakes.js';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkChannelFollowButton from './MkChannelFollowButton.vue';
import type { StoryObj } from '@storybook/vue3';
import { i18n } from '@/i18n.js';

function sleep(ms: number) {
	return new Promise(resolve => window.setTimeout(resolve, ms));
}

export const Default = {
	render(args) {
		return {
			components: {
				MkChannelFollowButton,
			},
			setup() {
				return {
					args,
				};
			},
			computed: {
				props() {
					return {
						...this.args,
					};
				},
			},
			template: '<MkChannelFollowButton v-bind="props" />',
		};
	},
	args: {
		channel: channel(),
		full: true,
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const buttonElement = canvas.getByRole<HTMLButtonElement>('button');
		await expect(buttonElement).toHaveTextContent(i18n.ts.follow);
		await expect(buttonElement).toHaveTextContent('1');
		await userEvent.click(buttonElement);
		await sleep(1000);
		await expect(buttonElement).toHaveTextContent(i18n.ts.unfollow);
		await expect(buttonElement).toHaveTextContent('2');
		await userEvent.click(buttonElement);
		await sleep(1000);
		await expect(buttonElement).toHaveTextContent('1');
	},
	parameters: {
		layout: 'centered',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/channels/follow', async ({ request }) => {
					action('POST /api/channels/follow')(await request.json());
					return HttpResponse.json({ state: 'following' });
				}),
				http.post('/api/channels/unfollow', async ({ request }) => {
					action('POST /api/channels/unfollow')(await request.json());
					return HttpResponse.json({});
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkChannelFollowButton>;

export const ApprovalRequired = {
	...Default,
	args: {
		channel: {
			...channel(),
			isFollowApprovalRequired: true,
		},
		full: true,
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const buttonElement = canvas.getByRole<HTMLButtonElement>('button');
		await expect(buttonElement).toHaveTextContent(i18n.ts.follow);
		await userEvent.click(buttonElement);
		await sleep(1000);
		await expect(buttonElement).toHaveTextContent(i18n.ts.followRequestPending);
		await expect(buttonElement).toHaveTextContent('1');
	},
	parameters: {
		...Default.parameters,
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/channels/follow', async ({ request }) => {
					action('POST /api/channels/follow')(await request.json());
					return HttpResponse.json({ state: 'pending' });
				}),
				http.post('/api/channels/unfollow', async ({ request }) => {
					action('POST /api/channels/unfollow')(await request.json());
					return HttpResponse.json({});
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkChannelFollowButton>;
