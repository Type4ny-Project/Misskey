import { describe, expect, test } from 'vitest';
import * as lolex from '@sinonjs/fake-timers';
import { MemoryKVCache } from '@/misc/cache.js';

describe('MemoryKVCache', () => {
	test('garbage collects expired entries after a refreshed old entry', () => {
		const clock = lolex.install({ now: 0, shouldClearNativeTimers: true });
		const cache = new MemoryKVCache<string>(1000);

		try {
			cache.set('hot', 'a');
			clock.tick(100);
			cache.set('stale', 'b');
			clock.tick(950);
			cache.set('hot', 'c');
			clock.tick(100);

			cache.gc();

			expect(cache.get('hot')).toBe('c');
			expect(cache.get('stale')).toBeUndefined();
		} finally {
			cache.dispose();
			clock.uninstall();
		}
	});

	test('updates matching values without adding nested namespace entries', () => {
		const cache = new MemoryKVCache<{ id: string; name: string }>(1000);

		try {
			cache.set('https://remote.example/users/alice', { id: 'user-1', name: 'old' });

			cache.updateByValue(value => value.id === 'user-1', { id: 'user-1', name: 'new' });

			expect(cache.get('https://remote.example/users/alice')).toEqual({ id: 'user-1', name: 'new' });
			expect(Array.from(cache.entries)).toHaveLength(1);
		} finally {
			cache.dispose();
		}
	});

	test('deletes matching values without using logical keys', () => {
		const cache = new MemoryKVCache<{ id: string; name: string }>(1000);

		try {
			cache.set('https://remote.example/users/alice', { id: 'user-1', name: 'old' });

			cache.deleteByValue(value => value.id === 'user-1');

			expect(cache.get('https://remote.example/users/alice')).toBeUndefined();
			expect(Array.from(cache.entries)).toHaveLength(0);
		} finally {
			cache.dispose();
		}
	});
});
