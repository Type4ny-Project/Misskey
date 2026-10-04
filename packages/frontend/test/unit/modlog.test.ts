/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import locales from 'i18n';
import { updateI18n } from '@/i18n.js';
import ModLog from '@/pages/admin/modlog.ModLog.vue';
import type { ModerationLog } from 'misskey-js/entities.js';

vi.mock('@/components/MkFolder.vue', () => ({
	default: { template: '<div><slot name="label"/><slot name="icon"/><slot name="suffix"/><slot/></div>' },
}));
vi.mock('v-code-diff', () => ({ CodeDiff: { template: '<div/>' } }));

afterEach(cleanup);

const base = {
	id: 'log', userId: 'sender', createdAt: '2026-10-04T08:00:00Z',
	user: { id: 'sender', username: 'alice', host: 'remote.example' } as ModerationLog['user'],
};
const rule = { name: 'フォローのみ拒否', description: 'テスト用', condFormula: { id: 'follow', type: 'thisActivityIsFollow' }, action: { type: 'reject' } };

function renderLog(log: ModerationLog) {
	updateI18n(locales['ja-JP']);
	return render(ModLog, { props: { log }, global: { stubs: {
		MkA: { template: '<a><slot/></a>' },
		MkTime: { template: '<span/>' },
	} } });
}

describe('inbox moderation logs', () => {
	test('labels the rejected remote user as sender and shows activity and matched rule', () => {
		const view = renderLog({ ...base, type: 'inboxRejected', info: { activity: { type: 'Follow', object: 'https://local.example/users/bob' }, rule } } as ModerationLog);
		expect(view.container.textContent).toContain('受信アクティビティを拒否');
		expect(view.container.textContent).toContain('送信者: @alice@remote.example');
		expect(view.container.textContent).not.toContain('モデレーター:');
		expect(view.container.textContent).toContain('アクティビティ: Follow');
		expect(view.container.textContent).toContain('ルール名: フォローのみ拒否');
		expect(view.container.textContent).toContain('対象: https://local.example/users/bob');
	});

	test.each(['setInboxRule', 'deleteInboxRule'] as const)('shows %s with rule name and keeps the moderator label', (type) => {
		const view = renderLog({ ...base, type, info: { userId: base.userId, rule } } as ModerationLog);
		expect(view.container.textContent).toContain(type === 'setInboxRule' ? '受信ルールを追加' : '受信ルールを削除');
		expect(view.container.textContent).toContain('モデレーター:');
		expect(view.container.textContent).toContain('ルール名: フォローのみ拒否');
		expect(view.container.textContent).toContain('アクション: 拒否');
	});
});
