/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import type * as Redis from 'ioredis';
import type { Config } from '@/config.js';
import { CallsTurnCredentialStoreService } from '@/core/calls/CallsTurnCredentialStoreService.js';

class FakeRedis {
	public values = new Map<string, string>();
	public async get(key: string) { return this.values.get(key) ?? null; }
	public pipeline() {
		const operations: Array<() => void> = [];
		const pipeline = {
			set: (key: string, value: string) => { operations.push(() => this.values.set(key, value)); return pipeline; },
			del: (key: string) => { operations.push(() => this.values.delete(key)); return pipeline; },
			exec: async () => { operations.forEach(operation => operation()); return []; },
		};
		return pipeline;
	}
}

const config = { cloudflareRealtime: { enabled: true, appId: 'app', appSecret: 'secret', turn: { tokenId: 'turn-key', apiToken: 'turn-token', ttl: 60 } } } as Config;

describe('CallsTurnCredentialStoreService', () => {
	afterEach(() => vi.unstubAllGlobals());

	test('revokes a previous participant credential before registering its replacement', async () => {
		const redis = new FakeRedis();
		redis.values.set('calls:turn-participant:participant-a', 'old-user');
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetchMock);
		const service = new CallsTurnCredentialStoreService(config, redis as unknown as Redis.Redis);

		await service.register('new-user', 'participant-a', 'room-a', 'user-a', new Date(Date.now() + 60_000).toISOString(), 60);

		expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/credentials/old-user/revoke'), expect.anything());
		expect(redis.values.get('calls:turn-participant:participant-a')).toBe('new-user');
		expect(redis.values.has('calls:turn:old-user')).toBe(false);
	});

	test('removes local credential state even when provider revoke fails', async () => {
		const redis = new FakeRedis();
		redis.values.set('calls:turn:turn-user', '{}');
		redis.values.set('calls:turn-participant:participant-a', 'turn-user');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
		const service = new CallsTurnCredentialStoreService(config, redis as unknown as Redis.Redis);

		await expect(service.revokeUsername('turn-user', 'participant-a')).rejects.toThrow('network');
		expect(redis.values.has('calls:turn:turn-user')).toBe(false);
		expect(redis.values.has('calls:turn-participant:participant-a')).toBe(false);
	});
});
