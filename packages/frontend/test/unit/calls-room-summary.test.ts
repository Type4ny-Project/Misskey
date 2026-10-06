/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import MkCallsRoomSummary from '@/components/MkCallsRoomSummary.vue';
import date from '@/filters/date.js';
import { i18n } from '@/i18n.js';

type RoomTimes = Pick<Misskey.entities.CallsRoom, 'startedAt' | 'endedAt'>;
const startedAt = '2026-10-02T23:58:30.000Z';

afterEach(cleanup);

describe('Calls room summary', () => {
	test('shows localized start and end date-times with semantic machine-readable timestamps', () => {
		const endedAt = '2026-10-03T00:03:45.000Z';
		const view = render(MkCallsRoomSummary, { props: { room: { startedAt, endedAt } } });
		const times = view.container.querySelectorAll('time');
		expect(times).toHaveLength(2);
		for (const [index, value] of [startedAt, endedAt].entries()) {
			expect(times[index].getAttribute('datetime')).toBe(value);
			expect(times[index].textContent).toBe(date(new Date(value)));
		}
		expect(view.getByText(i18n.ts._calls.startedAt).tagName).toBe('DT');
		expect(view.getByText(i18n.ts._calls.endedAt).tagName).toBe('DT');
		expect(view.getByText(i18n.ts._calls.totalDuration).tagName).toBe('DT');
		expect(view.getByText('05:15')).toBeTruthy();
		expect(view.queryByRole('heading')).toBeNull();
	});

	test.each([
		[0, '00:00'],
		[125, '02:05'],
		[3599, '59:59'],
		[3600, '01:00:00'],
		[3665, '01:01:05'],
		[90125, '25:02:05'],
		[360125, '100:02:05'],
	])('formats %i seconds without wrapping hours', (seconds, expected) => {
		const endedAt = new Date(Date.parse(startedAt) + seconds * 1000).toISOString();
		const view = render(MkCallsRoomSummary, { props: { room: { startedAt, endedAt } } });
		expect(view.getByText(expected)).toBeTruthy();
	});

	test.each([null, '', '   ', 'not-a-date', '2026-99-99T99:99:99Z'])('shows unknown for invalid or missing timestamp %s', value => {
		const view = render(MkCallsRoomSummary, { props: { room: { startedAt: value, endedAt: value } } });
		expect(view.getAllByText(i18n.ts.unknown)).toHaveLength(3);
		expect(view.container.querySelector('time')).toBeNull();
		expect(view.queryByText('00:00')).toBeNull();
	});

	test('tolerates omitted timestamps without using the current time or epoch', () => {
		const view = render(MkCallsRoomSummary, { props: { room: {} as RoomTimes } });
		expect(view.getAllByText(i18n.ts.unknown)).toHaveLength(3);
		expect(view.container.querySelector('time')).toBeNull();
	});

	test.each([
		{ startedAt, endedAt: null },
		{ startedAt: null, endedAt: startedAt },
		{ startedAt, endedAt: 'invalid' },
		{ startedAt: 'invalid', endedAt: startedAt },
	])('keeps the valid timestamp when only one timestamp is known', room => {
		const view = render(MkCallsRoomSummary, { props: { room } });
		expect(view.getAllByText(i18n.ts.unknown)).toHaveLength(2);
		expect(view.container.querySelectorAll('time')).toHaveLength(1);
		expect(view.container.querySelector('time')?.getAttribute('datetime')).toBe(startedAt);
	});

	test('shows unknown duration for reversed timestamps while retaining both dates', () => {
		const view = render(MkCallsRoomSummary, { props: { room: { startedAt, endedAt: '2026-10-02T23:58:29.999Z' } } });
		expect(view.getAllByText(i18n.ts.unknown)).toHaveLength(1);
		expect(view.container.querySelectorAll('time')).toHaveLength(2);
		expect(view.queryByText('00:00')).toBeNull();
	});

	test('updates the dates and duration when the authoritative room snapshot arrives', async () => {
		const view = render(MkCallsRoomSummary, { props: { room: { startedAt, endedAt: null } } });
		expect(view.getAllByText(i18n.ts.unknown)).toHaveLength(2);
		const room = { startedAt: '2026-10-02T23:55:00.000Z', endedAt: '2026-10-03T00:04:00.000Z' };
		await view.rerender({ room });
		expect(view.queryByText(i18n.ts.unknown)).toBeNull();
		expect(view.getByText('09:00')).toBeTruthy();
		expect(Array.from(view.container.querySelectorAll('time'), time => time.getAttribute('datetime'))).toEqual([room.startedAt, room.endedAt]);
	});
});
