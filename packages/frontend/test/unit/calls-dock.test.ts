/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick, ref } from 'vue';
import CallsDock from '@/ui/_common_/CallsDock.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const fixture = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/utility/calls-session.js', () => ({ useCallsSession: () => fixture.session }));
vi.mock('@/utility/calls-window.js', () => ({ callsWindowRoomId: null, openCallsRoom: vi.fn() }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { props: ['to'], template: '<a :href="to"><slot/></a>' } }));
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test.each([true, false])('collapses the dock while awaiting leave confirmation (cancelled: %s)', async canceled => {
	let respond!: (result: { canceled: boolean }) => void;
	const confirm = vi.spyOn(os, 'confirm').mockImplementation(() => new Promise(resolve => { respond = resolve; }));
	vi.spyOn(os, 'toast').mockImplementation(() => {});
	fixture.session = {
		elapsedTime: ref(null), isActive: ref(true), currentRoomId: ref('room'), room: ref({ title: 'Room', mode: 'open' }),
		participants: ref([]), usersById: ref(new Map()), myParticipant: ref(null), speakingParticipantIds: ref(new Set()),
		controls: ref({}), isHost: ref(false), isSpeaker: ref(false), joining: ref(false), leave: vi.fn().mockResolvedValue(undefined),
	};
	const view = render(CallsDock, { global: { stubs: {
		MkAvatar: true, MkUserName: true,
		MkCallsControls: { template: '<button @click="$emit(\'leave\')">Leave from panel</button>' },
	} } });
	const toggle = view.getByRole('button', { name: 'Room' });
	await fireEvent.click(toggle);
	expect(toggle.getAttribute('aria-expanded')).toBe('true');
	await fireEvent.click(view.getByRole('button', { name: 'Leave from panel' }));
	expect(confirm).toHaveBeenCalledWith({ type: 'warning', text: i18n.ts._calls.leaveRoom });
	expect(toggle.getAttribute('aria-expanded')).toBe('false');
	expect(view.queryByRole('button', { name: 'Leave from panel' })).toBeNull();
	expect(fixture.session.leave).not.toHaveBeenCalled();
	respond({ canceled });
	await nextTick();
	if (canceled) {
		expect(fixture.session.leave).not.toHaveBeenCalled();
		await fireEvent.click(toggle);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
	} else {
		await waitFor(() => expect(fixture.session.leave).toHaveBeenCalledOnce());
	}
});

test('speaker and listener rows link to their profiles', async () => {
	fixture.session = {
		elapsedTime: ref('03:12'), isActive: ref(true), currentRoomId: ref('room'), room: ref({ title: 'Room', mode: 'stage' }),
		participants: ref([{ id: 'speaker', userId: 'alice', role: 'speaker', isMuted: true, user: { id: 'alice', username: 'alice' } }, { id: 'listener', userId: 'bob', role: 'listener', user: { id: 'bob', username: 'bob' } }]),
		myParticipant: ref(null), speakingParticipantIds: ref(new Set()), controls: ref({}),
		isHost: ref(false), isSpeaker: ref(false), joining: ref(false),
	};
	const view = render(CallsDock, { global: { stubs: { MkAvatar: true, MkUserName: true, MkCallsControls: true } } });
	const toggle = view.getByRole('button', { name: /Room/ });
	expect(toggle.getAttribute('aria-expanded')).toBe('false');
	await fireEvent.click(toggle);
	expect(toggle.getAttribute('aria-expanded')).toBe('true');
	expect(view.getByRole('link', { name: 'alice' }).getAttribute('href')).toBe('/@alice');
	expect(view.getByRole('link', { name: 'bob' }).getAttribute('href')).toBe('/@bob');
	expect(view.getByTitle(i18n.ts._calls.elapsedTime).textContent).toContain('03:12');
	fixture.session.elapsedTime.value = '03:13';
	await nextTick();
	expect(view.getByTitle(i18n.ts._calls.elapsedTime).textContent).toContain('03:13');

	await fireEvent.click(toggle);
	expect(toggle.getAttribute('aria-expanded')).toBe('false');
	expect(view.queryByRole('link', { name: 'alice' })).toBeNull();
	await fireEvent.click(toggle);
	await fireEvent.pointerDown(document.body);
	expect(toggle.getAttribute('aria-expanded')).toBe('false');
	await fireEvent.click(toggle);
	await fireEvent.keyDown(toggle, { key: 'Escape' });
	expect(toggle.getAttribute('aria-expanded')).toBe('false');
});

