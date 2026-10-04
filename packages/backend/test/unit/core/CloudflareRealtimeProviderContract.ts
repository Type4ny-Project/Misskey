/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	cloudflareRealtimeLimits,
	mapCloudflareRealtimeError,
} from '@/core/calls/CloudflareRealtimeProviderContract.js';

describe('CloudflareRealtimeProviderContract', () => {
	test('keeps the current provider limits explicit', () => {
		expect(cloudflareRealtimeLimits).toEqual({
			apiCallsPerSessionPerSecond: 50,
			tracksPerApiCall: 64,
			tracksPerSession: null,
			trackInactivityTimeoutSeconds: 30,
			connectedStateWaitTimeoutSeconds: 5,
		});
	});

	test('preserves an open-ended provider error code', () => {
		expect(mapCloudflareRealtimeError(503, {
			errorCode: 'future_provider_code',
			errorDescription: 'provider detail',
		})).toEqual({
			kind: 'provider-unavailable',
			status: 503,
			providerCode: 'future_provider_code',
			providerDescription: 'provider detail',
			retryable: true,
		});
	});

	test.each([
		[400, 'invalid-request', false],
		[401, 'authentication', false],
		[404, 'not-found', false],
		[408, 'provider-error', true],
		[429, 'rate-limited', true],
		[500, 'provider-unavailable', true],
	] as const)('maps HTTP %i to %s', (status, kind, retryable) => {
		expect(mapCloudflareRealtimeError(status)).toMatchObject({ kind, retryable });
	});
});
