/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { ref } from 'vue';
import MkCallsRoomWindow from '@/components/MkCallsRoomWindow.vue';

const fixture = vi.hoisted(() => ({ confirm: vi.fn(), session: null as any, connection: null as any }));
vi.mock('@/i.js', () => ({ $i: { id: 'viewer', policies: {} } }));
vi.mock('@/components/MkModal.vue', () => ({ default: { template: '<section><slot/></section>', methods: { close() {} } } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/os.js', () => ({ confirm: fixture.confirm, toast: vi.fn(), alert: vi.fn() }));
vi.mock('@/utility/calls-session.js', () => ({ useCallsSession: () => fixture.session }));
vi.mock('@/composables/use-calls-room.js', () => ({ createCallsRoomConnection: () => fixture.connection }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn().mockResolvedValue({ id: 'host', name: 'Host' }) }));

const stubs = {
	MkModal: { template: '<section><slot/></section>', methods: { close() {} } },
	MkButton: { template: '<button><slot/></button>' },
	MkInfo: true, MkAvatar: true, MkUserName: true, MkLoading: true, MkCallsControls: true, CallsVideo: true,
};

beforeEach(() => {
	fixture.confirm.mockReset().mockResolvedValue({ canceled: true });
	const room = { id: 'room', title: 'Another user’s room', state: 'open', mode: 'stage', revision: 1, moderatorUserIds: [] };
	const participants = [{ id: 'host-participant', userId: 'host', role: 'host', isMuted: true }];
	fixture.connection = { room: ref(room), participants: ref(participants), connected: ref(true), speakingParticipantIds: ref(new Set()), refresh: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() };
	fixture.session = {
		currentRoomId: ref(null), room: ref(room), participants: ref(participants), connected: ref(true), speakingParticipantIds: ref(new Set()),
		isActive: ref(false), joining: ref(false), videos: ref([]), screenWindowStream: ref(null), mediaState: ref('idle'), mediaFailure: ref(null),
		speakerRequestResult: ref(null), replacedRoomId: ref(null), needsAudioResume: ref(false), controls: ref({}),
		refresh: vi.fn().mockResolvedValue(undefined), prepareMicrophones: vi.fn(), join: vi.fn().mockResolvedValue(undefined),
	};
});
afterEach(cleanup);

describe('Calls participation confirmation', () => {
	test.each([true, false])('opening another user’s room joins only after consent (cancelled: %s)', async canceled => {
		let respond!: (result: { canceled: boolean }) => void;
		fixture.confirm.mockImplementation(() => new Promise(resolve => { respond = resolve; }));
		render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await waitFor(() => expect(fixture.confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'question', title: 'Another user’s room' })));
		expect(fixture.session.join).not.toHaveBeenCalled();
		expect(fixture.session.prepareMicrophones).not.toHaveBeenCalled();
		respond({ canceled });
		if (canceled) {
			await Promise.resolve();
			expect(fixture.session.join).not.toHaveBeenCalled();
		} else await waitFor(() => expect(fixture.session.join).toHaveBeenCalledWith('room', false, undefined, false));
	});

	test('reopening the current call does not ask to join again', async () => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await waitFor(() => expect(fixture.session.refresh).toHaveBeenCalled());
		expect(fixture.confirm).not.toHaveBeenCalled();
		expect(fixture.session.join).not.toHaveBeenCalled();
	});

	test('does not join if the room ends while confirmation is open', async () => {
		let respond!: (result: { canceled: boolean }) => void;
		fixture.confirm.mockImplementation(() => new Promise(resolve => { respond = resolve; }));
		render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await waitFor(() => expect(fixture.confirm).toHaveBeenCalled());
		fixture.connection.room.value.state = 'ended';
		respond({ canceled: false });
		await Promise.resolve();
		expect(fixture.session.join).not.toHaveBeenCalled();
	});
});
