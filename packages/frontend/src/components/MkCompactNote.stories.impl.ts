/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { note, file } from '../../.storybook/fakes.js';
import MkCompactNote from './MkCompactNote.vue';

export const Default = {
	render(args) {
		return {
			components: { MkCompactNote },
			setup() { return { args }; },
			template: '<MkCompactNote v-bind="args"/>',
		};
	},
	args: {
		note: { ...note(), text: '1行目\n2行目 https://example.com/ ' + '長い本文 '.repeat(30) },
		reactionCount: 3,
	},
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkCompactNote>;

export const Cw = {
	...Default,
	args: { ...Default.args, note: { ...note(), cw: 'ネタバレの警告', text: '開示前に表示しない本文' } },
} satisfies StoryObj<typeof MkCompactNote>;

export const EmptyCw = {
	...Cw,
	args: { ...Cw.args, note: { ...Cw.args.note, cw: '' } },
} satisfies StoryObj<typeof MkCompactNote>;

export const Renote = {
	...Default,
	args: { ...Default.args, note: { ...note(), text: null, renoteId: 'original', renote: { ...note('original'), text: 'リノートされたノート' } } },
} satisfies StoryObj<typeof MkCompactNote>;

export const Reply = {
	...Default,
	args: { ...Default.args, note: { ...note(), replyId: 'parent', text: '返信の本文' } },
} satisfies StoryObj<typeof MkCompactNote>;

export const Attachments = {
	...Default,
	args: {
		...Default.args,
		note: {
			...note(), text: '添付と投票 https://example.com/', files: [file()],
			poll: { multiple: false, expiresAt: null, choices: [{ text: '選択肢', votes: 0, isVoted: false }] },
		},
	},
} satisfies StoryObj<typeof MkCompactNote>;
