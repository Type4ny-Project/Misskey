/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, type RenderResult } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import { customEmojis, customEmojisMap } from '@/custom-emojis.js';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const mockedRecentlyUsedEmojis = vi.hoisted(() => ({
	value: [] as string[],
}));

const mockedMisskeyApi = vi.hoisted(() => vi.fn());

vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			search: 'Search',
			recentUsed: 'Recently used',
			customEmojis: 'Custom emojis',
			emoji: 'Emoji',
			other: 'Other',
			settings: 'Settings',
		},
	},
	updateI18n: vi.fn(),
}));

vi.mock('@/preferences.js', () => ({
	prefer: {
		r: {
			emojiPickerScale: { value: 1 },
			emojiPickerWidth: { value: 1 },
			emojiPickerHeight: { value: 1 },
		},
		s: {
			animation: false,
		},
	},
}));

vi.mock('@/store.js', () => ({
	store: {
		r: {
			recentlyUsedEmojis: mockedRecentlyUsedEmojis,
		},
		s: {
			additionalUnicodeEmojiIndexes: {},
			recentlyUsedEmojis: mockedRecentlyUsedEmojis.value,
		},
		set: vi.fn((key: string, value: string[]) => {
			if (key === 'recentlyUsedEmojis') {
				mockedRecentlyUsedEmojis.value = value;
			}
		}),
	},
}));

vi.mock('@/router.js', () => ({
	useRouter: () => ({
		push: vi.fn(),
	}),
}));

vi.mock('@/os.js', () => ({
	popup: vi.fn(() => ({
		dispose: vi.fn(),
	})),
}));

vi.mock('@/utility/haptic.js', () => ({
	haptic: vi.fn(),
}));

vi.mock('@/utility/check-reaction-permissions.js', () => ({
	checkReactionPermissions: vi.fn(() => true),
}));

vi.mock('@/i.js', () => ({
	$i: {
		token: 'fixture-token',
		host: 'example.test',
		roles: [],
	},
}));

vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: mockedMisskeyApi,
}));

type EmojiSuggestionPublicMeta = typeof instance & {
	emojiSuggestion?: {
		enabled: boolean;
		maxSuggestions: number;
	} | null;
};

function setEmojiSuggestionPublicMeta(value: EmojiSuggestionPublicMeta['emojiSuggestion']): void {
	const suggestionMeta = instance as EmojiSuggestionPublicMeta;
	suggestionMeta.emojiSuggestion = value;
}

function setFlatEmojiSuggestionPublicMetaForRegression(enabled: boolean, maxSuggestions: number): void {
	const flatMeta = instance as unknown as Record<string, unknown>;
	flatMeta.emojiSuggestionEnabled = enabled;
	flatMeta.emojiSuggestionMaxSuggestions = maxSuggestions;
}

function clearFlatEmojiSuggestionPublicMeta(): void {
	const flatMeta = instance as unknown as Record<string, unknown>;
	delete flatMeta.emojiSuggestionEnabled;
	delete flatMeta.emojiSuggestionMaxSuggestions;
}

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

const thresholdEmoji: Misskey.entities.EmojiSimple = {
	name: 'threshold_ok',
	aliases: ['threshold'],
	category: 'story',
	url: '/client-assets/about-icon.png',
	localOnly: false,
	isSensitive: false,
	roleIdsThatCanBeUsedThisEmojiAsReaction: [],
};

const belowThresholdEmoji: Misskey.entities.EmojiSimple = {
	name: 'below_threshold',
	aliases: ['below'],
	category: 'story',
	url: '/client-assets/about-icon.png',
	localOnly: false,
	isSensitive: false,
	roleIdsThatCanBeUsedThisEmojiAsReaction: [],
};

function createNote(overrides: Partial<Misskey.entities.Note> = {}): Misskey.entities.Note {
	return {
		id: 'qa-note-fixture',
		createdAt: '2026-05-04T00:00:00.000Z',
		deletedAt: null,
		text: 'sanitized fixture note',
		cw: null,
		userId: 'qa-user-fixture',
		user: {
			id: 'qa-user-fixture',
			username: 'qa-user',
			host: 'example.test',
			name: 'QA User',
			onlineStatus: 'unknown',
			avatarUrl: null,
			avatarBlurhash: null,
			avatarDecorations: [],
			emojis: {},
		},
		visibility: 'public',
		reactionAcceptance: null,
		reactionEmojis: {},
		reactions: {},
		myReaction: null,
		reactionCount: 0,
		renoteCount: 0,
		repliesCount: 0,
		...overrides,
	} as Misskey.entities.Note;
}

