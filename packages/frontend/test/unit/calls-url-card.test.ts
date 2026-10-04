/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { defineComponent, h } from 'vue';
import { url as local } from '@@/js/config.js';
import { getLocalCallsRoomId } from '@/utility/url-preview.js';
import MkUrlCallsCard from '@/components/MkUrlCallsCard.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';

const fixture = vi.hoisted(() => ({ api: vi.fn(), handlers: new Map<string, (event: any) => void>(), useChannel: vi.fn(), dispose: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api }));
vi.mock('@/i.js', () => ({ $i: { id: 'viewer' } }));
vi.mock('@/os.js', () => ({ popupMenu: vi.fn() }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { template: '<a><slot/></a>' } }));
vi.mock('@/utility/calls-window.js', () => ({ openCallsRoom: vi.fn() }));
vi.mock('@/stream.js', () => ({ useStream: () => ({
	state: 'connected',
	useChannel: fixture.useChannel.mockImplementation(() => ({
		on: (event: string, callback: (event: any) => void) => fixture.handlers.set(event, callback),
		dispose: fixture.dispose,
	})),
	on: vi.fn(), off: vi.fn(),
}) }));

const stubs = { MkLoading: true, MkAvatar: defineComponent({ props: ['user'], setup: props => () => h('img', { src: props.user.avatarUrl, alt: props.user.username }) }), MkUserName: defineComponent({ props: ['user'], setup: props => () => h('span', props.user.username) }) };
afterEach(() => { cleanup(); fixture.api.mockReset(); fixture.handlers.clear(); fixture.useChannel.mockClear(); fixture.dispose.mockClear(); });

