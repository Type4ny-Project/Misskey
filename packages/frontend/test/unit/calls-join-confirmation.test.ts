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

const fixture = vi.hoisted(() => ({ confirm: vi.fn(), inputText: vi.fn(), session: null as any, connection: null as any, policies: { canJoinCalls: true } }));
vi.mock('@/i.js', () => ({ $i: { id: 'viewer', policies: fixture.policies } }));
vi.mock('@/components/MkModal.vue', () => ({ default: { template: '<section><slot/></section>', methods: { close() {} } } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { props: ['to'], template: '<a :href="to"><slot/></a>' } }));
vi.mock('@/os.js', () => ({ confirm: fixture.confirm, inputText: fixture.inputText, toast: vi.fn(), alert: vi.fn(), popupMenu: vi.fn() }));
vi.mock('@/utility/calls-session.js', () => ({ useCallsSession: () => fixture.session }));
vi.mock('@/composables/use-calls-room.js', () => ({ createCallsRoomConnection: () => fixture.connection }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn().mockResolvedValue({ id: 'host', username: 'host', name: 'Host' }) }));

const stubs = {
	MkModal: { template: '<section><slot/></section>', methods: { close() {} } },
	MkButton: { template: '<button><slot/></button>' },
	MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
	MkInfo: true, MkAvatar: true, MkUserName: true, MkLoading: true, MkCallsControls: true, CallsVideo: true,
};

beforeEach(() => {
	fixture.policies.canJoinCalls = true;
	fixture.confirm.mockReset().mockResolvedValue({ canceled: true });
	fixture.inputText.mockReset().mockResolvedValue({ canceled: false, result: ' New title ' });
	vi.mocked(os.toast).mockClear();
	vi.mocked(os.alert).mockClear();
	vi.mocked(os.popupMenu).mockClear();
	vi.mocked(misskeyApi).mockReset().mockResolvedValue({ roomRevision: 1, publications: [] } as never);
	const room = { id: 'room', title: 'Another user’s room', state: 'open', mode: 'stage', revision: 1, moderatorUserIds: [] };
	const participants = [{ id: 'host-participant', userId: 'host', role: 'host', isMuted: true, user: { id: 'host', username: 'host', name: 'Host' } }];
	fixture.connection = { room: ref(room), participants: ref(participants), connected: ref(true), speakingParticipantIds: ref(new Set()), refresh: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() };
	fixture.session = {
		currentRoomId: ref(null), room: ref(room), participants: ref(participants), connected: ref(true), speakingParticipantIds: ref(new Set()),
		elapsedTime: ref(null), isActive: ref(false), joining: ref(false), videos: ref([]), screenWindows: new Map(), mediaState: ref('idle'), mediaFailure: ref(null),
		speakerRequestResult: ref(null), replacedRoomId: ref(null), needsAudioResume: ref(false), controls: ref({}),
		refresh: vi.fn().mockResolvedValue(undefined), prepareMicrophones: vi.fn(), join: vi.fn().mockResolvedValue(undefined),
		getParticipantVolume: vi.fn().mockReturnValue(100), setParticipantVolume: vi.fn(),
	};
});
afterEach(cleanup);

describe('Calls room window', () => {
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
			{ id: 'speaker-participant', userId: 'speaker', role: 'speaker', isMuted: false },
		];
		fixture.connection.participants.value = fixture.session.participants.value;
		vi.mocked(misskeyApi).mockResolvedValue({ roomRevision: 1, publications: ['camera', 'screen'].map(mediaSource => ({ id: mediaSource, participantId: 'speaker-participant', mediaKind: 'video', mediaSource })) } as never);
		const view = render(MkCallsRoomWindow, { props: { roomId: 'room' }, global: { stubs } });
		await fireEvent.click(view.getByRole('complementary', { name: i18n.ts.users }).querySelector('button')!);
		await waitFor(() => expect(os.popupMenu).toHaveBeenCalled());
		expect(misskeyApi).toHaveBeenCalledWith('calls/media/reconcile', { roomId: 'room' });
		const menu = vi.mocked(os.popupMenu).mock.calls[0][0] as MenuButton[];
		await menu.find(item => item.text === i18n.ts._calls.mute)!.action(new PointerEvent('click'));
		expect(vi.mocked(misskeyApi)).toHaveBeenCalledWith('calls/rooms/mute-participant', { roomId: 'room', participantId: 'speaker-participant', expectedRevision: 1 });
		await menu.find(item => item.text === i18n.ts._calls.stopCamera)!.action(new PointerEvent('click'));
		expect(vi.mocked(misskeyApi)).toHaveBeenCalledWith('calls/rooms/stop-participant-video', { roomId: 'room', participantId: 'speaker-participant', mediaSource: 'camera', expectedRevision: 1 });
		await menu.find(item => item.text === i18n.ts._calls.stopScreenSharing)!.action(new PointerEvent('click'));
		expect(vi.mocked(misskeyApi)).toHaveBeenCalledWith('calls/rooms/stop-participant-video', { roomId: 'room', participantId: 'speaker-participant', mediaSource: 'screen', expectedRevision: 1 });
		if (actor === 'moderator') expect(menu.map(item => item.text)).toEqual([i18n.ts._calls.mute, i18n.ts._calls.stopCamera, i18n.ts._calls.stopScreenSharing, i18n.ts._calls.removeParticipant]);
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
