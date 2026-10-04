/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import type * as Misskey from 'misskey-js';
import MkAnnouncementReactions from '@/components/MkAnnouncementReactions.vue';

const mocks = vi.hoisted(() => ({ api: vi.fn(), picker: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: { id: 'viewer' } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { doReaction: 'Add reaction' } } }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.api }));
vi.mock('@/utility/reaction-picker.js', () => ({ reactionPicker: { show: mocks.picker } }));
vi.mock('@/components/MkReactionIcon.vue', () => ({ default: { props: ['reaction'], template: '<span>{{ reaction }}</span>' } }));

let app: App | undefined;
let root: HTMLDivElement;
const announcement: Misskey.entities.Announcement = {
	id: 'announcement', reactionsEnabled: true, reactions: { '👍': 2 }, myReaction: '👍',
	createdAt: new Date().toISOString(), updatedAt: null, text: 'Text', title: 'Title', imageUrl: null,
	icon: 'info', display: 'normal', forYou: false, silence: false, needConfirmationToRead: false,
};

function mount(interactive: boolean, enabled = true) {
	root = document.createElement('div');
	document.body.appendChild(root);
	const update = vi.fn();
	app = createApp({ render: () => h(MkAnnouncementReactions, {
		announcement: { ...announcement, reactionsEnabled: enabled }, interactive, onUpdate: update,
	}) });
	app.mount(root);
	return update;
}

afterEach(() => {
	app?.unmount();
	root.remove();
	vi.resetAllMocks();
});

describe('announcement reactions', () => {
	test('一覧は集計のみ表示し、無効な場合は欄を表示しない', () => {
		mount(false);
		expect(root.textContent).toContain('👍2');
		expect(root.querySelector('button')).toBeNull();
		expect(root.querySelector('span')?.className).toContain('reacted');
		app?.unmount();
		root.remove();
		mount(true, false);
		expect(root.querySelector('button')).toBeNull();
		expect(root.textContent).not.toContain('👍');
	});

	test('自分の反応を取消し、成功した集計だけを更新する', async () => {
		const update = mount(true);
		let finish: (value: { reactions: Record<string, number>; myReaction: null }) => void;
		mocks.api.mockReturnValue(new Promise(resolve => { finish = resolve; }));
		root.querySelector('button')?.click();
		await nextTick();
		expect(mocks.api).toHaveBeenCalledWith('announcements/react', { announcementId: 'announcement', reaction: null });
		expect([...root.querySelectorAll('button')].every(b => b.disabled)).toBe(true);
		expect(update).not.toHaveBeenCalled();
		finish!({ reactions: { '👍': 1 }, myReaction: null });
		await Promise.resolve();
		await nextTick();
		expect(update).toHaveBeenCalledWith({ reactions: { '👍': 1 }, myReaction: null });
		expect([...root.querySelectorAll('button')].every(b => !b.disabled)).toBe(true);
	});

	test('ノートと同じピッカーで選択し、失敗したら表示を維持する', async () => {
		const update = mount(true);
		mocks.api.mockRejectedValue(new Error('Reactions disabled'));
		root.querySelector<HTMLButtonElement>('button[aria-label="Add reaction"]')?.click();
		expect(mocks.picker.mock.calls[0][4]).toBe(true);
		const chosen = mocks.picker.mock.calls[0][2] as (reaction: string) => void;
		chosen('🎉');
		await Promise.resolve();
		await nextTick();
		expect(mocks.api).toHaveBeenCalledWith('announcements/react', { announcementId: 'announcement', reaction: '🎉' });
		expect(update).not.toHaveBeenCalled();
		expect(root.textContent).toContain('👍2');
		expect(root.querySelector('button')?.disabled).toBe(false);
	});
});
