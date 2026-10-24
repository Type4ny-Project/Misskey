/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import MkNotification from '@/components/MkNotification.vue';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';

vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'recipient' }) }));
vi.mock('@/instance.js', () => ({ instance: { pointName: 'コイン' } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));
vi.mock('@/components/MkReactionIcon.vue', () => ({ default: { template: '<span/>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));

afterEach(cleanup);

test.each(['コイン', null])('shows the sender profile and received amount with point name %s', (pointName) => {
	instance.pointName = pointName;
	const notification = {
		id: 'gift', createdAt: '2026-10-06T00:00:00.000Z', type: 'pointReceived', points: 30,
		userId: 'sender', user: { id: 'sender', name: '贈り主', username: 'sender', host: null },
	} as Misskey.entities.Notification;
	const view = render(MkNotification, {
		props: { notification },
		global: {
			stubs: {
				MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
				MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' },
				MkAvatar: { props: ['user'], template: '<span :data-avatar-user="user.id"/>' },
			},
			directives: { 'user-preview': {} },
		},
	});

	expect(view.getByRole('link', { name: '贈り主' }).getAttribute('href')).toBe('/@sender');
	expect(view.container.querySelector('[data-avatar-user="sender"]')).not.toBeNull();
	expect(view.getByText(i18n.tsx._notification.pointReceived({ points: 30, pointName: pointName ?? i18n.ts.point }))).toBeTruthy();
});
