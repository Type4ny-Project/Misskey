/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import { getAverageNotesPerDay } from '@/utility/average-notes-per-day.js';

const createdAt = '2026-10-01T00:00:00.000Z';
const created = Date.parse(createdAt);
const day = 86400000;

test.each([
	[0, 65], [1, 65], [day - 1, 65], [day, 65], [day + 1, 32.5],
	[2 * day, 32.5], [2 * day + 1, 21.7], [4 * day, 16.3],
])('rounds elapsed time %i ms up to whole days', (elapsed, expected) => {
	expect(getAverageNotesPerDay(65, createdAt, created + elapsed)).toBe(expected);
});

test('preserves zero notes and very large finite counts', () => {
	expect(getAverageNotesPerDay(0, createdAt, created)).toBe(0);
	expect(getAverageNotesPerDay(Number.MAX_VALUE, createdAt, created)).toBe(Number.MAX_VALUE);
});

test.each([-1, NaN, Infinity, -Infinity])('rejects invalid count %s', count => {
	expect(getAverageNotesPerDay(count, createdAt, created)).toBeNull();
});

test('rejects invalid dates, future registration and nonfinite current time', () => {
	expect(getAverageNotesPerDay(65, 'invalid', created)).toBeNull();
	expect(getAverageNotesPerDay(65, createdAt, created - 1)).toBeNull();
	expect(getAverageNotesPerDay(65, createdAt, NaN)).toBeNull();
});

test('samples the clock once per calculation', () => {
	const clock = vi.spyOn(Date, 'now').mockReturnValue(created + day);
	try {
		expect(getAverageNotesPerDay(65, createdAt)).toBe(65);
		expect(clock).toHaveBeenCalledTimes(1);
	} finally {
		clock.mockRestore();
	}
});