describe('Calls URL cards', () => {
	test('recognizes only room links belonging to this instance', () => {
		expect(getLocalCallsRoomId(`${local}/calls/room-a?join=true`)).toBe('room-a');
		expect(getLocalCallsRoomId('/calls/room-a/')).toBe('room-a');
		expect(getLocalCallsRoomId('/calls')).toBeNull();
		expect(getLocalCallsRoomId('https://other.invalid/calls/room-a')).toBeNull();
	});

	test('loads the referenced room and renders the dedicated card', async () => {
		fixture.api.mockResolvedValue({ room: { id: 'room-a', title: 'Calls room', state: 'open', revision: 1 }, participants: [] });
		const view = render(MkUrlCallsCard, { props: { roomId: 'room-a' }, global: { stubs } });
		await waitFor(() => expect(view.getByText('Calls room')).toBeTruthy());
		expect(fixture.api).toHaveBeenCalledWith('calls/rooms/show', { roomId: 'room-a' });
		expect(fixture.api).toHaveBeenCalledTimes(1);
	});

	test('loads users with the room for five identical URL cards and shares participant updates', async () => {
		const participants = Array.from({ length: 30 }, (_, index) => ({ id: `participant-${index}`, userId: `user-${index}`, role: index === 0 ? 'host' : 'listener', state: 'active', user: { id: `user-${index}`, username: `user-${index}`, avatarUrl: `https://example.invalid/user-${index}.png`, isFollowing: false, isFollowed: false } }));
		const snapshot = { room: { id: 'shared-room', title: 'Shared call', state: 'open', revision: 1 }, participants };
		fixture.api.mockImplementation(async () => structuredClone(snapshot));
		const view = render(defineComponent({
			setup: () => () => h('div', Array.from({ length: 5 }, (_, index) => h(MkUrlCallsCard, { key: index, roomId: 'shared-room' }))),
		}), { global: { stubs } });
		await waitFor(() => expect(view.getAllByText('Shared call')).toHaveLength(5));
		expect(fixture.api.mock.calls.filter(([endpoint]) => endpoint === 'calls/rooms/show')).toHaveLength(1);
		expect(fixture.api).toHaveBeenCalledTimes(1);
		expect(fixture.useChannel).toHaveBeenCalledTimes(1);
		const newcomer = { id: 'new-participant', userId: 'new-user', role: 'listener', state: 'active', user: { id: 'new-user', username: 'New user', avatarUrl: 'https://example.invalid/new.png', isFollowing: true, isFollowed: true } };
		fixture.handlers.get('participant')?.({ sequence: 1, roomRevision: 2, participantId: newcomer.id, action: 'joined', participant: newcomer });
		await waitFor(() => expect(view.getAllByAltText('New user')).toHaveLength(5));
		expect(view.getAllByAltText('New user')[0].getAttribute('src')).toBe(newcomer.user.avatarUrl);
		const updated = { ...newcomer, user: { ...newcomer.user, username: 'Updated user', avatarUrl: 'https://example.invalid/updated.png' } };
		fixture.handlers.get('participant')?.({ sequence: 2, roomRevision: 3, participantId: newcomer.id, action: 'updated', participant: updated });
		await waitFor(() => expect(view.getAllByAltText('Updated user')).toHaveLength(5));
		expect(view.getAllByAltText('Updated user')[0].getAttribute('src')).toBe(updated.user.avatarUrl);
		fixture.handlers.get('participant')?.({ sequence: 3, roomRevision: 4, participantId: newcomer.id, action: 'left' });
		await waitFor(() => expect(view.queryByAltText('Updated user')).toBeNull());
		expect(fixture.api).toHaveBeenCalledTimes(1);
		view.unmount();
		expect(fixture.dispose).toHaveBeenCalledTimes(1);
	});

	test('loads five distinct rooms and fifty users in five requests without user profile requests', async () => {
		const roomIds = Array.from({ length: 5 }, (_, index) => `distinct-room-${index}`);
		fixture.api.mockImplementation(async (endpoint, params) => {
			if (endpoint !== 'calls/rooms/show') throw new Error(`Unexpected endpoint: ${endpoint}`);
			return {
				room: { id: params.roomId, title: params.roomId, state: 'open', revision: 1 },
				participants: Array.from({ length: 10 }, (_, index) => ({ id: `${params.roomId}-participant-${index}`, userId: `${params.roomId}-user-${index}`, role: index === 0 ? 'host' : 'listener', state: 'active', user: { id: `${params.roomId}-user-${index}`, username: `user-${index}`, avatarUrl: `https://example.invalid/${params.roomId}-${index}.png`, isFollowing: false, isFollowed: false } })),
			};
		});
		const view = render(defineComponent({
			setup: () => () => h('div', roomIds.map(roomId => h(MkUrlCallsCard, { key: roomId, roomId }))),
		}), { global: { stubs: { ...stubs, MkAvatar }, directives: { 'user-preview': {} } } });
		await waitFor(() => expect(view.getAllByRole('button')).toHaveLength(5));
		expect(fixture.api.mock.calls.filter(([endpoint]) => endpoint === 'calls/rooms/show')).toHaveLength(5);
		expect(fixture.api).toHaveBeenCalledTimes(5);
		expect(fixture.api.mock.calls.filter(([endpoint]) => endpoint === 'users/show')).toHaveLength(0);
		const avatars = view.container.querySelectorAll('img');
		expect(avatars).toHaveLength(25);
		for (const avatar of avatars) expect(avatar.getAttribute('src')).toMatch(/^https:\/\/example\.invalid\/distinct-room-\d-\d\.png$/);
		expect(fixture.useChannel).toHaveBeenCalledTimes(5);
		view.unmount();
		expect(fixture.dispose).toHaveBeenCalledTimes(5);
	});

	test('does not expose a room card when access is denied', async () => {
		fixture.api.mockRejectedValue({ code: 'CALLS_ACCESS_DENIED' });
		const view = render(MkUrlCallsCard, { props: { roomId: 'room-a' }, global: { stubs } });
		await waitFor(() => expect(view.container.querySelector('mk-loading-stub')).toBeNull());
		expect(view.queryByRole('button')).toBeNull();
		expect(view.getByRole('link').getAttribute('href')).toBe(`${local}/calls/room-a`);
	});
});
