/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { url as local } from '@@/js/config.js';
import { getLocalCallsRoomId } from '@/utility/url-preview.js';
import MkUrlCallsCard from '@/components/MkUrlCallsCard.vue';

const fixture = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api }));
vi.mock('@/components/MkCallsRoomCard.vue', () => ({ default: {
	props: ['room'], template: '<div data-testid="calls-card">{{ room.title }}</div>',
} }));

afterEach(() => { cleanup(); fixture.api.mockReset(); });

describe('Calls URL cards', () => {
	test('recognizes only room links belonging to this instance', () => {
		expect(getLocalCallsRoomId(`${local}/calls/room-a?join=true`)).toBe('room-a');
		expect(getLocalCallsRoomId('/calls/room-a/')).toBe('room-a');
		expect(getLocalCallsRoomId('/calls')).toBeNull();
		expect(getLocalCallsRoomId('https://other.invalid/calls/room-a')).toBeNull();
	});

	test('loads the referenced room and renders the dedicated card', async () => {
		fixture.api.mockResolvedValue({ room: { id: 'room-a', title: 'Calls room' } });
		const view = render(MkUrlCallsCard, { props: { roomId: 'room-a' }, global: { stubs: { MkLoading: true } } });
		await waitFor(() => expect(view.getByTestId('calls-card').textContent).toBe('Calls room'));
		expect(fixture.api).toHaveBeenCalledWith('calls/rooms/show', { roomId: 'room-a' });
	});

	test('does not expose a room card when access is denied', async () => {
		fixture.api.mockRejectedValue({ code: 'CALLS_ACCESS_DENIED' });
		const view = render(MkUrlCallsCard, { props: { roomId: 'room-a' }, global: { stubs: { MkLoading: true } } });
		await waitFor(() => expect(view.container.querySelector('mk-loading-stub')).toBeNull());
		expect(view.queryByTestId('calls-card')).toBeNull();
		expect(view.getByRole('link').getAttribute('href')).toBe(`${local}/calls/room-a`);
	});
});
