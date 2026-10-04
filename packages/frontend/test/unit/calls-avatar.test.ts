/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { ref } from 'vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import { i18n } from '@/i18n.js';

const fixture = vi.hoisted(() => ({ roomId: null as any, popupMenu: vi.fn(), openCallsRoom: vi.fn() }));
vi.mock('@/composables/use-calls-user-room.js', () => ({ useCallsUserRoom: () => fixture.roomId }));
vi.mock('@/utility/calls-window.js', () => ({ openCallsRoom: fixture.openCallsRoom }));
vi.mock('@/os.js', () => ({ popupMenu: fixture.popupMenu }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { props: ['to'], template: '<a :href="to"><slot/></a>' } }));

const user = { id: 'alice', username: 'alice', host: null, avatarUrl: '/avatar.png', avatarBlurhash: null };
const options = {
	props: { user: user as never, link: true, callsIndicator: true },
	global: { directives: { 'user-preview': {} } },
};

beforeEach(() => {
	fixture.roomId = ref<string | null>('room');
	fixture.popupMenu.mockClear();
	fixture.openCallsRoom.mockClear();
});
afterEach(cleanup);

test('the whole live avatar offers profile and Calls destinations', async () => {
	const view = render(MkAvatar, options);
	const avatar = view.getByRole('button', { name: 'alice' });
	expect(avatar.getAttribute('aria-haspopup')).toBe('menu');
	await fireEvent.click(avatar);
	const [items, anchor] = fixture.popupMenu.mock.calls[0];
	expect(anchor).toBe(avatar);
	expect(items).toHaveLength(2);
	expect(items[0]).toMatchObject({ type: 'link', text: i18n.ts.profile, to: '/@alice' });
	expect(items[1].text).toBe(i18n.ts._calls.joinRoom);
	expect(fixture.openCallsRoom).not.toHaveBeenCalled();
	items[1].action();
	expect(fixture.openCallsRoom).toHaveBeenCalledWith('room');
});

test('an avatar without an active call keeps the profile link', async () => {
	fixture.roomId.value = null;
	const view = render(MkAvatar, options);
	const avatar = view.getByRole('link');
	expect(avatar.getAttribute('href')).toBe('/@alice');
	await fireEvent.click(avatar);
	expect(fixture.popupMenu).not.toHaveBeenCalled();
});
