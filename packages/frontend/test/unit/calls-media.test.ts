/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { normalizeCallsMediaError, normalizeCallsStats, preferOpus } from '@/utility/calls-media-core.js';

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
		['TimeoutError', 'permission-pending'],
	] as const)('normalizes %s', (name, expected) => {
		expect(normalizeCallsMediaError(new DOMException('test', name))).toBe(expected);
	});

	test('normalizes stats fields shared by Chrome and Firefox without candidate addresses', () => {
		const values = [
			{ type: 'codec', mimeType: 'audio/opus' },
			{ type: 'local-candidate', candidateType: 'relay', protocol: 'udp', address: '192.0.2.1' },
			{ type: 'outbound-rtp', bytesSent: 2000, packetsLost: 2 },
			{ type: 'remote-inbound-rtp', roundTripTime: 0.08, jitter: 0.01 },
			{ type: 'media-source', audioLevel: 0.2 },
		];
		const report = { forEach(callback: (value: Record<string, unknown>) => void) { values.forEach(callback); } };

		expect(normalizeCallsStats(report, 1000, 1)).toEqual({
			codec: 'audio/opus', candidateType: 'relay', protocol: 'udp', bitrate: 8000,
			packetsLost: 2, jitter: null, roundTripTime: 0.08, audioLevel: 0.2,
			reconnectReason: null, recoveryTimeMs: null,
		});
		expect(normalizeCallsStats(report)).not.toHaveProperty('address');
	});

	test('attaches normalized reconnect cause and recovery duration without raw network data', () => {
		const report = { forEach() {} };
		expect(normalizeCallsStats(report, 0, 1, { reason: 'disconnected', recoveryTimeMs: 1234 })).toMatchObject({ reconnectReason: 'disconnected', recoveryTimeMs: 1234 });
	});
});
