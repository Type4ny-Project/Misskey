/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h } from 'vue';
import type * as Misskey from 'misskey-js';

const mocks = vi.hoisted(() => ({
	me: { current: { id: 'alice' } as { id: string } | null },
	storage: new Map<string, unknown>(),
	misskeyApi: vi.fn(),
	emit: vi.fn(),
}));

vi.mock('@/i.js', () => ({
	get $i() {
		return mocks.me.current;
	},
}));
vi.mock('@/utility/idb-proxy.js', () => ({
	get: vi.fn(async (key: string) => mocks.storage.get(key)),
	set: vi.fn(async (key: string, value: unknown) => { mocks.storage.set(key, value); }),
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.misskeyApi }));
vi.mock('@/events.js', () => ({ globalEvents: { emit: mocks.emit } }));

const { useEventTimingNotifier } = await import('@/composables/use-event-timing-notifier.js');

const FETCH_INTERVAL_MS = 5 * 60 * 1000;
const SHARED_KEY = 'event-timing-notifier:upcoming:alice';

let visibility: 'visible' | 'hidden' = 'visible';

function setVisibility(state: 'visible' | 'hidden') {
	visibility = state;
	document.dispatchEvent(new Event('visibilitychange'));
}

function makeEvent(id: string, startsInMs: number): Misskey.entities.Event {
	return {
		id,
		title: `title-${id}`,
		startAt: new Date(Date.now() + startsInMs).toISOString(),
		channel: null,
	} as unknown as Misskey.entities.Event;
}

/** 開いている1つのタブに相当する */
function openTab() {
	return render(defineComponent({
		setup() {
			useEventTimingNotifier();
			return () => h('div');
		},
	}));
}

async function flush() {
	await vi.advanceTimersByTimeAsync(0);
}

async function advance(ms: number) {
	await vi.advanceTimersByTimeAsync(ms);
}

describe('useEventTimingNotifier', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-28T00:00:00Z'));
		mocks.me.current = { id: 'alice' };
		mocks.storage.clear();
		mocks.misskeyApi.mockReset();
		mocks.emit.mockReset();
		mocks.misskeyApi.mockImplementation(async () => [makeEvent('e1', 60 * 1000)]);
		visibility = 'visible';
		Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.restoreAllMocks();
		Reflect.deleteProperty(navigator, 'locks');
	});

	test('fetches once on mount and shares the result with other tabs', async () => {
		openTab();
		await flush();

		expect(mocks.misskeyApi).toHaveBeenCalledTimes(1);
		expect(mocks.storage.get(SHARED_KEY)).toMatchObject({ fetchedAt: Date.now() });
	});

	test('a second tab opened within the interval reuses the result and still notifies a due event', async () => {
		const first = openTab();
		await flush();
		first.unmount();

		await advance(60 * 1000);
		openTab();
		await flush();
		expect(mocks.misskeyApi).toHaveBeenCalledTimes(1);

		// 開始時刻を過ぎたあとの30秒ごとの判定で通知される
		await advance(30 * 1000);
		expect(mocks.emit).toHaveBeenCalledWith('clientNotification', expect.objectContaining({
			body: expect.stringContaining('title-e1'),
		}));
	});

	test('does not fetch again when the tab becomes visible within the interval', async () => {
		openTab();
		await flush();

		setVisibility('hidden');
		await advance(60 * 1000);
		setVisibility('visible');
		await flush();

		expect(mocks.misskeyApi).toHaveBeenCalledTimes(1);
	});

	test('fetches when the tab becomes visible after the interval has passed', async () => {
		openTab();
		await flush();

		setVisibility('hidden');
		await advance(FETCH_INTERVAL_MS + 1000);
		expect(mocks.misskeyApi).toHaveBeenCalledTimes(1);
		setVisibility('visible');
		await flush();

		expect(mocks.misskeyApi).toHaveBeenCalledTimes(2);
	});

	test('does not fetch while hidden', async () => {
		openTab();
		await flush();
		setVisibility('hidden');
		await advance(FETCH_INTERVAL_MS * 3);
		expect(mocks.misskeyApi).toHaveBeenCalledTimes(1);
	});

	test('keeps fetching at the regular interval in a single visible tab', async () => {
		openTab();
		await flush();

		await advance(FETCH_INTERVAL_MS);
		expect(mocks.misskeyApi).toHaveBeenCalledTimes(2);
		await advance(FETCH_INTERVAL_MS);
		expect(mocks.misskeyApi).toHaveBeenCalledTimes(3);
	});

	test('notices a newly created event within the fetch interval', async () => {
		mocks.misskeyApi.mockImplementation(async () => []);
		openTab();
		await flush();
		expect(mocks.emit).not.toHaveBeenCalled();

		// 取得の間に作られ、すぐ始まるイベント
		mocks.misskeyApi.mockImplementation(async () => [makeEvent('new', 1000)]);
		await advance(FETCH_INTERVAL_MS);
		await advance(30 * 1000);

		expect(mocks.emit).toHaveBeenCalledWith('clientNotification', expect.objectContaining({
			body: expect.stringContaining('title-new'),
		}));
	});

	test.each([
		['a stale record', () => ({ fetchedAt: Date.now() - FETCH_INTERVAL_MS - 1000, events: [] })],
		['a record of the tab clock far in the future', () => ({ fetchedAt: Date.now() + 10 * 60 * 1000, events: [] })],
		['a record with a broken shape', () => ({ fetchedAt: 'now', events: 'none' })],
		['a non-object record', () => 'broken'],
	])('ignores %s and fetches', async (_, make) => {
		mocks.storage.set(SHARED_KEY, make());
		openTab();
		await flush();
		expect(mocks.misskeyApi).toHaveBeenCalledTimes(1);
	});

	test('does not use the record of another account', async () => {
		mocks.storage.set('event-timing-notifier:upcoming:bob', { fetchedAt: Date.now(), events: [] });
		openTab();
		await flush();
		expect(mocks.misskeyApi).toHaveBeenCalledTimes(1);
	});

	test('does nothing when signed out', async () => {
		mocks.me.current = null;
		openTab();
		await flush();
		expect(mocks.misskeyApi).not.toHaveBeenCalled();
	});

	test('does not share a failed fetch', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.misskeyApi.mockRejectedValue(new Error('network'));
		openTab();
		await flush();
		expect(mocks.storage.has(SHARED_KEY)).toBe(false);
	});

	test('runs the fetch under a Web Lock when available', async () => {
		const request = vi.fn(async (_name: string, task: () => Promise<unknown>) => await task());
		Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
		openTab();
		await flush();
		expect(request).toHaveBeenCalledWith('event-timing-notifier:fetch:alice', expect.any(Function));
		expect(mocks.misskeyApi).toHaveBeenCalledTimes(1);
	});
});
