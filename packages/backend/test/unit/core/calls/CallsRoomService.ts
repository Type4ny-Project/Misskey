/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { isCallsRoomTransitionAllowed } from '@/core/calls/CallsRoomService.js';

describe('CallsRoomService lifecycle', () => {
	test.each([
		['scheduled', 'open'],
		['scheduled', 'cancelled'],
		['open', 'ended'],
	] as const)('allows %s -> %s', (from, to) => {
		expect(isCallsRoomTransitionAllowed(from, to)).toBe(true);
	});

	test.each([
		['scheduled', 'ended'],
		['open', 'cancelled'],
		['ended', 'open'],
		['cancelled', 'open'],
		['ended', 'ended'],
	] as const)('rejects terminal or invalid %s -> %s', (from, to) => {
		expect(isCallsRoomTransitionAllowed(from, to)).toBe(false);
	});
});
