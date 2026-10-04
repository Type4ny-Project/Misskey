/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import { CallsTurnService, isBrowserSafeCallsIceUrl } from '@/core/calls/CallsTurnService.js';

describe('CallsTurnService', () => {
	afterEach(() => vi.unstubAllGlobals());

	test('uses Cloudflare TURN server-side and removes browser-blocked port 53 URLs', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ iceServers: [{
			urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53', 'turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp'],
			username: 'short-lived-user', credential: 'short-lived-credential',
		}] }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
		vi.stubGlobal('fetch', fetch);
		const credentialStore = { register: vi.fn().mockResolvedValue(undefined), revokeUsername: vi.fn().mockResolvedValue(undefined) };
		const participants = { findOneBy: vi.fn().mockResolvedValue({ id: 'participant-a' }) };
		const rooms = { getRoom: vi.fn().mockResolvedValue({ id: 'room-a', state: 'open' }), assertCanAccess: vi.fn() };
		const config = { cloudflareRealtime: { turn: { tokenId: 'server-key-id', apiToken: 'server-api-token', ttl: 3600 } } } as Config;
		const service = new CallsTurnService(config, participants as never, rooms as never, credentialStore as never);

		const result = await service.issue({ id: 'user-a' } as never, 'room-a');

		expect(result.iceServers[0]?.urls).toEqual(['stun:stun.cloudflare.com:3478', 'turn:turn.cloudflare.com:3478?transport=udp']);
		expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/turn/keys/server-key-id/credentials/generate-ice-servers'), expect.objectContaining({
			headers: expect.objectContaining({ Authorization: 'Bearer server-api-token' }),
		}));
		expect(JSON.stringify(result)).not.toContain('server-api-token');
		expect(credentialStore.register).toHaveBeenCalledWith('short-lived-user', 'participant-a', 'room-a', 'user-a', expect.any(String), 3600);
	});

	test.each([
		['turn:turn.cloudflare.com:3478?transport=udp', true],
		['turns:turn.cloudflare.com:5349?transport=tcp', true],
		['turn:turn.cloudflare.com:53?transport=udp', false],
		['https://turn.cloudflare.com', false],
		['turn:user@turn.cloudflare.com:3478', false],
		['turn:turn.cloudflare.com:3478\nmalicious', false],
	] as const)('browser ICE URL filter %s -> %s', (url, expected) => {
		expect(isBrowserSafeCallsIceUrl(url)).toBe(expected);
	});

	test('revokes the short-lived Cloudflare TURN username', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetch);
		const credentialStore = { revokeUsername: vi.fn().mockResolvedValue(undefined) };
		const config = { cloudflareRealtime: { turn: { tokenId: 'server-key-id', apiToken: 'server-api-token', ttl: 3600 } } } as Config;
		const service = new CallsTurnService(config, {} as never, {} as never, credentialStore as never);

		await service.revoke('short-lived-user');

		expect(credentialStore.revokeUsername).toHaveBeenCalledWith('short-lived-user');
	});
});
