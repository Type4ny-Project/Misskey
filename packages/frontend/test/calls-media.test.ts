/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { normalizeCallsMediaError, preferOpus } from '@/utility/calls-media-core.js';

describe('Calls media browser contract', () => {
	test('prefers Opus without removing RED, FEC, or auxiliary codecs', () => {
		const codecs = [
			{ mimeType: 'audio/red', clockRate: 48000 },
			{ mimeType: 'audio/PCMU', clockRate: 8000 },
			{ mimeType: 'audio/opus', clockRate: 48000 },
			{ mimeType: 'audio/CN', clockRate: 32000 },
		];
		const preferred = preferOpus(codecs);
		expect(preferred[0]?.mimeType).toBe('audio/opus');
		expect(new Set(preferred.map(codec => codec.mimeType))).toEqual(new Set(codecs.map(codec => codec.mimeType)));
	});

	test.each([
		['NotAllowedError', 'permission-denied'],
		['NotFoundError', 'device-not-found'],
		['OverconstrainedError', 'constraint-mismatch'],
		['NotReadableError', 'hardware-failure'],
	] as const)('normalizes %s', (name, expected) => {
		expect(normalizeCallsMediaError(new DOMException('test', name))).toBe(expected);
	});
});
