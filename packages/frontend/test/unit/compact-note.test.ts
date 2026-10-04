/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent } from 'vue';
import locales from 'i18n';
import { note, file } from '../../.storybook/fakes.js';
import MkCompactNote from '@/components/MkCompactNote.vue';
import { i18n, updateI18n } from '@/i18n.js';

const global = {
	stubs: {
		MkA: defineComponent({ props: ['to'], template: '<a :href="to"><slot/></a>' }),
		MkAvatar: true,
		MkTime: true,
	},
};

beforeAll(() => updateI18n(locales['ja-JP']));
afterAll(() => updateI18n(locales['en-US']));
afterEach(cleanup);

describe('compact notes', () => {
	test.each(['警告\n文', ''])('CW %j hides body, attachment details, poll choices and quoted text', (cw) => {
		const result = render(MkCompactNote, {
			global,
			props: {
				note: {
					...note(), cw, text: 'secret-body https://secret.invalid/',
					files: [{ ...file(), id: 'file', name: 'secret-filename', url: 'https://secret.invalid/file' }],
					poll: { choices: [{ text: 'secret-choice', votes: 0, isVoted: false }], multiple: false, expiresAt: null },
					renoteId: 'quote', renote: { ...note('quote'), text: 'secret-quote' },
				},
				reactionCount: 2,
			},
		});
		expect(result.getByRole('link').getAttribute('href')).toBe('/notes/somenoteid');
		expect(result.container.innerHTML).not.toContain('secret');
		expect(result.container.textContent).toContain(cw ? '警告 文' : i18n.ts._compactTimeline.hiddenContent);
		expect(result.container.querySelector('[title="' + i18n.ts._compactTimeline.cw + '"]')).not.toBeNull();
	});

	test('normal summary flattens whitespace, marks attachments and never embeds related notes', () => {
		const result = render(MkCompactNote, {
			global,
			props: {
				note: { ...note(), text: 'first\nsecond https://example.com/', replyId: 'reply', reply: { ...note('reply'), text: 'parent-body' }, files: [{ ...file(), id: 'file', name: 'file-name' }] },
				reactionCount: 1,
			},
		});
		expect(result.container.textContent).toContain('first second https://example.com/');
		expect(result.container.innerHTML).not.toContain('parent-body');
		expect(result.container.innerHTML).not.toContain('file-name');
		expect(result.container.querySelectorAll('a')).toHaveLength(1);
		expect(result.container.querySelector('.ti-arrow-back-up')).not.toBeNull();
		expect(result.container.querySelector('.ti-paperclip')).not.toBeNull();
		expect(result.container.querySelector('.ti-link')).not.toBeNull();
	});

	test('pure Renote opens the original note and preserves its empty CW', () => {
		const result = render(MkCompactNote, {
			global,
			props: {
				note: { ...note(), text: null, cw: null, renoteId: 'original', renote: { ...note('original'), cw: '', text: 'secret-renote' } },
				reactionCount: 0,
			},
		});
		expect(result.getByRole('link').getAttribute('href')).toBe('/notes/original');
		expect(result.container.innerHTML).not.toContain('secret-renote');
		expect(result.container.querySelector('.ti-repeat')).not.toBeNull();
		expect(result.container.textContent).toContain(i18n.ts._compactTimeline.hiddenContent);
	});

	test.each([
		{ isHidden: true }, { deletedAt: '2026-10-04T00:00:00Z' },
		{ isHidden: true, text: null, cw: null, renoteId: 'original', renote: { ...note('original'), text: 'secret-renote' } },
		{ deletedAt: '2026-10-04T00:00:00Z', text: null, cw: null, renoteId: 'original', renote: { ...note('original'), cw: 'secret-cw', text: 'secret-renote' } },
	])('unavailable note %j does not expose its summary', (state) => {
		const result = render(MkCompactNote, {
			global,
			props: { note: { ...note(), cw: 'secret-warning', text: 'secret-body', ...state }, reactionCount: 0 },
		});
		expect(result.container.innerHTML).not.toContain('secret');
	});
});
