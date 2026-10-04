/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import type * as Misskey from 'misskey-js';
import MkAnnouncementReactions from '@/components/MkAnnouncementReactions.vue';
import Announcements from '@/pages/announcements.vue';
import MkAnnouncementReactionUsers from '@/components/MkAnnouncementReactionUsers.vue';

const mocks = vi.hoisted(() => ({ api: vi.fn(), picker: vi.fn(), confirm: vi.fn(), account: vi.fn(), fetch: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: { id: 'viewer', unreadAnnouncements: [{ id: 'announcement' }, { id: 'other' }] } }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: mocks.account }));
vi.mock('@/i18n.js', () => ({ i18n: {
	ts: { doReaction: 'Add reaction', _announcement: { readConfirmTitle: 'Read?', reactionReadDescription: 'Reacting marks this as read.' } },
	tsx: { _announcement: { reactionReadConfirmText: ({ title }: { title: string }) => `Reacting to ${title} marks it as read.` } },
} }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.api, confirm: mocks.confirm }));
vi.mock('@/utility/reaction-picker.js', () => ({ reactionPicker: { show: mocks.picker } }));
vi.mock('@/components/MkReactionIcon.vue', () => ({ default: { props: ['reaction'], template: '<span>{{ reaction }}</span>' } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.fetch }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/components/MkFolder.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkUserCardMini.vue', () => ({ default: { props: ['user'], template: '<span>{{ user.username }}</span>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkPagination.vue', async () => {
	const { defineComponent, onMounted } = await import('vue');
	return { default: defineComponent({
		props: ['paginator'],
		setup(props, { slots }) {
			onMounted(() => props.paginator.init());
			return () => slots.default?.({ items: props.paginator.items.value });
		},
	}) };
});

let app: App | undefined;
let root: HTMLDivElement;
const announcement: Misskey.entities.Announcement = {
	id: 'announcement', reactionsEnabled: true, reactions: { '👍': 2 }, myReaction: '👍',
	createdAt: new Date().toISOString(), updatedAt: null, text: 'Text', title: 'Title', imageUrl: null,
	icon: 'info', display: 'normal', forYou: false, silence: false, needConfirmationToRead: false,
};

