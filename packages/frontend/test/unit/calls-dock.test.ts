/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { ref } from 'vue';
import CallsDock from '@/ui/_common_/CallsDock.vue';

const fixture = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/utility/calls-session.js', () => ({ useCallsSession: () => fixture.session }));
vi.mock('@/utility/calls-window.js', () => ({ callsWindowRoomId: null, openCallsRoom: vi.fn() }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { props: ['to'], template: '<a :href="to"><slot/></a>' } }));
afterEach(cleanup);

test('speaker and listener rows link to their profiles', async () => {
	fixture.session = {
		isActive: ref(true), currentRoomId: ref('room'), room: ref({ title: 'Room', mode: 'stage' }),
		participants: ref([{ id: 'speaker', userId: 'alice', role: 'speaker', isMuted: true }, { id: 'listener', userId: 'bob', role: 'listener' }]),
		usersById: ref(new Map([['alice', { id: 'alice', username: 'alice' }], ['bob', { id: 'bob', username: 'bob' }]])),
		myParticipant: ref(null), speakingParticipantIds: ref(new Set()), controls: ref({}),
		isHost: ref(false), isSpeaker: ref(false), joining: ref(false),
	};
	const view = render(CallsDock, { global: { stubs: { MkAvatar: true, MkUserName: true, MkCallsControls: true } } });
	await fireEvent.click(view.getByRole('button', { name: /Room/ }));
	expect(view.getByRole('link', { name: 'alice' }).getAttribute('href')).toBe('/@alice');
	expect(view.getByRole('link', { name: 'bob' }).getAttribute('href')).toBe('/@bob');
});
