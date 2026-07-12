/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type * as Redis from 'ioredis';
import { CallsEventService } from '@/core/calls/CallsEventService.js';

class SharedFakeRedis {
	private counters = new Map<string, number>();
	private sorted = new Map<string, Map<string, number>>();
	private locks = new Set<string>();
	public async incr(key: string) { const next = (this.counters.get(key) ?? 0) + 1; this.counters.set(key, next); return next; }
	public async zadd(key: string, score: number, member: string) { const set = this.sorted.get(key) ?? new Map(); set.set(member, score); this.sorted.set(key, set); return 1; }
	public async zrem(key: string, member: string) { return this.sorted.get(key)?.delete(member) ? 1 : 0; }
	public async zremrangebyscore(key: string, min: number, max: number) { const set = this.sorted.get(key); if (set == null) return 0; let removed = 0; for (const [member, score] of set) if (score >= min && score <= max) { set.delete(member); removed++; } return removed; }
	public async zrange(key: string) { return [...(this.sorted.get(key)?.entries() ?? [])].sort((a, b) => a[1] - b[1]).map(([member]) => member); }
	public async expire() { return 1; }
	public async set(key: string, _value: string, ...args: Array<string | number>) { if (args.includes('NX') && this.locks.has(key)) return null; this.locks.add(key); return 'OK'; }
}

describe('CallsEventService', () => {
	test('uses a shared monotonic sequence across server instances', async () => {
		const redis = new SharedFakeRedis();
		const globalEvents = { publishCallsRoomStream: vi.fn() };
		const first = new CallsEventService(redis as unknown as Redis.Redis, globalEvents as never);
		const second = new CallsEventService(redis as unknown as Redis.Redis, globalEvents as never);

		await first.publish('room-a', 3, 'mute', { participantId: 'participant-a', isMuted: true });
		await second.publish('room-a', 4, 'mute', { participantId: 'participant-a', isMuted: false });

		expect(globalEvents.publishCallsRoomStream.mock.calls.map(call => call[2].sequence)).toEqual([1, 2]);
		expect(globalEvents.publishCallsRoomStream.mock.calls.map(call => call[2].roomRevision)).toEqual([3, 4]);
	});

	test('coalesces a burst of speaking updates behind the distributed publish lock', async () => {
		const redis = new SharedFakeRedis();
		const globalEvents = { publishCallsRoomStream: vi.fn() };
		const service = new CallsEventService(redis as unknown as Redis.Redis, globalEvents as never);
		await service.reportSpeaking('room-a', 1, 'participant-a', true);
		await service.reportSpeaking('room-a', 1, 'participant-b', true);
		await service.reportSpeaking('room-a', 1, 'participant-a', false);

		// The distributed 250 ms lock permits one aggregate event for this burst.
		expect(globalEvents.publishCallsRoomStream).toHaveBeenCalledTimes(1);
		expect(globalEvents.publishCallsRoomStream).toHaveBeenCalledWith('room-a', 'speaking', expect.objectContaining({ participantIds: ['participant-a'] }));
	});
});
