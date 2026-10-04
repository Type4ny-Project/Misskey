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
		expect(init.body).toBeUndefined();
		expect(init.headers).not.toHaveProperty('Content-Type');
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

	test('rejects a top-level provider error even with HTTP 200', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ errorCode: 'session-not-found' }), { status: 200 })));
		await expect(new CloudflareRealtimeClient(config, telemetry as never).addTracks('session-a', [])).rejects.toMatchObject({ detail: { providerCode: 'session-not-found' } });
	});

	test('rejects a per-track close failure without treating HTTP 200 as completion', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ tracks: [{ mid: '1', errorCode: 'internal_error' }] }), { status: 200 })));
		await expect(new CloudflareRealtimeClient(config, telemetry as never).closeTracks('session-a', [{ mid: '1' }], true)).rejects.toMatchObject({ detail: { providerCode: 'internal_error' } });
	});

	test('treats HTTP 410 as already closed only when closing tracks', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('Session is gone', { status: 410 })));
		const client = new CloudflareRealtimeClient(config, telemetry as never);
		await expect(client.closeTracks('expired-session', [{ mid: '0' }], true)).resolves.toEqual({});
		expect(telemetry.providerOperation).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'close-tracks', status: 410, outcome: 'success' }));
		await expect(client.getSession('expired-session')).rejects.toMatchObject({ detail: { status: 410 } });
	});

	test('allows closing existing media after disabling Calls while rejecting new sessions', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tracks: [{ mid: '1' }] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		const client = new CloudflareRealtimeClient({ ...config, cloudflareRealtime: { ...config.cloudflareRealtime!, enabled: false } }, telemetry as never);
		await client.closeTracks('session-a', [{ mid: '1' }], true);
		await expect(client.createSession()).rejects.toThrow();
		expect(fetchMock).toHaveBeenCalledOnce();
	});
});