test('prioritizes and counts unmuted speakers as mute state changes', async () => {
	const participants = [
		{ id: 'zed', userId: 'zed', role: 'host', isMuted: true },
		{ id: 'alice', userId: 'alice', role: 'speaker', isMuted: false },
		{ id: 'bob', userId: 'bob', role: 'speaker', isMuted: true },
		{ id: 'carol', userId: 'carol', role: 'speaker', isMuted: false },
		{ id: 'eve', userId: 'eve', role: 'listener', isMuted: true },
	].map(participant => ({ ...participant, user: { id: participant.userId, username: participant.userId } }));
	fixture.session = {
		elapsedTime: ref(null), isActive: ref(true), currentRoomId: ref('room'), room: ref({ title: 'Room', mode: 'stage' }),
		participants: ref(participants),
		myParticipant: ref(null), speakingParticipantIds: ref(new Set()), controls: ref({}),
		isHost: ref(false), isSpeaker: ref(false), joining: ref(false),
	};
	const view = render(CallsDock, { global: { stubs: { MkAvatar: true, MkUserName: true, MkCallsControls: true } } });
	await fireEvent.click(view.getByRole('button', { name: /Room/ }));
	const names = () => view.getAllByRole('link').map(element => element.getAttribute('aria-label'));
	expect(names()).toEqual(['alice', 'carol', 'zed', 'bob', 'eve']);
	expect(view.getByRole('button', { name: /Room/ }).textContent).toContain(i18n.tsx._calls.peopleWithMicrophoneOn({ count: 2 }));
	fixture.session.participants.value = participants.map(participant => participant.id === 'bob' ? { ...participant, isMuted: false } : participant);
	await nextTick();
	expect(names()).toEqual(['alice', 'bob', 'carol', 'zed', 'eve']);
	expect(view.getByRole('button', { name: /Room/ }).textContent).toContain(i18n.tsx._calls.peopleWithMicrophoneOn({ count: 3 }));
	expect(participants.map(participant => participant.id)).toEqual(['zed', 'alice', 'bob', 'carol', 'eve']);
	fixture.session.participants.value = participants.map(participant => ({ ...participant, isMuted: true }));
	await nextTick();
	expect(view.getByRole('button', { name: /Room/ }).textContent).toContain(i18n.tsx._calls.peopleWithMicrophoneOn({ count: 0 }));
});

test.each(['active', 'reconnect'])('%s dock reserves notification space until it disappears', async (state) => {
	let height = 60;
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height);
	let resize: () => void = () => {};
	const disconnect = vi.fn();
	vi.stubGlobal('ResizeObserver', class {
		constructor(callback: () => void) { resize = callback; }
		observe() {}
		disconnect = disconnect;
	});
	fixture.session = {
		elapsedTime: ref(null), isActive: ref(state === 'active'), currentRoomId: ref('room'), room: ref({ title: 'Room', mode: 'open' }),
		participants: ref([]), myParticipant: ref(null), speakingParticipantIds: ref(new Set()),
		controls: ref({}), isHost: ref(false), isSpeaker: ref(false), joining: ref(false),
		reconnectCandidate: ref(state === 'reconnect' ? { title: 'Room' } : null),
		reconnectRoomState: ref('open'), reconnectSecondsRemaining: ref(60),
	};
	const view = render(CallsDock, { global: { stubs: { MkAvatar: true, MkUserName: true, MkCallsControls: true } } });
	await nextTick();
	expect(document.body.style.getPropertyValue('--MI-callsDockSpacing')).toBe('calc(60px + var(--MI-margin))');

	if (state === 'active') {
		await fireEvent.click(view.getByRole('button', { name: /Room/ }));
		height = 300;
		resize();
		expect(document.body.style.getPropertyValue('--MI-callsDockSpacing')).toBe('calc(300px + var(--MI-margin))');
	}

	fixture.session.isActive.value = false;
	fixture.session.reconnectCandidate.value = null;
	await nextTick();
	expect(document.body.style.getPropertyValue('--MI-callsDockSpacing')).toBe('');
	expect(disconnect).toHaveBeenCalledOnce();
	view.unmount();
});
