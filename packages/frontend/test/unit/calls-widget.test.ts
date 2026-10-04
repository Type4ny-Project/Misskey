/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { ref } from 'vue';
import WidgetCalls from '@/widgets/WidgetCalls.vue';
import MkCallsRoomCard from '@/components/MkCallsRoomCard.vue';
import { i18n } from '@/i18n.js';

const fixture = vi.hoisted(() => ({ api: vi.fn(), handlers: new Map<string, () => void>(), dispose: vi.fn(), snapshot: null as any, open: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api }));
vi.mock('@/i.js', () => ({ $i: { id: 'viewer' } }));
vi.mock('@/widgets/widget.js', () => ({ useWidgetPropsManager: () => ({ widgetProps: { showHeader: true }, configure: vi.fn() }) }));
vi.mock('@/stream.js', () => ({ useStream: () => ({
	useChannel: () => ({ on: (event: string, callback: () => void) => fixture.handlers.set(event, callback), dispose: fixture.dispose }),
	on: vi.fn(), off: vi.fn(),
}) }));
vi.mock('@/composables/use-calls-room.js', () => ({ retainCallsRoomConnection: () => fixture.snapshot }));
vi.mock('@/utility/calls-window.js', () => ({ openCallsRoom: fixture.open }));

const room = { id: 'room', title: 'Compact call', state: 'open', mode: 'stage', visibility: 'public' };
beforeEach(() => {
	fixture.api.mockReset();
	fixture.handlers.clear();
	fixture.dispose.mockClear();
	fixture.open.mockClear();
	fixture.snapshot = {
		room: ref(room), participants: ref([{ id: 'host-p', userId: 'host', role: 'host', state: 'active', user: { id: 'host', name: 'Host' } }, { id: 'friend-p', userId: 'friend', role: 'listener', state: 'active', user: { id: 'friend', name: 'Friend', isFollowing: true } }]),
		speakingParticipantIds: ref(new Set()), load: vi.fn().mockResolvedValue(undefined), dispose: vi.fn(),
	};
	fixture.api.mockResolvedValue([room]);
});
afterEach(cleanup);

test('lists compact followed calls and removes them after an update', async () => {
	const view = render(WidgetCalls, { global: { stubs: {
		MkContainer: { template: '<section><slot name="header"/><slot/></section>' },
		MkCallsRoomCard: { props: { room: Object, compact: Boolean }, template: '<div data-testid="compact-call">{{ room.title }}:{{ compact }}</div>' },
		MkLoading: true, MkError: true,
	} } });
	await waitFor(() => expect(view.getByTestId('compact-call').textContent).toBe('Compact call:true'));
	expect(fixture.api).toHaveBeenCalledWith('calls/rooms/list', { limit: 10, states: ['open'], following: true });
	fixture.api.mockResolvedValue([]);
	fixture.handlers.get('updated')?.();
	await waitFor(() => expect(view.getByText(i18n.ts._calls.noFollowingRooms)).toBeTruthy());
	view.unmount();
	expect(fixture.dispose).toHaveBeenCalled();
});

test('compact cards omit room metadata and mark followed listeners', async () => {
	const view = render(MkCallsRoomCard, { props: { room: room as never, compact: true }, global: { stubs: {
		MkAvatar: true, MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' },
	} } });
	await waitFor(() => expect(view.getByText(i18n.ts._calls.followingParticipating)).toBeTruthy());
	expect(view.queryByText(i18n.ts._calls.live)).toBeNull();
	expect(view.queryByText(i18n.ts._calls.stageCall)).toBeNull();
	expect(view.queryByText(i18n.ts._calls.viewRoom)).toBeNull();
	view.getByRole('button').click();
	expect(fixture.open).toHaveBeenCalledWith('room');
});
