/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import MkCallsWatchTogether from '@/components/calls/MkCallsWatchTogether.vue';
import { youtubeVideoId } from '@/components/calls/youtube-player.js';
import { i18n } from '@/i18n.js';

const fixture = vi.hoisted(() => ({ handlers: new Map(), api: vi.fn(), dispose: vi.fn(), destroy: vi.fn(), play: vi.fn(), pause: vi.fn(), seek: vi.fn(), cue: vi.fn(), events: null as any }));
vi.mock('@/stream.js', () => ({ useStream: () => ({ useChannel: () => ({ on: (key: string, fn: unknown) => fixture.handlers.set(key, fn), dispose: fixture.dispose }), on: vi.fn(), off: vi.fn() }) }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api }));
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['type', 'disabled'], template: '<button :type="type ?? \'button\'" :disabled="disabled"><slot/></button>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<p><slot/></p>' } }));
vi.mock('@/components/calls/youtube-player.js', async importOriginal => ({
	...await importOriginal<typeof import('@/components/calls/youtube-player.js')>(),
	loadYouTubeAPI: async () => ({ Player: class {
		constructor(_element: HTMLElement, options: any) {
			fixture.events = options.events;
			const player = { cueVideoById: fixture.cue, playVideo: fixture.play, pauseVideo: fixture.pause, seekTo: fixture.seek, getCurrentTime: () => 0, getPlayerState: () => 2, getDuration: () => 300, setVolume: vi.fn(), destroy: fixture.destroy };
			queueMicrotask(() => options.events.onReady({ target: player }));
			return player;
		}
	} }),
}));
const room = { id: 'room', state: 'open' } as Misskey.entities.CallsRoom;
const state = () => ({ videoId: 'M7lc1UVf-VE', playing: true, position: 20, updatedAt: Date.now(), revision: 1, serverTime: Date.now() });
beforeEach(() => { vi.clearAllMocks(); fixture.handlers.clear(); fixture.api.mockResolvedValue(state()); });
afterEach(cleanup);

test.each([
	['https://www.youtube.com/watch?v=M7lc1UVf-VE', 'M7lc1UVf-VE'],
	['https://youtu.be/M7lc1UVf-VE?t=20', 'M7lc1UVf-VE'],
	['https://www.youtube.com/shorts/M7lc1UVf-VE', 'M7lc1UVf-VE'],
	['https://youtube.com.evil.example/watch?v=M7lc1UVf-VE', null],
	['javascript:alert(1)', null],
	['https://www.youtube.com/watch?v=invalid', null],
])('extracts only supported YouTube video URLs: %s', (url, id) => { expect(youtubeVideoId(url)).toBe(id); });

test('a viewer follows playback and seek events, has no shared controls, and releases the player', async () => {
	const view = render(MkCallsWatchTogether, { props: { room, canControl: false } });
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._watchTogether.startWatching })).toBeTruthy());
	expect(view.queryByRole('button', { name: i18n.ts._watchTogether.shareVideo })).toBeNull();
	expect(fixture.play).not.toHaveBeenCalled();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._watchTogether.startWatching }));
	await waitFor(() => expect(fixture.play).toHaveBeenCalled());
	expect(fixture.seek).toHaveBeenCalledWith(expect.any(Number), true);
	fixture.events.onAutoplayBlocked();
	await nextTick();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._watchTogether.allowPlayback }));
	expect(view.queryByRole('button', { name: i18n.ts._watchTogether.allowPlayback })).toBeNull();
	fixture.handlers.get('watchTogether')({ state: { ...state(), playing: false, position: 55, revision: 2 } });
	await nextTick();
	expect(fixture.seek).toHaveBeenLastCalledWith(55, true);
	fixture.handlers.get('watchTogether')({ state: { ...state(), videoId: 'dQw4w9WgXcQ', revision: 3 } });
	await nextTick();
	expect(fixture.cue).toHaveBeenCalledWith('dQw4w9WgXcQ');
	view.unmount();
	expect(fixture.destroy).toHaveBeenCalled();
	expect(fixture.dispose).toHaveBeenCalled();
	expect(fixture.api.mock.calls.every(([endpoint]) => endpoint === 'calls/watch-together/show')).toBe(true);
});

test('a controller shares canonical video IDs and sends play and seek with the current revision', async () => {
	const view = render(MkCallsWatchTogether, { props: { room, canControl: true } });
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._watchTogether.pause })).toBeTruthy());
	await fireEvent.update(view.getByLabelText(i18n.ts._watchTogether.videoUrl), 'https://youtu.be/dQw4w9WgXcQ');
	await fireEvent.submit(view.getByLabelText(i18n.ts._watchTogether.videoUrl).closest('form')!);
	expect(fixture.api).toHaveBeenCalledWith('calls/watch-together/update', { roomId: 'room', expectedRevision: 1, videoId: 'dQw4w9WgXcQ', playing: false, position: 0 });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._watchTogether.pause }));
	expect(fixture.api).toHaveBeenCalledWith('calls/watch-together/update', { roomId: 'room', expectedRevision: 1, playing: false });
	await fireEvent.update(view.getByLabelText(i18n.ts._watchTogether.position), '90');
	await fireEvent.submit(view.getByLabelText(i18n.ts._watchTogether.position).closest('form')!);
	expect(fixture.api).toHaveBeenCalledWith('calls/watch-together/update', { roomId: 'room', expectedRevision: 1, position: 90 });
});