async function renderPicker(props: {
	targetNote: Misskey.entities.Note;
	pinnedEmojis?: string[];
}): Promise<RenderResult> {
	const { default: MkEmojiPicker } = await import('@/components/MkEmojiPicker.vue');

	return render(MkEmojiPicker, {
		props: {
			asReactionPicker: true,
			showPinned: true,
			...props,
		},
		global: {
			components: {
				MkCustomEmoji: {
					props: ['name'],
					template: '<span class="emoji" :data-name="name">{{ name }}</span>',
				},
				MkEmoji: {
					props: ['emoji'],
					template: '<span class="emoji">{{ emoji }}</span>',
				},
			},
			directives: {
				tooltip: vi.fn(),
				panel: vi.fn(),
			},
		},
	});
}

beforeEach(() => {
	mockedMisskeyApi.mockReset();

	window.matchMedia ??= vi.fn().mockReturnValue({
		matches: false,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	});

	clearFlatEmojiSuggestionPublicMeta();
	setEmojiSuggestionPublicMeta({ enabled: true, maxSuggestions: 4 });

	customEmojis.value = [suggestedEmoji, fallbackEmoji, thresholdEmoji, belowThresholdEmoji];
	mockedRecentlyUsedEmojis.value = [];
	customEmojisMap.clear();
	for (const emoji of customEmojis.value) {
		customEmojisMap.set(emoji.name, emoji);
	}
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('MkEmojiPicker emoji suggestions QA flows', () => {
	test('shows eligible public suggestions and emits the existing chosen reaction path', async () => {
		mockedMisskeyApi.mockResolvedValueOnce({
				items: [{
					name: suggestedEmoji.name,
					score: 0.98,
					aliases: suggestedEmoji.aliases,
					category: suggestedEmoji.category,
				}],
				source: 'live',
				reason: 'component-test',
				modelVersion: 'fixture-model',
				emojiIndexVersion: 'fixture-index',
		});

		const result = await renderPicker({
			targetNote: createNote(),
			pinnedEmojis: [':fallback_ok:'],
		});

		await waitFor(() => expect(result.getByText('Suggested')).not.toBeNull());
		await waitFor(() => expect(mockedMisskeyApi).toHaveBeenCalledTimes(1));

		const [endpoint, payload, token, signal] = mockedMisskeyApi.mock.calls[0];
		expect(endpoint).toBe('notes/reactions/suggestions');
		expect(payload).toMatchObject({
			noteId: 'qa-note-fixture',
			locale: expect.any(String),
			language: expect.any(String),
		});
		expect(payload).not.toHaveProperty('text');
		expect(payload).not.toHaveProperty('cw');
		expect(payload).not.toHaveProperty('i');
		expect(token).toBeUndefined();
		expect(signal).toBeInstanceOf(AbortSignal);

		const suggestedButton = result.container.querySelector('[data-emoji=":suggest_smile:"]');
		expect(suggestedButton).not.toBeNull();
		if (suggestedButton == null) {
			throw new Error('suggested emoji button was not rendered');
		}

		await fireEvent.click(suggestedButton);
		expect(result.emitted('chosen')).toEqual([[':suggest_smile:']]);
	});

	test('does not request suggestions when disabled and pinned picker behavior still works', async () => {
		setEmojiSuggestionPublicMeta({ enabled: false, maxSuggestions: 4 });

		const result = await renderPicker({
			targetNote: createNote(),
			pinnedEmojis: [':fallback_ok:'],
		});

		await waitFor(() => expect(result.queryByText('Suggested')).toEqual(null));
		expect(mockedMisskeyApi).not.toHaveBeenCalled();

		const fallbackButton = result.container.querySelector('[data-emoji=":fallback_ok:"]');
		expect(fallbackButton).not.toBeNull();
		if (fallbackButton == null) {
			throw new Error('fallback pinned emoji button was not rendered');
		}

		await fireEvent.click(fallbackButton);
		expect(result.emitted('chosen')).toEqual([[':fallback_ok:']]);
	});

	test('does not request suggestions when only obsolete flat public meta fields are set', async () => {
		setEmojiSuggestionPublicMeta(undefined);
		setFlatEmojiSuggestionPublicMetaForRegression(true, 4);

		const result = await renderPicker({
			targetNote: createNote(),
			pinnedEmojis: [':fallback_ok:'],
		});

		await waitFor(() => expect(result.queryByText('Suggested')).toEqual(null));
		expect(mockedMisskeyApi).not.toHaveBeenCalled();
	});

	test('shows eligible public local-only suggestions', async () => {
		mockedMisskeyApi.mockResolvedValueOnce({
			items: [{
				name: suggestedEmoji.name,
				score: 0.98,
				aliases: suggestedEmoji.aliases,
				category: suggestedEmoji.category,
			}],
			source: 'live',
			reason: 'component-test',
			modelVersion: 'fixture-model',
			emojiIndexVersion: 'fixture-index',
		});

		const result = await renderPicker({
			targetNote: createNote({ localOnly: true }),
			pinnedEmojis: [':fallback_ok:'],
		});

		await waitFor(() => expect(result.getByText('Suggested')).not.toBeNull());
		await waitFor(() => expect(mockedMisskeyApi).toHaveBeenCalledTimes(1));
		expect(mockedMisskeyApi.mock.calls[0][0]).toBe('notes/reactions/suggestions');
	});

	test('shows eligible home suggestions', async () => {
		mockedMisskeyApi.mockResolvedValueOnce({
			items: [{
				name: suggestedEmoji.name,
				score: 0.98,
				aliases: suggestedEmoji.aliases,
				category: suggestedEmoji.category,
			}],
			source: 'live',
			reason: 'component-test',
			modelVersion: 'fixture-model',
			emojiIndexVersion: 'fixture-index',
		});

		const result = await renderPicker({
			targetNote: createNote({ visibility: 'home' }),
			pinnedEmojis: [':fallback_ok:'],
		});

		await waitFor(() => expect(result.getByText('Suggested')).not.toBeNull());
		await waitFor(() => expect(mockedMisskeyApi).toHaveBeenCalledTimes(1));
		expect(mockedMisskeyApi.mock.calls[0][0]).toBe('notes/reactions/suggestions');
	});

	test('filters suggestion items below the minimum score before rendering', async () => {
		mockedMisskeyApi.mockResolvedValueOnce({
			items: [
				{
					name: belowThresholdEmoji.name,
					score: 0.39,
					aliases: belowThresholdEmoji.aliases,
					category: belowThresholdEmoji.category,
				},
				{
					name: thresholdEmoji.name,
					score: 0.4,
					aliases: thresholdEmoji.aliases,
					category: thresholdEmoji.category,
				},
			],
			source: 'live',
			reason: 'component-test',
			modelVersion: 'fixture-model',
			emojiIndexVersion: 'fixture-index',
		});

		const result = await renderPicker({
			targetNote: createNote({ visibility: 'home' }),
			pinnedEmojis: [':fallback_ok:'],
		});

		await waitFor(() => expect(result.getByText('Suggested')).not.toBeNull());
		await waitFor(() => expect(mockedMisskeyApi).toHaveBeenCalledTimes(1));
		expect(result.container.querySelector('[data-emoji=":threshold_ok:"]')).not.toBeNull();
		expect(result.container.querySelector('[data-emoji=":below_threshold:"]')).toBeNull();
	});

	test.each([
		{ visibility: 'followers' },
		{ visibility: 'specified' },
	] satisfies Partial<Misskey.entities.Note>[])('does not request suggestions for ineligible note fixture %#', async (overrides) => {
		const result = await renderPicker({
			targetNote: createNote(overrides),
			pinnedEmojis: [':fallback_ok:'],
		});

		await waitFor(() => expect(result.queryByText('Suggested')).toEqual(null));
		expect(mockedMisskeyApi).not.toHaveBeenCalled();
	});

	test('keeps pinned, recent, and search behavior usable after suggestion failure fallback', async () => {
		mockedMisskeyApi.mockRejectedValueOnce({ error: 'fixture failure' });
		mockedRecentlyUsedEmojis.value = [':suggest_smile:'];

		const result = await renderPicker({
			targetNote: createNote(),
			pinnedEmojis: [':fallback_ok:'],
		});

		await waitFor(() => expect(mockedMisskeyApi).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(result.queryByText('Suggested')).toEqual(null));
		expect(result.queryByText(/error/i)).toEqual(null);

		const pinnedButton = result.container.querySelector('[data-emoji=":fallback_ok:"]');
		expect(pinnedButton).not.toBeNull();
		if (pinnedButton == null) {
			throw new Error('fallback pinned emoji button was not rendered');
		}

		await fireEvent.click(pinnedButton);
		expect(result.emitted('chosen')).toEqual([[':fallback_ok:']]);

		const recentButton = result.container.querySelector('[data-emoji=":suggest_smile:"]');
		expect(recentButton).not.toBeNull();
		if (recentButton == null) {
			throw new Error('recent emoji button was not rendered');
		}

		await fireEvent.click(recentButton);
		expect(result.emitted('chosen')).toEqual([[':fallback_ok:'], [':suggest_smile:']]);

		const search = result.getByPlaceholderText(i18n.ts.search);
		await fireEvent.update(search, 'fallback');

		const searchResult = result.container.querySelector('[title="fallback_ok"]');
		expect(searchResult).not.toBeNull();
		if (searchResult == null) {
			throw new Error('fallback search result was not rendered');
		}

		await fireEvent.click(searchResult);
		expect(result.emitted('chosen')).toEqual([[':fallback_ok:'], [':suggest_smile:'], [':fallback_ok:']]);
	});
});
