/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick, ref } from 'vue';
import { url } from '@@/js/config.js';
import MkCallsRoomWindow from '@/components/MkCallsRoomWindow.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import type { MenuButton } from '@/types/menu.js';

const fixture = vi.hoisted(() => ({ close: vi.fn(), confirm: vi.fn(), inputText: vi.fn(), session: null as any, connection: null as any, policies: { canJoinCalls: true } }));
vi.mock('@/i.js', () => ({ $i: { id: 'viewer', policies: fixture.policies } }));
vi.mock('@/components/MkModal.vue', () => ({ default: { emits: ['click', 'closed', 'esc'], template: '<section><slot/></section>', methods: { close() { fixture.close(); } } } }));
vi.mock('@/components/calls/MkCallsWatchTogether.vue', () => ({ default: { props: ['room', 'canControl'], template: '<div :data-can-control="canControl">Watch room: {{ room.id }}</div>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { props: ['to'], template: '<a :href="to"><slot/></a>' } }));
vi.mock('@/os.js', () => ({ confirm: fixture.confirm, inputText: fixture.inputText, toast: vi.fn(), alert: vi.fn(), popupMenu: vi.fn(), contextMenu: vi.fn() }));
vi.mock('@/utility/calls-session.js', () => ({ useCallsSession: () => fixture.session }));
vi.mock('@/composables/use-calls-room.js', () => ({ createCallsRoomConnection: () => fixture.connection }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn().mockResolvedValue({ id: 'host', username: 'host', name: 'Host' }) }));

const stubs = {
	MkModal: { emits: ['click', 'closed', 'esc'], template: '<section><slot/></section>', methods: { close() { fixture.close(); } } },
	MkButton: { template: '<button><slot/></button>' },
	MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
	MkInfo: true, MkAvatar: true, MkUserName: true, MkLoading: true, MkCallsControls: true, CallsVideo: true,
};

beforeEach(() => {
	fixture.policies.canJoinCalls = true;
	fixture.close.mockReset();
	fixture.confirm.mockReset().mockResolvedValue({ canceled: true });
	fixture.inputText.mockReset().mockResolvedValue({ canceled: false, result: ' New title ' });
	vi.mocked(os.toast).mockClear();
	vi.mocked(os.alert).mockClear();
	vi.mocked(os.popupMenu).mockClear();
	vi.mocked(os.contextMenu).mockClear();
	vi.mocked(misskeyApi).mockReset().mockResolvedValue({ roomRevision: 1, publications: [] } as never);
	const room = { id: 'room', attachment: { type: 'personal', ownerUserId: 'host' }, title: 'Another user’s room', state: 'open', mode: 'stage', revision: 1, moderatorUserIds: [] };
	const participants = [{ id: 'host-participant', userId: 'host', role: 'host', isMuted: true, user: { id: 'host', username: 'host', name: 'Host' } }];
	fixture.connection = { room: ref(room), participants: ref(participants), connected: ref(true), speakingParticipantIds: ref(new Set()), refresh: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() };
	fixture.session = {
		currentRoomId: ref(null), room: ref(room), participants: ref(participants), connected: ref(true), speakingParticipantIds: ref(new Set()),
		elapsedTime: ref(null), isActive: ref(false), joining: ref(false), videos: ref([]), screenWindows: new Map(), screenAudioIds: ref(new Set()), mediaState: ref('idle'), mediaFailure: ref(null),
		speakerRequestResult: ref(null), replacedRoomId: ref(null), needsAudioResume: ref(false), controls: ref({}),
		leave: vi.fn().mockResolvedValue(undefined), refresh: vi.fn().mockResolvedValue(undefined), prepareMicrophones: vi.fn(), join: vi.fn().mockResolvedValue(undefined),
		getParticipantVolume: vi.fn().mockReturnValue(100), setParticipantVolume: vi.fn(),
		getScreenVolume: vi.fn().mockReturnValue(100), setScreenVolume: vi.fn(),
	};
});
afterEach(cleanup);

describe('Calls room window', () => {
	test('the owner can control Watch Together without an audio connection', async () => {
		fixture.connection.room.value.attachment.ownerUserId = 'viewer';
		fixture.connection.participants.value = [];
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._calls.activities }));
		await fireEvent.click(view.getByRole('button', { name: new RegExp(i18n.ts._watchTogether.title) }));
		expect(view.getByText('Watch room: room').getAttribute('data-can-control')).toBe('true');
	});

	test('opens and closes the activity list inside the current call without leaving the session', async () => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		const open = vi.spyOn(window, 'open');
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		const activityButton = view.getByRole('button', { name: i18n.ts._calls.activities });
		await fireEvent.click(activityButton);
		expect(activityButton.getAttribute('aria-expanded')).toBe('true');
		expect(view.getByRole('button', { name: new RegExp(i18n.ts._watchTogether.title) })).toBeTruthy();
		expect(view.container.querySelector('mk-calls-controls-stub')).toBeTruthy();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.close }));
		expect(activityButton.getAttribute('aria-expanded')).toBe('false');
		expect(fixture.session.leave).not.toHaveBeenCalled();
		expect(fixture.session.join).not.toHaveBeenCalled();
		expect(open).not.toHaveBeenCalled();
		open.mockRestore();
	});

	test('keeps an opened activity mounted while the room changes to its end summary', async () => {
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._calls.activities }));
		const activities = view.getByRole('button', { name: new RegExp(i18n.ts._watchTogether.title) });
		fixture.connection.room.value = { ...fixture.connection.room.value, state: 'ended' };
		await nextTick();
		expect(view.getByRole('heading', { name: i18n.ts._calls.ended })).toBeTruthy();
		expect(view.getByRole('button', { name: new RegExp(i18n.ts._watchTogether.title) })).toBe(activities);
	});

	test('keeps an initially ended room open with its final timing and no join prompt', async () => {
		fixture.connection.room.value = null;
		fixture.connection.refresh.mockImplementation(async () => {
			fixture.connection.room.value = { id: 'room', title: 'Ended call', state: 'ended', moderatorUserIds: [], startedAt: '2026-10-04T23:30:00.000Z', endedAt: '2026-10-05T00:32:03.000Z' };
		});
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await waitFor(() => expect(view.getByText('01:02:03')).toBeTruthy());
		expect(view.getByRole('heading', { name: i18n.ts._calls.ended })).toBeTruthy();
		expect(view.container.querySelectorAll('time')).toHaveLength(2);
		expect(view.queryByRole('button', { name: i18n.ts._calls.joinRoom })).toBeNull();
		expect(view.queryByRole('complementary')).toBeNull();
		expect(fixture.close).not.toHaveBeenCalled();
		expect(fixture.confirm).not.toHaveBeenCalled();
		expect(fixture.session.prepareMicrophones).not.toHaveBeenCalled();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.close }));
		expect(fixture.close).toHaveBeenCalledOnce();
	});

	test('keeps the summary after an active session is cleared on room end', async () => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.elapsedTime.value = '00:10';
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		const endedRoom = { ...fixture.session.room.value, state: 'ended', startedAt: '2026-10-04T23:00:00.000Z', endedAt: '2026-10-05T00:02:03.000Z' };
		fixture.session.room.value = endedRoom;
		fixture.session.isActive.value = false;
		await nextTick();
		expect(view.getByText('01:02:03')).toBeTruthy();
		expect(fixture.close).not.toHaveBeenCalled();
		fixture.connection.room.value = null;
		fixture.connection.refresh.mockImplementation(async () => { fixture.connection.room.value = endedRoom; });
		fixture.session.room.value = null;
		fixture.session.currentRoomId.value = null;
		await waitFor(() => expect(view.getByText('01:02:03')).toBeTruthy());
		expect(view.queryByTitle(i18n.ts._calls.elapsedTime)).toBeNull();
		expect(fixture.close).not.toHaveBeenCalled();
		expect(fixture.session.join).not.toHaveBeenCalled();
	});

	test.each(['host', 'speaker'])('leaving as %s preserves only the room-end summary', async role => {
		fixture.confirm.mockResolvedValue({ canceled: false });
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.participants.value = [{ id: 'viewer-participant', userId: 'viewer', role, isMuted: true }];
		fixture.session.leave.mockImplementation(async () => {
			fixture.session.currentRoomId.value = null;
			fixture.session.isActive.value = false;
			fixture.connection.room.value = { ...fixture.connection.room.value, state: role === 'host' ? 'ended' : 'open', startedAt: '2026-10-04T23:00:00.000Z', endedAt: role === 'host' ? '2026-10-05T00:02:03.000Z' : null };
		});
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs: { ...stubs, MkCallsControls: { template: `<button @click="$emit('leave')">Leave call</button>` } } } });
		await fireEvent.click(view.getByRole('button', { name: 'Leave call' }));
		await waitFor(() => expect(fixture.session.leave).toHaveBeenCalledOnce());
		if (role === 'host') {
			expect(view.getByText('01:02:03')).toBeTruthy();
			expect(fixture.close).not.toHaveBeenCalled();
		} else {
			expect(fixture.close).toHaveBeenCalledOnce();
		}
	});

	test.each([true, false])('puts unmuted speakers first and updates their order (joined: %s)', async joined => {
		const participants = [
			{ id: 'zed', userId: 'zed', role: 'host', isMuted: true },
			{ id: 'alice', userId: 'alice', role: 'speaker', isMuted: false },
			{ id: 'bob', userId: 'bob', role: 'speaker', isMuted: true },
			{ id: 'carol', userId: 'carol', role: 'speaker', isMuted: false },
			{ id: 'eve', userId: 'eve', role: 'listener', isMuted: true },
		];
		const source = joined ? fixture.session : fixture.connection;
		source.participants.value = participants;
		if (joined) {
			fixture.session.currentRoomId.value = 'room';
			fixture.session.isActive.value = true;
		}
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		const names = () => Array.from(view.getByRole('complementary', { name: i18n.ts.users }).querySelectorAll('strong'), element => element.textContent);
		expect(names()).toEqual(['alice', 'carol', 'zed', 'bob', 'eve']);
		source.participants.value = participants.map(participant => participant.id === 'bob' ? { ...participant, isMuted: false } : participant);
		await nextTick();
		expect(names()).toEqual(['alice', 'bob', 'carol', 'zed', 'eve']);
		expect(participants.map(participant => participant.id)).toEqual(['zed', 'alice', 'bob', 'carol', 'eve']);
	});

	test.each(['voice tile', 'video tile', 'speaker link', 'listener link'])('right-clicking a %s opens the Calls menu for that participant', async surface => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.participants.value = [
			{ id: 'viewer-participant', userId: 'viewer', role: 'host', isMuted: false },
			{ id: 'other-participant', userId: 'other', role: surface === 'listener link' ? 'listener' : 'speaker', isMuted: false, user: { id: 'other', username: 'other' } },
		];
		if (surface === 'video tile') {
			fixture.session.videos.value = [{ id: 'camera', participantId: 'other-participant', source: 'camera', stream: new window.MediaStream() }];
		}
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs: {
			...stubs,
			MkA: { props: ['to'], template: '<a :href="to" @contextmenu.prevent.stop><slot/></a>' },
			CallsVideo: false,
		} } });
		await waitFor(() => expect(view.getByRole('link', { name: 'other' })).toBeTruthy());
		const stage = view.getByRole('region', { name: i18n.ts._calls.title });
		const target = surface === 'voice tile' ? stage.querySelector('mk-avatar-stub')!.parentElement! : surface === 'video tile' ? stage.querySelector('figure button')! : view.getByRole('link', { name: 'other' });
		const event = new PointerEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 80 });
		await fireEvent(target, event);
		expect(event.defaultPrevented).toBe(true);
		await waitFor(() => expect(os.contextMenu).toHaveBeenCalledOnce());
		expect(vi.mocked(os.contextMenu).mock.calls[0][1]).toBe(event);
		const menu = vi.mocked(os.contextMenu).mock.calls[0][0] as MenuButton[];
		expect(menu.map(item => item.text)).toContain(i18n.ts._calls.removeParticipant);
		await menu.find(item => item.text === i18n.ts._calls.assignVcModerator)!.action(new PointerEvent('click'));
		expect(misskeyApi).toHaveBeenCalledWith('calls/rooms/set-moderator', { roomId: 'room', participantId: 'other-participant', isModerator: true, expectedRevision: 1 });
		expect(os.popupMenu).not.toHaveBeenCalled();
	});

	test.each([true, false])('retries notifications only when a failed request committed the transfer (%s)', async committed => {
		fixture.confirm.mockResolvedValue({ canceled: false });
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.participants.value = [
			{ id: 'viewer-participant', userId: 'viewer', role: 'host', isMuted: false },
			{ id: 'listener-participant', userId: 'listener', role: 'listener', isMuted: true },
		];
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await fireEvent.click(view.getByRole('complementary', { name: i18n.ts.users }).querySelector('button')!);
		await waitFor(() => expect(os.popupMenu).toHaveBeenCalled());
		const menu = vi.mocked(os.popupMenu).mock.calls[0][0] as MenuButton[];
		vi.mocked(misskeyApi).mockRejectedValueOnce(new Error('Request failed'));
		fixture.session.refresh.mockImplementationOnce(async () => {
			if (!committed) return;
			fixture.session.room.value.revision = 2;
			fixture.session.participants.value = fixture.session.participants.value.map((participant: { role: string; userId: string }) => ({ ...participant, role: participant.userId === 'viewer' ? 'speaker' : 'host' }));
		});
		await menu.find(item => item.text === i18n.ts._calls.transferHost)!.action(new PointerEvent('click'));
		const calls = vi.mocked(misskeyApi).mock.calls.filter(([endpoint]) => endpoint === 'calls/rooms/transfer-host');
		expect(calls).toHaveLength(committed ? 2 : 1);
		for (const [, params] of calls) expect(params).toEqual({ roomId: 'room', participantId: 'listener-participant', expectedRevision: 1 });
		if (committed) expect(os.alert).not.toHaveBeenCalled();
		else expect(os.alert).toHaveBeenCalled();
	});

	test.each([false, true])('confirms host transfer to a listener (canceled: %s)', async canceled => {
		fixture.confirm.mockResolvedValue({ canceled });
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.participants.value = [
			{ id: 'viewer-participant', userId: 'viewer', role: 'host', isMuted: false },
			{ id: 'listener-participant', userId: 'listener', role: 'listener', isMuted: true },
		];
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await fireEvent.click(view.getByRole('complementary', { name: i18n.ts.users }).querySelector('button')!);
		await waitFor(() => expect(os.popupMenu).toHaveBeenCalled());
		const menu = vi.mocked(os.popupMenu).mock.calls[0][0] as MenuButton[];
		await menu.find(item => item.text === i18n.ts._calls.transferHost)!.action(new PointerEvent('click'));
		expect(fixture.confirm).toHaveBeenCalledWith({ type: 'warning', title: 'listener', text: i18n.ts._calls.transferHostConfirm });
		if (canceled) {
			expect(misskeyApi).not.toHaveBeenCalledWith('calls/rooms/transfer-host', expect.anything());
		} else {
			expect(vi.mocked(misskeyApi)).toHaveBeenCalledWith('calls/rooms/transfer-host', { roomId: 'room', participantId: 'listener-participant', expectedRevision: 1 });
			expect(fixture.session.refresh).toHaveBeenCalled();
		}
	});

	test('shows elapsed time only while participating in this room', async () => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.elapsedTime.value = '01:02:03';
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		expect(view.getByTitle(i18n.ts._calls.elapsedTime).textContent).toContain('01:02:03');
		fixture.session.elapsedTime.value = '01:02:04';
		await nextTick();
		expect(view.getByTitle(i18n.ts._calls.elapsedTime).textContent).toContain('01:02:04');
		fixture.session.isActive.value = false;
		await nextTick();
		expect(view.queryByTitle(i18n.ts._calls.elapsedTime)).toBeNull();
	});

	test.each(['scheduled', 'open'])('the host can change a %s room title from the menu', async state => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = state === 'open';
		fixture.session.room.value.state = state;
		fixture.session.participants.value = [{ id: 'viewer-participant', userId: 'viewer', role: 'host', isMuted: true }];
		fixture.session.refresh.mockImplementation(async () => {
			if (vi.mocked(misskeyApi).mock.calls.some(([endpoint]) => endpoint === 'calls/rooms/update-title')) fixture.session.room.value.title = 'New title';
		});
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.details }));
		const item = (vi.mocked(os.popupMenu).mock.calls[0][0] as MenuButton[]).find(item => item.text === i18n.ts._calls.changeTitle)!;
		await item.action(new PointerEvent('click'));
		expect(fixture.inputText).toHaveBeenCalledWith({ title: i18n.ts._calls.changeTitle, default: 'Another user’s room', minLength: 1, maxLength: 256 });
		expect(vi.mocked(misskeyApi)).toHaveBeenCalledWith('calls/rooms/update-title', { roomId: 'room', title: 'New title', expectedRevision: 1 });
		expect(view.getByRole('heading', { name: 'New title' })).toBeTruthy();
	});

	test.each(['cancelled', 'empty', 'unchanged'])('does not update the title when the input is %s', async reason => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.participants.value = [{ id: 'viewer-participant', userId: 'viewer', role: 'host', isMuted: true }];
		fixture.inputText.mockResolvedValue({ canceled: reason === 'cancelled', result: reason === 'empty' ? '   ' : fixture.session.room.value.title });
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.details }));
		await (vi.mocked(os.popupMenu).mock.calls[0][0][0] as MenuButton).action(new PointerEvent('click'));
		expect(vi.mocked(misskeyApi)).not.toHaveBeenCalledWith('calls/rooms/update-title', expect.anything());
	});

	test('a VC moderator has no room title menu', () => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.room.value.moderatorUserIds = ['viewer'];
		fixture.session.participants.value = [{ id: 'viewer-participant', userId: 'viewer', role: 'speaker', isMuted: true }];
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		expect(view.queryByRole('button', { name: i18n.ts.details })).toBeNull();
	});

	test('reports a failed title update and keeps the displayed title', async () => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.participants.value = [{ id: 'viewer-participant', userId: 'viewer', role: 'host', isMuted: true }];
		vi.mocked(misskeyApi).mockRejectedValue({ code: 'CALLS_STALE_REVISION' });
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.details }));
		await (vi.mocked(os.popupMenu).mock.calls[0][0][0] as MenuButton).action(new PointerEvent('click'));
		expect(os.alert).toHaveBeenCalledWith({ type: 'error', text: i18n.ts.somethingHappened });
		expect(view.getByRole('heading', { name: 'Another user’s room' })).toBeTruthy();
	});

	test.each(['host', 'moderator', 'host-without-media'])('the %s can mute a speaker and stop camera and screen separately', async actor => {
		if (actor !== 'host-without-media') {
			fixture.session.currentRoomId.value = 'room';
			fixture.session.isActive.value = true;
		}
		fixture.session.room.value.moderatorUserIds = actor === 'moderator' ? ['viewer'] : [];
		fixture.session.participants.value = [
			{ id: 'viewer-participant', userId: 'viewer', role: actor === 'moderator' ? 'listener' : 'host', isMuted: true },
			{ id: 'speaker-participant', userId: 'speaker', role: 'speaker', isMuted: false, user: { id: 'speaker', username: 'speaker', name: 'Speaker' } },
		];
		fixture.connection.participants.value = fixture.session.participants.value;
		vi.mocked(misskeyApi).mockResolvedValue({ roomRevision: 1, publications: ['camera', 'screen'].map(mediaSource => ({ id: mediaSource, participantId: 'speaker-participant', mediaKind: 'video', mediaSource })) } as never);
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await fireEvent.click(view.getByRole('complementary', { name: i18n.ts.users }).querySelector('button')!);
		await waitFor(() => expect(os.popupMenu).toHaveBeenCalled());
		expect(misskeyApi).toHaveBeenCalledWith('calls/media/reconcile', { roomId: 'room' });
		const menu = vi.mocked(os.popupMenu).mock.calls[0][0] as MenuButton[];
		fixture.confirm.mockClear().mockResolvedValue({ canceled: false });
		await menu.find(item => item.text === i18n.ts._calls.mute)!.action(new PointerEvent('click'));
		expect(vi.mocked(misskeyApi)).toHaveBeenCalledWith('calls/rooms/mute-participant', { roomId: 'room', participantId: 'speaker-participant', expectedRevision: 1 });
		await menu.find(item => item.text === i18n.ts._calls.stopCamera)!.action(new PointerEvent('click'));
		expect(vi.mocked(misskeyApi)).toHaveBeenCalledWith('calls/rooms/stop-participant-video', { roomId: 'room', participantId: 'speaker-participant', mediaSource: 'camera', expectedRevision: 1 });
		await menu.find(item => item.text === i18n.ts._calls.stopScreenSharing)!.action(new PointerEvent('click'));
		expect(vi.mocked(misskeyApi)).toHaveBeenCalledWith('calls/rooms/stop-participant-video', { roomId: 'room', participantId: 'speaker-participant', mediaSource: 'screen', expectedRevision: 1 });
		await menu.find(item => item.text === i18n.ts._calls.removeParticipant)!.action(new PointerEvent('click'));
		expect(misskeyApi).toHaveBeenCalledWith('calls/rooms/remove-participant', { roomId: 'room', participantId: 'speaker-participant', expectedRevision: 1 });
		expect(fixture.confirm.mock.calls.map(([options]) => options)).toEqual([
			{ type: 'warning', title: 'Speaker', text: i18n.ts._calls.muteParticipantConfirm },
			{ type: 'warning', title: 'Speaker', text: i18n.ts._calls.stopParticipantCameraConfirm },
			{ type: 'warning', title: 'Speaker', text: i18n.ts._calls.stopParticipantScreenSharingConfirm },
			{ type: 'warning', title: 'Speaker', text: i18n.ts._calls.removeParticipantConfirm },
		]);
		if (actor === 'moderator') expect(menu.map(item => item.text)).toEqual([i18n.ts._calls.mute, i18n.ts._calls.stopCamera, i18n.ts._calls.stopScreenSharing, i18n.ts._calls.removeParticipant]);
	});

	test.each(['mute', 'stopCamera', 'stopScreenSharing', 'removeParticipant'] as const)('waits for confirmation and cancels %s without a moderation API call', async action => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.room.value.moderatorUserIds = ['viewer'];
		fixture.session.participants.value = [
			{ id: 'viewer-participant', userId: 'viewer', role: 'listener', isMuted: true },
			{ id: 'speaker-participant', userId: 'speaker', role: 'speaker', isMuted: false },
		];
		vi.mocked(misskeyApi).mockResolvedValue({ roomRevision: 1, publications: ['camera', 'screen'].map(mediaSource => ({ id: mediaSource, participantId: 'speaker-participant', mediaKind: 'video', mediaSource })) } as never);
		let finish!: (result: { canceled: boolean }) => void;
		fixture.confirm.mockReturnValue(new Promise(resolve => { finish = resolve; }));
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await fireEvent.click(view.getByRole('complementary', { name: i18n.ts.users }).querySelector('button')!);
		await waitFor(() => expect(os.popupMenu).toHaveBeenCalled());
		const menu = vi.mocked(os.popupMenu).mock.calls[0][0] as MenuButton[];
		vi.mocked(misskeyApi).mockClear();
		const pending = menu.find(item => item.text === i18n.ts._calls[action])!.action(new PointerEvent('click'));
		expect(fixture.confirm).toHaveBeenCalledOnce();
		expect(misskeyApi).not.toHaveBeenCalled();
		finish({ canceled: true });
		await pending;
		expect(misskeyApi).not.toHaveBeenCalled();
	});

	test('an ordinary participant has no moderation menu', () => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.participants.value = [
			{ id: 'viewer-participant', userId: 'viewer', role: 'speaker', isMuted: false },
			{ id: 'other-participant', userId: 'other', role: 'speaker', isMuted: false },
		];
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		expect(view.getByRole('complementary', { name: i18n.ts.users }).querySelector('button')).toBeNull();
	});

	test.each([false, true])('hides video stop for absent sources with screen sharing %s', async hasScreen => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.room.value.moderatorUserIds = ['viewer'];
		fixture.session.participants.value = [
			{ id: 'viewer-participant', userId: 'viewer', role: 'listener', isMuted: true },
			{ id: 'speaker-participant', userId: 'speaker', role: 'speaker', isMuted: true },
		];
		vi.mocked(misskeyApi).mockResolvedValue({ roomRevision: 1, publications: hasScreen ? [{ id: 'screen', participantId: 'speaker-participant', mediaKind: 'video', mediaSource: 'screen' }] : [] } as never);
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.details }));
		await waitFor(() => expect(os.popupMenu).toHaveBeenCalled());
		expect((vi.mocked(os.popupMenu).mock.calls[0][0] as MenuButton[]).map(item => item.text)).toEqual([...(hasScreen ? [i18n.ts._calls.stopScreenSharing] : []), i18n.ts._calls.removeParticipant]);
	});

	test('does not prompt or offer to join when the role disallows participation', async () => {
		fixture.policies.canJoinCalls = false;
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await waitFor(() => expect(fixture.connection.refresh).toHaveBeenCalled());
		expect(fixture.confirm).not.toHaveBeenCalled();
		expect(fixture.session.join).not.toHaveBeenCalled();
		expect(view.queryByRole('button', { name: i18n.ts._calls.joinRoom })).toBeNull();
	});

	test('renders participant users without profile requests on mute updates', async () => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await nextTick();
		fixture.session.participants.value = fixture.session.participants.value.map((participant: typeof fixture.session.participants.value[number]) => ({ ...participant, isMuted: false }));
		await nextTick();
		expect(misskeyApi).not.toHaveBeenCalled();
	});

	test('recalculates the video grid when the stage is resized and disconnects on close', async () => {
		let resize!: ResizeObserverCallback;
		const disconnect = vi.fn();
		const observer = vi.spyOn(globalThis, 'ResizeObserver').mockImplementation(function (callback) {
			resize = callback;
			return { observe: vi.fn(), unobserve: vi.fn(), disconnect };
		});
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.videos.value = [{ id: 'video-1', participantId: 'host-participant' }, { id: 'video-2', participantId: 'host-participant' }];
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await waitFor(() => expect(resize).toBeTypeOf('function'));
		const grid = view.container.querySelector('[style*="grid-template-columns"]') as HTMLElement;
		resize([{ contentRect: { width: 1200, height: 600 } } as ResizeObserverEntry], {} as ResizeObserver);
		await waitFor(() => expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))'));
		expect(grid.style.gridTemplateRows).toBe('repeat(1, minmax(0, 1fr))');
		resize([{ contentRect: { width: 400, height: 1000 } } as ResizeObserverEntry], {} as ResizeObserver);
		await waitFor(() => expect(grid.style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))'));
		expect(grid.style.gridTemplateRows).toBe('repeat(2, minmax(0, 1fr))');
		view.unmount();
		expect(disconnect).toHaveBeenCalled();
		observer.mockRestore();
	});

	test('focus layout sizes the remaining four tiles using the actual row fractions', async () => {
		let resize!: ResizeObserverCallback;
		const observer = vi.spyOn(globalThis, 'ResizeObserver').mockImplementation(function (callback) {
			resize = callback;
			return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
		});
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.videos.value = Array.from({ length: 5 }, (_, index) => ({ id: `video-${index}`, participantId: 'host-participant' }));
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs: {
			...stubs,
			CallsVideo: { template: '<button aria-label="Focus video" @click="$emit(\'select\')"></button>' },
		} } });
		await waitFor(() => expect(resize).toBeTypeOf('function'));
		const grid = view.container.querySelector('[style*="grid-template-columns"]') as HTMLElement;
		resize([{ contentRect: { width: 750, height: 600 } } as ResizeObserverEntry], {} as ResizeObserver);
		for (const tile of grid.children) Object.assign(tile, { getAnimations: () => [] });
		await fireEvent.click(view.getAllByRole('button', { name: 'Focus video' })[0]);
		await waitFor(() => expect(grid.style.gridTemplateRows).toBe('minmax(0, 3fr) repeat(2, minmax(0, 1fr))'));
		expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
		observer.mockRestore();
	});

	test('copies the room link without joining or requiring host permissions', async () => {
		let finishCopy!: () => void;
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => new Promise<void>(resolve => { finishCopy = resolve; }));
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await waitFor(() => expect(fixture.confirm).toHaveBeenCalled());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.copyLink }));
		expect(writeText).toHaveBeenCalledWith(`${url}/calls/room`);
		expect(os.toast).not.toHaveBeenCalled();
		finishCopy();
		await waitFor(() => expect(os.toast).toHaveBeenCalledWith(i18n.ts.copiedToClipboard));
		expect(fixture.session.join).not.toHaveBeenCalled();
		writeText.mockRestore();
	});

	test('shows an error instead of a success notification when copying the link is denied', async () => {
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Clipboard denied', 'NotAllowedError'));
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.copyLink }));
		await waitFor(() => expect(os.alert).toHaveBeenCalledWith({ type: 'error', text: i18n.ts.somethingHappened }));
		expect(os.toast).not.toHaveBeenCalled();
		writeText.mockRestore();
	});

	test('a listener can adjust the host volume and has no volume control for themselves', async () => {
		fixture.session.currentRoomId.value = 'room';
		fixture.session.isActive.value = true;
		fixture.session.participants.value.push({ id: 'viewer-participant', userId: 'viewer', role: 'listener', isMuted: true });
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		const slider = view.getByRole('slider') as HTMLInputElement;
		expect(slider.value).toBe('100');
		await waitFor(() => expect(slider.getAttribute('aria-label')).toContain('Host'));
		expect(view.getByRole('link', { name: 'host' }).getAttribute('href')).toBe('/@host');
		expect(slider.closest('a')).toBeNull();
		await fireEvent.input(slider, { target: { value: '25' } });
		expect(fixture.session.setParticipantVolume).toHaveBeenCalledWith('host', 25);
		expect(view.getAllByRole('slider')).toHaveLength(1);
	});

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
