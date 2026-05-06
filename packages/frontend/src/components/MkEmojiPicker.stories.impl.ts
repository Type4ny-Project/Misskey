/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { action } from 'storybook/actions';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import { HttpResponse, http } from 'msw';
import type { StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { note } from '../../.storybook/fakes.js';
import { commonHandlers } from '../../.storybook/mocks.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { customEmojis, customEmojisMap } from '@/custom-emojis.js';
import MkEmojiPicker from './MkEmojiPicker.vue';

type EmojiSuggestionStoryMeta = typeof instance & {
	emojiSuggestion?: {
		enabled: boolean;
		maxSuggestions: number;
	} | null;
};

type SuggestionRequestBody = {
	noteId: string;
	i?: string | null;
};

const suggestedEmoji: Misskey.entities.EmojiSimple = {
	name: 'suggest_smile',
	aliases: ['suggest'],
	category: 'story',
	url: '/client-assets/about-icon.png',
	localOnly: false,
	isSensitive: false,
	roleIdsThatCanBeUsedThisEmojiAsReaction: [],
};

const fallbackEmoji: Misskey.entities.EmojiSimple = {
	name: 'fallback_ok',
	aliases: ['fallback'],
	category: 'story',
	url: '/client-assets/about-icon.png',
	localOnly: false,
	isSensitive: false,
	roleIdsThatCanBeUsedThisEmojiAsReaction: [],
};

const suggestionRequestBodies: unknown[] = [];
const fallbackRequestBodies: unknown[] = [];
const noCallRequestBodies: unknown[] = [];

function setupEmojiSuggestionStoryState(): void {
	const suggestionMeta = instance as EmojiSuggestionStoryMeta;
	suggestionMeta.emojiSuggestion = { enabled: true, maxSuggestions: 4 };
	delete (suggestionMeta as unknown as Record<string, unknown>).emojiSuggestionEnabled;
	delete (suggestionMeta as unknown as Record<string, unknown>).emojiSuggestionMaxSuggestions;
	suggestionRequestBodies.length = 0;
	fallbackRequestBodies.length = 0;
	noCallRequestBodies.length = 0;
	customEmojis.value = [suggestedEmoji, fallbackEmoji];
	customEmojisMap.clear();
	for (const emoji of customEmojis.value) {
		customEmojisMap.set(emoji.name, emoji);
	}
}

function renderDisabledReactionPickerStory(args: Record<string, unknown>) {
	return {
		components: {
			MkEmojiPicker,
		},
		setup() {
			setupEmojiSuggestionStoryState();
			const suggestionMeta = instance as EmojiSuggestionStoryMeta;
			suggestionMeta.emojiSuggestion = { enabled: false, maxSuggestions: 4 };
			const chosen = ref<string[]>([]);
			const onChosen = (emoji: string) => {
				chosen.value.push(emoji);
				action('chosen')(emoji);
			};

			return {
				args,
				chosen,
				onChosen,
			};
		},
		template: '<MkEmojiPicker v-bind="args" @chosen="onChosen" /><output data-testid="chosen">{{ chosen.join(\',\') }}</output>',
	};
}

function isSuggestionRequestBody(value: unknown): value is SuggestionRequestBody {
	return typeof value === 'object' && value !== null &&
		'noteId' in value && typeof value.noteId === 'string' &&
		(!('i' in value) || value.i == null || typeof value.i === 'string');
}

function assertSuggestionRequestBody(value: unknown, noteId: string): asserts value is SuggestionRequestBody {
	expect(isSuggestionRequestBody(value)).toBe(true);
	if (!isSuggestionRequestBody(value)) {
		throw new Error('invalid suggestion request body');
	}
	expect(value.noteId).toBe(noteId);
	expect(value).not.toHaveProperty('locale');
	expect(value).not.toHaveProperty('language');
	expect(value).not.toHaveProperty('text');
	expect(value).not.toHaveProperty(['c', 'w'].join(''));
}

function renderReactionPickerStory(args: Record<string, unknown>) {
	return {
		components: {
			MkEmojiPicker,
		},
		setup() {
			setupEmojiSuggestionStoryState();
			const chosen = ref<string[]>([]);
			const onChosen = (emoji: string) => {
				chosen.value.push(emoji);
				action('chosen')(emoji);
			};

			return {
				args,
				chosen,
				onChosen,
			};
		},
		template: '<MkEmojiPicker v-bind="args" @chosen="onChosen" /><output data-testid="chosen">{{ chosen.join(\',\') }}</output>',
	};
}

export const Default = {
	render(args) {
		return {
			components: {
				MkEmojiPicker,
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
				events() {
					return {
						chosen: action('chosen'),
					};
				},
			},
			template: '<MkEmojiPicker v-bind="props" v-on="events" />',
		};
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const faceSection = canvas.getByText(/face/i);
		await waitFor(() => userEvent.click(faceSection));
		const grinning = canvasElement.querySelector('[data-emoji="😀"]');
		await expect(grinning).toBeInTheDocument();
		if (grinning == null) throw new Error(); // NOTE: not called
		await waitFor(() => userEvent.click(grinning));
		const recentUsedSection = canvas.getByText(new RegExp(i18n.ts.recentUsed)).parentElement;
		await expect(recentUsedSection).toBeInTheDocument();
		if (recentUsedSection == null) throw new Error(); // NOTE: not called
		await expect(within(recentUsedSection).getByAltText('😀')).toBeInTheDocument();
		await expect(within(recentUsedSection).queryByAltText('😬')).toEqual(null);
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkEmojiPicker>;

const reactionTargetNote = {
	...note('suggestion-story-note'),
	localOnly: false,
};

export const SuggestedReaction = {
	render: renderReactionPickerStory,
	args: {
		asReactionPicker: true,
		targetNote: reactionTargetNote,
		showPinned: false,
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		await waitFor(() => expect(canvas.getByText('Suggested')).toBeInTheDocument());
		await waitFor(() => expect(suggestionRequestBodies.length).toBe(1));
		assertSuggestionRequestBody(suggestionRequestBodies[0], reactionTargetNote.id);

		const suggestedButton = canvasElement.querySelector('[data-emoji=":suggest_smile:"]');
		await expect(suggestedButton).toBeInTheDocument();
		if (suggestedButton == null) {
			throw new Error('suggested emoji button was not rendered');
		}
		await waitFor(() => userEvent.click(suggestedButton));
		await expect(canvas.getByTestId('chosen')).toHaveTextContent(':suggest_smile:');
	},
	parameters: {
		layout: 'centered',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/notes/reactions/suggestions', async ({ request }) => {
					const body: unknown = await request.json();
					suggestionRequestBodies.push(body);
					return HttpResponse.json({
						items: [{
							name: suggestedEmoji.name,
							score: 0.98,
							aliases: suggestedEmoji.aliases,
							category: suggestedEmoji.category,
						}],
						reason: 'story',
					});
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkEmojiPicker>;

export const SuggestionsDisabledNoCall = {
	render: renderDisabledReactionPickerStory,
	args: {
		asReactionPicker: true,
		targetNote: reactionTargetNote,
		pinnedEmojis: [':fallback_ok:'],
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		await waitFor(() => expect(canvas.queryByText('Suggested')).toEqual(null));
		await waitFor(() => expect(noCallRequestBodies.length).toBe(0));

		const fallbackButton = canvasElement.querySelector('[data-emoji=":fallback_ok:"]');
		await expect(fallbackButton).toBeInTheDocument();
		if (fallbackButton == null) {
			throw new Error('fallback pinned emoji button was not rendered');
		}
		await waitFor(() => userEvent.click(fallbackButton));
		await expect(canvas.getByTestId('chosen')).toHaveTextContent(':fallback_ok:');
	},
	parameters: {
		layout: 'centered',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/notes/reactions/suggestions', async ({ request }) => {
					const body: unknown = await request.json();
					noCallRequestBodies.push(body);
					return HttpResponse.json({ items: [], reason: 'fallback' });
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkEmojiPicker>;

export const SuggestionsIneligibleNoCall = {
	render: renderReactionPickerStory,
	args: {
		asReactionPicker: true,
		targetNote: {
			...reactionTargetNote,
			visibility: 'home',
			localOnly: true,
		},
		pinnedEmojis: [':fallback_ok:'],
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		await waitFor(() => expect(canvas.queryByText('Suggested')).toEqual(null));
		await waitFor(() => expect(noCallRequestBodies.length).toBe(0));

		const fallbackButton = canvasElement.querySelector('[data-emoji=":fallback_ok:"]');
		await expect(fallbackButton).toBeInTheDocument();
		if (fallbackButton == null) {
			throw new Error('fallback pinned emoji button was not rendered');
		}
		await waitFor(() => userEvent.click(fallbackButton));
		await expect(canvas.getByTestId('chosen')).toHaveTextContent(':fallback_ok:');
	},
	parameters: {
		layout: 'centered',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/notes/reactions/suggestions', async ({ request }) => {
					const body: unknown = await request.json();
					noCallRequestBodies.push(body);
					return HttpResponse.json({ items: [], reason: 'fallback' });
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkEmojiPicker>;

export const SuggestionsFailureFallback = {
	render: renderReactionPickerStory,
	args: {
		asReactionPicker: true,
		targetNote: reactionTargetNote,
		pinnedEmojis: [':fallback_ok:'],
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		await waitFor(() => expect(fallbackRequestBodies.length).toBe(1));
		assertSuggestionRequestBody(fallbackRequestBodies[0], reactionTargetNote.id);
		await expect(canvas.queryByText('Suggested')).toEqual(null);
		await expect(canvas.queryByText(/error/i)).toEqual(null);

		const fallbackButton = canvasElement.querySelector('[data-emoji=":fallback_ok:"]');
		await expect(fallbackButton).toBeInTheDocument();
		if (fallbackButton == null) {
			throw new Error('fallback pinned emoji button was not rendered');
		}
		await waitFor(() => userEvent.click(fallbackButton));
		await expect(canvas.getByTestId('chosen')).toHaveTextContent(':fallback_ok:');
	},
	parameters: {
		layout: 'centered',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/notes/reactions/suggestions', async ({ request }) => {
					const body: unknown = await request.json();
					fallbackRequestBodies.push(body);
					return HttpResponse.json({ error: 'story failure' }, { status: 500 });
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkEmojiPicker>;
