/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { CallsMediaBindingService } from '@/core/calls/CallsMediaBindingService.js';

class ExpiringRedis {
	public now = 0;
	private values = new Map<string, { value: string | Set<string>; expiresAt: number }>();
	private read(key: string) {
		const entry = this.values.get(key);
		if (entry != null && entry.expiresAt <= this.now) {
			this.values.delete(key);
			return undefined;
		}
		return entry;
	}
	public async smembers(key: string) { return [...(this.read(key)?.value as Set<string> | undefined ?? [])]; }
	public async mget(keys: string[]) { return keys.map(key => this.read(key)?.value ?? null); }
	public pipeline() {
		const commands: Array<() => void> = [];
		return {
			set: (key: string, value: string, _mode: string, ttl: number) => commands.push(() => { this.values.set(key, { value, expiresAt: this.now + ttl }); }),
			sadd: (key: string, value: string) => commands.push(() => {
				let entry = this.read(key);
				if (entry == null) {
					entry = { value: new Set<string>(), expiresAt: Infinity };
					this.values.set(key, entry);
				}
				(entry.value as Set<string>).add(value);
			}),
			expire: (key: string, ttl: number) => commands.push(() => {
				const entry = this.read(key);
				if (entry != null) entry.expiresAt = this.now + ttl;
			}),
			exec: async () => { for (const command of commands) command(); },
		};
	}
}

describe('CallsMediaBindingService', () => {
	test('keeps a host discoverable past two minutes while heartbeats continue, then expires it', async () => {
		const redis = new ExpiringRedis();
		const service = new CallsMediaBindingService(redis as never, { gen: () => 'publication' } as never);
		const publication = await service.createPublication({
			roomId: 'room', participantId: 'host', connectionId: 'connection', generation: 1,
			applicationId: 'app', providerSessionId: 'session', providerTrackName: 'audio', providerMid: '0', mediaKind: 'audio',
		});
		for (const time of [60, 120, 180]) {
			redis.now = time;
			await service.heartbeat('room', 'host', 1);
		}
		expect(await service.listRoomPublications('room')).toEqual([publication]);
		redis.now = 301;
		expect(await service.listRoomPublications('room')).toEqual([]);
	});
});
