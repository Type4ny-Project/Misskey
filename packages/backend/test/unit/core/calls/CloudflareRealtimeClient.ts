/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import { CloudflareRealtimeClient } from '@/core/calls/CloudflareRealtimeClient.js';

const config = { cloudflareRealtime: { enabled: true, appId: 'app-id', appSecret: 'secret' } } as Config;
const telemetry = { providerOperation: vi.fn() };

describe('CloudflareRealtimeClient', () => {
	afterEach(() => vi.unstubAllGlobals());

	test('creates a session with bearer auth without exposing the secret in the body', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionId: 'session-id' }), { status: 201 }));
		vi.stubGlobal('fetch', fetchMock);
		const result = await new CloudflareRealtimeClient(config, telemetry as never).createSession();
		expect(result.sessionId).toBe('session-id');
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain('/apps/app-id/sessions/new');
		expect(init.headers).toMatchObject({ Authorization: 'Bearer secret' });
		expect(init.body).not.toContain('secret');
	});

	test('preserves offer/answer negotiation and partial track errors from the provider contract', async () => {
		const providerResponse = {
			requiresImmediateRenegotiation: true,
			sessionDescription: { type: 'answer', sdp: 'provider-answer' },
			tracks: [
				{ location: 'local', mid: '0', trackName: 'audio-a' },
				{ location: 'local', mid: '1', errorCode: 'track-unavailable', errorDescription: 'fixture' },
			],
		};
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(providerResponse), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		const result = await new CloudflareRealtimeClient(config, telemetry as never).addTracks('session/id', [
			{ location: 'local', mid: '0', trackName: 'audio-a', kind: 'audio' },
		], { type: 'offer', sdp: 'browser-offer' });

		expect(result).toEqual(providerResponse);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain('/sessions/session%2Fid/tracks/new');
		expect(JSON.parse(init.body as string)).toMatchObject({
			sessionDescription: { type: 'offer', sdp: 'browser-offer' },
			tracks: [{ location: 'local', kind: 'audio' }],
		});
	});

	test('maps transport failures to a retryable provider-unavailable boundary without leaking request data', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('network failed', 'TimeoutError')));
		await expect(new CloudflareRealtimeClient(config, telemetry as never).renegotiate('session-a', { type: 'answer', sdp: 'private-sdp' })).rejects.toMatchObject({
			detail: { kind: 'provider-unavailable', status: 0, retryable: true },
		});
		expect(telemetry.providerOperation).toHaveBeenLastCalledWith(expect.not.objectContaining({ sdp: expect.anything() }));
	});

	test('maps provider failures and preserves an unknown code', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ errorCode: 'future-code' }), { status: 503 })));
		await expect(new CloudflareRealtimeClient(config, telemetry as never).getSession('session-id')).rejects.toMatchObject({
			detail: { kind: 'provider-unavailable', providerCode: 'future-code', retryable: true },
		});
	});
});
