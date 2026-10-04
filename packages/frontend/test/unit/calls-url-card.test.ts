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

const fixture = vi.hoisted(() => ({ api: vi.fn(), handlers: new Map<string, (event: any) => void>(), useChannel: vi.fn(), dispose: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api }));
vi.mock('@/i.js', () => ({ $i: { id: 'viewer' } }));
vi.mock('@/utility/calls-window.js', () => ({ openCallsRoom: vi.fn() }));
vi.mock('@/stream.js', () => ({ useStream: () => ({
	state: 'connected',
	useChannel: fixture.useChannel.mockImplementation(() => ({
		on: (event: string, callback: (event: any) => void) => fixture.handlers.set(event, callback),
		dispose: fixture.dispose,
	})),
	on: vi.fn(), off: vi.fn(),
}) }));

const stubs = { MkLoading: true, MkAvatar: true, MkUserName: true };
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

	test('loads one room and one batch of users for five identical URL cards and shares participant updates', async () => {
		const participants = Array.from({ length: 30 }, (_, index) => ({ id: `participant-${index}`, userId: `user-${index}`, role: index === 0 ? 'host' : 'listener', state: 'active' }));
		let snapshot = { room: { id: 'shared-room', title: 'Shared call', state: 'open', revision: 1 }, participants };
		fixture.api.mockImplementation(async (endpoint, params) => endpoint === 'calls/rooms/show' ? structuredClone(snapshot) : params.userIds.map((id: string) => ({ id, username: id })));
		const view = render(defineComponent({
			setup: () => () => h('div', Array.from({ length: 5 }, (_, index) => h(MkUrlCallsCard, { key: index, roomId: 'shared-room' }))),
		}), { global: { stubs } });
		await waitFor(() => expect(view.getAllByText('Shared call')).toHaveLength(5));
		await waitFor(() => expect(fixture.api.mock.calls.filter(([endpoint]) => endpoint === 'users/show')).toHaveLength(1));
		expect(fixture.api.mock.calls.filter(([endpoint]) => endpoint === 'calls/rooms/show')).toHaveLength(1);
		expect(fixture.useChannel).toHaveBeenCalledTimes(1);
		expect(fixture.api).toHaveBeenCalledWith('users/show', { userIds: participants.map(participant => participant.userId) });
		snapshot = { ...snapshot, room: { ...snapshot.room, revision: 2 }, participants: [...participants, { id: 'new-participant', userId: 'new-user', role: 'listener', state: 'active' }] };
		fixture.handlers.get('participant')?.({ sequence: 1, roomRevision: 2, participantId: 'new-participant', action: 'joined' });
		await waitFor(() => expect(fixture.api).toHaveBeenCalledWith('users/show', { userIds: ['new-user'] }));
		expect(fixture.api.mock.calls.filter(([endpoint]) => endpoint === 'calls/rooms/show')).toHaveLength(2);
		expect(fixture.api.mock.calls.filter(([endpoint]) => endpoint === 'users/show')).toHaveLength(2);
		view.unmount();
		expect(fixture.dispose).toHaveBeenCalledTimes(1);
	});

	test('does not expose a room card when access is denied', async () => {
		fixture.api.mockRejectedValue({ code: 'CALLS_ACCESS_DENIED' });
		const view = render(MkUrlCallsCard, { props: { roomId: 'room-a' }, global: { stubs } });
		await waitFor(() => expect(view.container.querySelector('mk-loading-stub')).toBeNull());
		expect(view.queryByRole('button')).toBeNull();
		expect(view.getByRole('link').getAttribute('href')).toBe(`${local}/calls/room-a`);
	});
});