function mount(interactive: boolean, enabled = true, overrides: Partial<Misskey.entities.Announcement> = {}) {
	root = document.createElement('div');
	document.body.appendChild(root);
	const update = vi.fn();
	app = createApp({ render: () => h(MkAnnouncementReactions, {
		announcement: { ...announcement, reactionsEnabled: enabled, ...overrides }, interactive, onUpdate: update,
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
	test('集計表示では操作ボタンを出さず、無効な場合は欄を表示しない', () => {
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
		let finish: (value: { reactions: Record<string, number>; myReaction: null; isRead: boolean }) => void;
		mocks.api.mockReturnValue(new Promise(resolve => { finish = resolve; }));
		root.querySelector('button')?.click();
		await nextTick();
		expect(mocks.api).toHaveBeenCalledWith('announcements/react', { announcementId: 'announcement', reaction: null });
		expect([...root.querySelectorAll('button')].every(b => b.disabled)).toBe(true);
		expect(update).not.toHaveBeenCalled();
		finish!({ isRead: true, reactions: { '👍': 1 }, myReaction: null });
		await Promise.resolve();
		await nextTick();
		expect(update).toHaveBeenCalledWith({ isRead: true, reactions: { '👍': 1 }, myReaction: null });
		expect([...root.querySelectorAll('button')].every(b => !b.disabled)).toBe(true);
	});

	test('ノートと同じピッカーで選択し、失敗したら表示を維持する', async () => {
		const update = mount(true);
		mocks.api.mockRejectedValue(new Error('Reactions disabled'));
		root.querySelector<HTMLButtonElement>('button[aria-label="Add reaction"]')?.click();
		const chosen = mocks.picker.mock.calls[0][2] as (reaction: string) => void;
		chosen('🎉');
		await Promise.resolve();
		await nextTick();
		expect(mocks.api).toHaveBeenCalledWith('announcements/react', { announcementId: 'announcement', reaction: '🎉' });
		expect(update).not.toHaveBeenCalled();
		expect(mocks.account).not.toHaveBeenCalled();
		expect(root.textContent).toContain('👍2');
		expect(root.querySelector('button')?.disabled).toBe(false);
	});

	test.each([true, false])('未読・確認必須のリアクションで確認し、取消=%sを反映する', async canceled => {
		const update = mount(true, true, { isRead: false, needConfirmationToRead: true, myReaction: null });
		mocks.confirm.mockResolvedValue({ canceled });
		mocks.api.mockResolvedValue({ reactions: { '👍': 3 }, myReaction: '👍', isRead: true });
		root.querySelector('button')?.click();
		await Promise.resolve();
		await Promise.resolve();
		await nextTick();
		expect(mocks.confirm).toHaveBeenCalledWith({ type: 'question', title: 'Read?', text: 'Reacting to Title marks it as read.' });
		if (canceled) {
			expect(mocks.api).not.toHaveBeenCalled();
			expect(update).not.toHaveBeenCalled();
			expect(mocks.account).not.toHaveBeenCalled();
		} else {
			expect(update).toHaveBeenCalledWith({ reactions: { '👍': 3 }, myReaction: '👍', isRead: true });
			expect(mocks.account).toHaveBeenCalledWith({ unreadAnnouncements: [{ id: 'other' }] });
		}
		expect(root.querySelector('button')?.disabled).toBe(false);
	});

	test.each([
		{ isRead: true, needConfirmationToRead: true, myReaction: null, reaction: '👍' },
		{ isRead: false, needConfirmationToRead: false, myReaction: null, reaction: '👍' },
		{ isRead: false, needConfirmationToRead: true, myReaction: '👍', reaction: null },
	])('既読・確認不要・取消では確認しない: %j', async ({ reaction, ...state }) => {
		mount(true, true, state);
		mocks.api.mockResolvedValue({ reactions: {}, myReaction: reaction, isRead: reaction != null });
		root.querySelector('button')?.click();
		await Promise.resolve();
		await nextTick();
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(mocks.api).toHaveBeenCalledWith('announcements/react', { announcementId: 'announcement', reaction });
	});
});

describe('announcement surfaces', () => {
	test('一覧から詳細に移動せず追加・取消し、既読と集計を表示に反映する', async () => {
		const target = { ...announcement, myReaction: null, isRead: false, needConfirmationToRead: true };
		mocks.fetch.mockResolvedValue([target]);
		mocks.confirm.mockResolvedValue({ canceled: false });
		mocks.api.mockResolvedValue({ reactions: { '👍': 3 }, myReaction: '👍', isRead: true });
		root = document.createElement('div');
		document.body.appendChild(root);
		app = createApp({ render: () => h(Announcements) });
		for (const component of ['PageWithHeader', 'MkA', 'Mfm', 'MkTime']) {
			app.component(component, { template: '<div><slot/></div>' });
		}
		app.mount(root);
		await vi.waitFor(() => expect(root.querySelector('button[aria-label="👍 (2)"]')).not.toBeNull());
		expect(root.textContent).not.toContain('Reacting marks this as read.');
		root.querySelector<HTMLButtonElement>('button[aria-label="👍 (2)"]')!.click();
		await vi.waitFor(() => expect(root.querySelector('button[aria-label="👍 (3)"]')?.getAttribute('aria-pressed')).toBe('true'));
		expect(mocks.api).toHaveBeenCalledWith('announcements/react', { announcementId: target.id, reaction: '👍' });
		expect(mocks.confirm).toHaveBeenCalledTimes(1);
		mocks.api.mockResolvedValue({ reactions: { '👍': 2 }, myReaction: null, isRead: true });
		root.querySelector<HTMLButtonElement>('button[aria-label="👍 (3)"]')!.click();
		await vi.waitFor(() => expect(root.querySelector('button[aria-label="👍 (2)"]')?.getAttribute('aria-pressed')).toBe('false'));
		expect(mocks.api).toHaveBeenLastCalledWith('announcements/react', { announcementId: target.id, reaction: null });

	});
});

test('管理画面の反応者一覧でユーザーと絵文字を対応させて表示する', async () => {
	mocks.fetch.mockResolvedValue([
		{ id: 'reaction-a', reaction: '👍', user: { id: 'alice', username: 'alice' } },
		{ id: 'reaction-b', reaction: '🎉', user: { id: 'bob', username: 'bob' } },
	]);
	root = document.createElement('div');
	document.body.appendChild(root);
	app = createApp({ render: () => h(MkAnnouncementReactionUsers, { announcementId: 'announcement' }) });
	app.component('MkA', { props: ['to'], template: '<a :href="to"><slot/></a>' });
	app.mount(root);
	await vi.waitFor(() => expect(root.textContent).toContain('alice👍'));
	expect(root.textContent).toContain('bob🎉');
	expect(mocks.fetch).toHaveBeenCalledWith('admin/announcements/reactions', expect.objectContaining({ announcementId: 'announcement' }));
	expect(root.querySelector('a')?.getAttribute('href')).toBe('/admin/user/alice');
});
