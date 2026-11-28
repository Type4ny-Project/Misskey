/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { CacheService } from '@/core/CacheService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { CallsMediaRevocationService } from '@/core/calls/CallsMediaRevocationService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { AuthenticateService, AuthenticationError } from '@/server/api/AuthenticateService.js';
import RevokeTokenEndpoint from '@/server/api/endpoints/i/revoke-token.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiApp } from '@/models/App.js';

const FIVE_MINUTES = 1000 * 60 * 5;
const userId = 'user1';

function createAccessToken(override: Partial<MiAccessToken> = {}): MiAccessToken {
	return {
		id: 'token1',
		userId,
		appId: null,
		lastUsedAt: null,
		token: 'miauth-token',
		hash: 'miauth-token',
		permission: ['read:account'],
		...override,
	} as MiAccessToken;
}

describe('AuthenticateService (access token)', () => {
	let tokens: Map<string, MiAccessToken>;
	let accessTokensRepository: {
		findOne: ReturnType<typeof vi.fn>;
		findOneBy: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
	};
	let redisForSub: EventEmitter;
	let cacheService: CacheService;
	let service: AuthenticateService;

	// 他のプロセスで起きた失効が、Redis の購読経由で届いた状況を再現する
	function receiveInternalEvent(type: string, body: unknown): void {
		redisForSub.emit('message', 'internal', JSON.stringify({ channel: 'internal', message: { type, body } }));
	}

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

		tokens = new Map([['miauth-token', createAccessToken()]]);
		accessTokensRepository = {
			findOne: vi.fn(async ({ where }: { where: { hash?: string; token?: string }[] }) => {
				for (const w of where) {
					for (const t of tokens.values()) {
						if (t.hash === w.hash || t.token === w.token) return t;
					}
				}
				return null;
			}),
			findOneBy: vi.fn(async ({ id }: { id: string }) => [...tokens.values()].find(t => t.id === id) ?? null),
			update: vi.fn(async () => ({ affected: 1 })),
			delete: vi.fn(async ({ id }: { id: string }) => {
				for (const [k, t] of tokens) if (t.id === id) tokens.delete(k);
			}),
		};

		const user = { id: userId, isSuspended: false, host: null } as MiLocalUser;
		const usersRepository = { findOneBy: vi.fn(async () => user) };
		redisForSub = new EventEmitter();
		const anyMock = mock<never>();
		cacheService = new CacheService(
			anyMock, redisForSub as never, usersRepository as never,
			anyMock, anyMock, anyMock, anyMock, anyMock, anyMock,
		);

		const loggerService = mock<LoggerService>();
		loggerService.getLogger.mockReturnValue({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } as never);
		service = new AuthenticateService(
			usersRepository as never,
			accessTokensRepository as never,
			{ findOneByOrFail: vi.fn(async (): Promise<MiApp> => ({ id: 'app1', permission: ['read:account'] } as MiApp)) } as never,
			cacheService,
			loggerService,
		);
	});

	afterEach(() => {
		service.dispose();
		cacheService.dispose();
		vi.useRealTimers();
	});

	test('reads the token row once and reuses it for later requests', async () => {
		for (let i = 0; i < 5; i++) {
			const [user, token] = await service.authenticate('miauth-token');
			expect(user?.id).toBe(userId);
			expect(token?.permission).toEqual(['read:account']);
		}
		expect(accessTokensRepository.findOne).toHaveBeenCalledTimes(1);
	});

	test('rejects unknown tokens without caching the miss', async () => {
		await expect(service.authenticate('unknown')).rejects.toBeInstanceOf(AuthenticationError);
		await expect(service.authenticate('unknown')).rejects.toBeInstanceOf(AuthenticationError);
		expect(accessTokensRepository.findOne).toHaveBeenCalledTimes(2);
	});

	describe('lastUsedAt', () => {
		test('is not updated again within the throttle window', async () => {
			for (let i = 0; i < 10; i++) {
				await service.authenticate('miauth-token');
				vi.advanceTimersByTime(10_000); // 合計100秒 < 5分
			}
			expect(accessTokensRepository.update).toHaveBeenCalledTimes(1);
		});

		test('is updated again after the window passes', async () => {
			await service.authenticate('miauth-token');
			vi.advanceTimersByTime(FIVE_MINUTES + 1);
			await service.authenticate('miauth-token');
			expect(accessTokensRepository.update).toHaveBeenCalledTimes(2);
			const [criteria, values] = accessTokensRepository.update.mock.calls[1];
			expect(criteria.id).toBe('token1');
			expect(values.lastUsedAt).toEqual(new Date(Date.now()));
		});

		test('is not written when the stored value is already recent', async () => {
			tokens.set('miauth-token', createAccessToken({ lastUsedAt: new Date(Date.now() - 60_000) }));
			await service.authenticate('miauth-token');
			expect(accessTokensRepository.update).not.toHaveBeenCalled();
		});

		test('does not make the request fail or reject unhandled when the update fails', async () => {
			accessTokensRepository.update.mockRejectedValueOnce(new Error('db down'));
			await expect(service.authenticate('miauth-token')).resolves.toBeDefined();
			await vi.advanceTimersByTimeAsync(0);
		});
	});

	describe('revocation', () => {
		test('a revoked token is rejected right away on the same process', async () => {
			await service.authenticate('miauth-token');

			// i/revoke-token と同じ手順: 行を消し、キャッシュを消し、イベントを出す
			const globalEventService = mock<GlobalEventService>();
			const endpoint = new RevokeTokenEndpoint(
				accessTokensRepository as never,
				mock<CallsMediaRevocationService>(),
				cacheService,
				globalEventService,
			);
			const me = { id: userId } as MiLocalUser;
			await endpoint.exec({ tokenId: 'token1' }, me, null);

			expect(globalEventService.publishInternalEvent).toHaveBeenCalledWith('accessTokensRevoked', { userId });
			await expect(service.authenticate('miauth-token')).rejects.toBeInstanceOf(AuthenticationError);
		});

		test('a revoke on another process reaches this one through the internal event', async () => {
			await service.authenticate('miauth-token');
			tokens.clear(); // 別の Pod が DB から削除した
			// イベントが届くまでは、この Pod のキャッシュが残る (寿命は1分)
			receiveInternalEvent('accessTokensRevoked', { userId });
			await expect(service.authenticate('miauth-token')).rejects.toBeInstanceOf(AuthenticationError);
		});

		test('an event for another user leaves the cache alone', async () => {
			await service.authenticate('miauth-token');
			receiveInternalEvent('accessTokensRevoked', { userId: 'someone-else' });
			await service.authenticate('miauth-token');
			expect(accessTokensRepository.findOne).toHaveBeenCalledTimes(1);
		});

		test('deleting the account drops its cached tokens', async () => {
			await service.authenticate('miauth-token');
			tokens.clear();
			receiveInternalEvent('userChangeDeletedState', { id: userId, isDeleted: true });
			await expect(service.authenticate('miauth-token')).rejects.toBeInstanceOf(AuthenticationError);
		});

		test('a row read before a revoke is not cached after it', async () => {
			let release!: () => void;
			const gate = new Promise<void>(resolve => { release = resolve; });
			const row = tokens.get('miauth-token');
			accessTokensRepository.findOne.mockImplementationOnce(async () => {
				await gate; // DB から読んだ直後で止める
				return row;
			});

			const pending = service.authenticate('miauth-token');
			await vi.advanceTimersByTimeAsync(0);
			tokens.clear();
			receiveInternalEvent('accessTokensRevoked', { userId });
			release();
			await pending; // この1回は読み込み済みの行で通る

			await expect(service.authenticate('miauth-token')).rejects.toBeInstanceOf(AuthenticationError);
		});

		test('the cache expires on its own within a minute even if the event is lost', async () => {
			await service.authenticate('miauth-token');
			tokens.clear();
			vi.advanceTimersByTime(1000 * 60 + 1);
			await expect(service.authenticate('miauth-token')).rejects.toBeInstanceOf(AuthenticationError);
		});
	});

	test('suspended users still get the suspended user object (ApiCallService rejects them)', async () => {
		const suspended = { id: userId, isSuspended: true, host: null } as MiLocalUser;
		cacheService.localUserByIdCache.set(userId, suspended);
		const [user] = await service.authenticate('miauth-token');
		expect(user?.isSuspended).toBe(true);
	});
});
