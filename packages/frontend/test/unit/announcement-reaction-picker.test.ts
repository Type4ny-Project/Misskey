/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { ref } from 'vue';
import type { Directive } from 'vue';
import MkEmojiPicker from '@/components/MkEmojiPicker.vue';

vi.mock('@/i.js', () => ({ $i: { host: null, roles: [] } }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/os.js', () => ({ popup: vi.fn() }));
vi.mock('@/instance.js', () => ({ instance: {} }));
vi.mock('@/utility/haptic.js', () => ({ haptic: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: {
	r: { emojiPickerScale: { value: 1 }, emojiPickerWidth: { value: 1 }, emojiPickerHeight: { value: 1 } },
	s: { animation: false },
} }));
vi.mock('@/store.js', () => ({ store: {
	r: { recentlyUsedEmojis: { value: [] } },
	s: { recentlyUsedEmojis: [], additionalUnicodeEmojiIndexes: {} }, set: vi.fn(),
} }));
vi.mock('@/custom-emojis.js', () => {
	const emojis = [{
		name: 'restricted', aliases: [], category: null, url: '/emoji.png', localOnly: true,
		isSensitive: true, roleIdsThatCanBeUsedThisEmojiAsReaction: ['allowed-role'],
	}, {
		name: 'public', aliases: [], category: null, url: '/emoji.png', localOnly: true,
		isSensitive: true, roleIdsThatCanBeUsedThisEmojiAsReaction: [],
	}];
	return {
		customEmojis: ref(emojis), customEmojiCategories: ref([null]),
		customEmojisMap: new Map(emojis.map(emoji => [emoji.name, emoji])),
	};
});

afterEach(cleanup);

test('お知らせのピッカーは権限のない絵文字を選択不可にし、通常の絵文字入力を制限しない', async () => {
	const result = render(MkEmojiPicker, {
		props: { checkReactionRoles: true, pinnedEmojis: [':restricted:', ':public:', '👍'] },
		global: {
			stubs: { MkEmojiPickerSection: true },
			components: {
				MkCustomEmoji: { props: ['name'], template: '<span>{{ name }}</span>' },
				MkEmoji: { props: ['emoji'], template: '<span>{{ emoji }}</span>' },
			},
			directives: { tooltip: vi.fn() as Directive, panel: vi.fn() as Directive },
		},
	});

	expect(result.container.querySelector<HTMLButtonElement>('button[data-emoji=":restricted:"]')?.disabled).toBe(true);
	expect(result.container.querySelector<HTMLButtonElement>('button[data-emoji=":public:"]')?.disabled).toBe(false);
	expect(result.container.querySelector<HTMLButtonElement>('button[data-emoji="👍"]')?.disabled).toBe(false);
	const input = result.container.querySelector('input')!;
	await fireEvent.update(input, 'restricted');
	await fireEvent.keyDown(input, { key: 'Enter' });
	expect(result.emitted('chosen')).toBeUndefined();

	await result.rerender({ checkReactionRoles: false });
	expect(result.container.querySelector<HTMLButtonElement>('button[data-emoji=":restricted:"]')?.disabled).toBe(false);
});
