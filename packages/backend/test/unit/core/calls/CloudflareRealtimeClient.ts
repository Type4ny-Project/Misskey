/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import { CloudflareRealtimeClient } from '@/core/calls/CloudflareRealtimeClient.js';

const config = { cloudflareRealtime: { appId: 'app-id', appSecret: 'secret' } } as Config;

describe('CloudflareRealtimeClient', () => {
	afterEach(() => vi.unstubAllGlobals());

	test('creates a session with bearer auth without exposing the secret in the body', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionId: 'session-id' }), { status: 201 }));
		vi.stubGlobal('fetch', fetchMock);
		const result = await new CloudflareRealtimeClient(config).createSession();
		expect(result.sessionId).toBe('session-id');
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain('/apps/app-id/sessions/new');
		expect(init.headers).toMatchObject({ Authorization: 'Bearer secret' });
		expect(init.body).not.toContain('secret');
	});

	test('maps provider failures and preserves an unknown code', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ errorCode: 'future-code' }), { status: 503 })));
		await expect(new CloudflareRealtimeClient(config).getSession('session-id')).rejects.toMatchObject({
			detail: { kind: 'provider-unavailable', providerCode: 'future-code', retryable: true },
		});
	});
});
