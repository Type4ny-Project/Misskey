/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { Response } from 'node-fetch';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiNote } from '@/models/Note.js';
import { EmojiSuggestionService, normalizeEmojiSuggestionNoteText } from '@/core/EmojiSuggestionService.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { LoggerService } from '@/core/LoggerService.js';
import type { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import type { MetaService } from '@/core/MetaService.js';

describe('EmojiSuggestionService', () => {
	function createMeta(overrides: Partial<MiMeta> = {}): MiMeta {
		return {
			emojiSuggestionEnabled: true,
			emojiSuggestionEndpoint: 'https://suggest.example.invalid/v1/suggest',
			emojiSuggestionApiKey: 'fixture-api-key',
			emojiSuggestionTimeoutMs: 300,
			emojiSuggestionMaxSuggestions: 8,
			...overrides,
		} as MiMeta;
	}

	function createNote(overrides: Partial<MiNote> = {}): MiNote {
		return {
			id: 'note-fixture',
			fileIds: [],
			text: 'fixture public text @alice https://example.invalid :ablobcat:',
			cw: null,
			tags: [],
			visibility: 'public',
			localOnly: false,
			...overrides,
		} as MiNote;
	}

	function createService(meta: MiMeta, send = vi.fn()) {
		const logInfo = vi.fn();
		const metaService = {
			fetch: vi.fn(async () => meta),
		} as unknown as MetaService;
		const httpRequestService = {
			send,
		} as unknown as HttpRequestService;
		const loggerService = {
			getLogger: vi.fn(() => ({ info: logInfo, warn: vi.fn() })),
		} as unknown as LoggerService;
		const config = {
			url: 'https://misskey.example.test',
			host: 'misskey.example.test',
		} as Config;

		const files = { packManyByIds: vi.fn(async (_ids: string[]): Promise<Array<{ url: string; type: string; isSensitive: boolean }>> => []) };
		return {
			files,
			service: new EmojiSuggestionService(config, metaService, httpRequestService, loggerService, { get: vi.fn(async () => null), set: vi.fn() } as never, files as unknown as DriveFileEntityService),
			send,
			logInfo,
		};
	}

	function jsonResponse(body: unknown, status = 200): Response {
		return new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json' },
		});
	}

	function workerResponse(overrides: Record<string, unknown> = {}) {
		return {
			schemaVersion: 'emoji-suggest-worker-response-v1',
			items: [
				{ name: 'ablobgoodnightreverse', score: 0.92, aliases: ['goodnight'], category: 'blob' },
			],
			source: 'live',
			reason: null,
			emojiIndexVersion: 'emoji-index-fixture-v1',
			modelVersion: '@cf/pfnet/plamo-embedding-1b',
			timings: { kvReadMs: 0, embeddingMs: 1, vectorizeMs: 1, totalMs: 2 },
			...overrides,
		};
	}

	test('calls Worker for all note visibilities regardless of localOnly', async () => {
		const send = vi.fn(async () => jsonResponse(workerResponse()));
		const { service, logInfo } = createService(createMeta(), send);

		const publicResult = await service.suggestForNote(createNote());
		expect(publicResult).toMatchObject({
			items: [{ name: 'ablobgoodnightreverse' }],
		});
		expect(publicResult).not.toHaveProperty('source');
		expect(publicResult).not.toHaveProperty('modelVersion');
		expect(publicResult).not.toHaveProperty('emojiIndexVersion');
		expect(send).toHaveBeenCalledTimes(1);
		expect(readLastLogEvent(logInfo)).toMatchObject({
			event: 'emoji_suggestion_request',
			outcome: 'success',
			source: 'live',
			fallbackReason: null,
			workerStatus: 200,
			workerAuthStatus: 'accepted',
			cacheStatus: 'miss',
			resultCount: 1,
			maxResults: 8,
			modelVersion: '@cf/pfnet/plamo-embedding-1b',
			emojiIndexVersion: 'emoji-index-fixture-v1',
		});
		expect(readLastLogEvent(logInfo).normalizedTextHmacPrefix).toMatch(/^[0-9a-f]{12}$/);

		const body = JSON.parse((send.mock.calls[0] as unknown as [string, { body: string }])[1].body) as { normalizedText: string; instanceId: string; eligibility: { visibility: string; localOnly: boolean }; maxResults: number; deadlineMs: number; modelVersion?: string; emojiIndexVersion?: string; budgetMode?: string };
		expect(body.instanceId).toBe('misskey.example.test');
		expect(body.eligibility).toEqual({ visibility: 'public', localOnly: false });
		expect(body.maxResults).toBe(8);
		expect(body.deadlineMs).toBe(300);
		expect(body.modelVersion).toBeUndefined();
		expect(body.emojiIndexVersion).toBeUndefined();
		expect(body.budgetMode).toBeUndefined();
		expect(body.normalizedText).not.toContain('https://example.invalid');
		expect(body.normalizedText).toContain('@user');

		await expect(service.suggestForNote(createNote({ localOnly: true }))).resolves.toMatchObject({
			items: [{ name: 'ablobgoodnightreverse' }],
		});
		expect(send).toHaveBeenCalledTimes(2);
		const localOnlyBody = JSON.parse((send.mock.calls[1] as unknown as [string, { body: string }])[1].body) as { eligibility: { visibility: string; localOnly: boolean } };
		expect(localOnlyBody.eligibility).toEqual({ visibility: 'public', localOnly: true });

		await expect(service.suggestForNote(createNote({ visibility: 'home' }))).resolves.toMatchObject({
			items: [{ name: 'ablobgoodnightreverse' }],
		});
		expect(send).toHaveBeenCalledTimes(3);
		const homeBody = JSON.parse((send.mock.calls[2] as unknown as [string, { body: string }])[1].body) as { eligibility: { visibility: string; localOnly: boolean } };
		expect(homeBody.eligibility).toEqual({ visibility: 'home', localOnly: false });

		for (const note of [
			createNote({ visibility: 'followers' }),
			createNote({ visibility: 'specified' }),
		]) {
			await expect(service.suggestForNote(note)).resolves.toMatchObject({
				items: [{ name: 'ablobgoodnightreverse' }],
			});
		}

		expect(send).toHaveBeenCalledTimes(5);
	});

	test('emits redacted backend observability for cache hit, auth failure, and timeout', async () => {
		const forbidden = [
			'fixture public text',
			'fixture-api-key',
			'note-fixture',
			'@alice',
			'https://example.invalid',
		];

		const cacheSend = vi.fn(async () => jsonResponse(workerResponse({ source: 'cache' })));
		const cacheHarness = createService(createMeta(), cacheSend);
		await expect(cacheHarness.service.suggestForNote(createNote())).resolves.toMatchObject({ items: [{ name: 'ablobgoodnightreverse' }] });
		expect(readLastLogEvent(cacheHarness.logInfo)).toMatchObject({
			outcome: 'success',
			source: 'cache',
			cacheStatus: 'hit',
			workerAuthStatus: 'accepted',
			resultCount: 1,
		});
		expectLogToOmit(readLastLogJson(cacheHarness.logInfo), forbidden);

		const authSend = vi.fn(async () => jsonResponse({ ok: false }, 401));
		const authHarness = createService(createMeta(), authSend);
		await expect(authHarness.service.suggestForNote(createNote())).resolves.toMatchObject({ reason: 'workerUnauthorized' });
		expect(readLastLogEvent(authHarness.logInfo)).toMatchObject({
			outcome: 'fallback',
			fallbackReason: 'workerUnauthorized',
			workerStatus: 401,
			workerAuthStatus: 'rejected',
		});
		expectLogToOmit(readLastLogJson(authHarness.logInfo), forbidden);

		const timeoutSend = vi.fn(async () => { throw new Error('aborted'); });
		const timeoutHarness = createService(createMeta(), timeoutSend);
		await expect(timeoutHarness.service.suggestForNote(createNote())).resolves.toMatchObject({ reason: 'timeout' });
		expect(readLastLogEvent(timeoutHarness.logInfo)).toMatchObject({
			outcome: 'fallback',
			fallbackReason: 'timeout',
			workerStatus: null,
			workerAuthStatus: 'not_attempted',
		});
		expectLogToOmit(readLastLogJson(timeoutHarness.logInfo), forbidden);
	});

	test('returns fallback without Worker call when config is disabled or incomplete', async () => {
		for (const meta of [
			createMeta({ emojiSuggestionEnabled: false }),
			createMeta({ emojiSuggestionEndpoint: null }),
			createMeta({ emojiSuggestionApiKey: null }),
		]) {
			const send = vi.fn();
			const { service } = createService(meta, send);

			await expect(service.suggestForNote(createNote())).resolves.toMatchObject({
				items: [],
			});
			expect(send).not.toHaveBeenCalled();
		}
	});

	test('returns fallback on Worker timeout, auth failure, server failure, and malformed response', async () => {
		for (const send of [
			vi.fn(async () => { throw new Error('aborted'); }),
			vi.fn(async () => jsonResponse({ error: 'unauthorized' }, 401)),
			vi.fn(async () => jsonResponse({ error: 'unavailable' }, 500)),
			vi.fn(async () => jsonResponse(workerResponse({ items: [{ name: 1 }] }))),
		]) {
			const { service } = createService(createMeta(), send);

			await expect(service.suggestForNote(createNote())).resolves.toMatchObject({
				items: [],
			});
			expect(send).toHaveBeenCalledTimes(1);
		}
	});

	test('uses the configured HTTP endpoint for suggestions and emoji sync', async () => {
		const send = vi.fn(async (_url: string) => jsonResponse(workerResponse()));
		const { service } = createService(createMeta({ emojiSuggestionEndpoint: 'http://suggest.example.invalid/v1/suggest' }), send);
		await service.suggestForNote(createNote());
		expect(send.mock.calls[0]?.[0]).toBe('http://suggest.example.invalid/v1/suggest');
		await service.syncEmoji({ host: null, name: 'hello', aliases: [], category: null, publicUrl: 'https://files.example/hello.png' } as never);
		expect(send.mock.calls[1]?.[0]).toBe('http://suggest.example.invalid/v1/emojis');
	});

	test('filters proxied Worker suggestions below the minimum score', async () => {
		const send = vi.fn(async () => jsonResponse(workerResponse({
			items: [
				{ name: 'below-threshold', score: 0.39, aliases: ['below'], category: 'fixture' },
				{ name: 'threshold-ok', score: 0.4, aliases: ['threshold'], category: 'fixture' },
			],
		})));
		const { service, logInfo } = createService(createMeta(), send);

		await expect(service.suggestForNote(createNote({ visibility: 'home' }))).resolves.toMatchObject({
			items: [{ name: 'threshold-ok', score: 0.4 }],
		});
		expect(send).toHaveBeenCalledTimes(1);
		expect(readLastLogEvent(logInfo)).toMatchObject({ resultCount: 1 });
	});

	test('reuses cached results but invalidates them for edited notes', async () => {
		const send = vi.fn(async () => jsonResponse(workerResponse()));
		const { service, files } = createService(createMeta(), send);
		const cache = new Map<string, string>();
		Object.assign(service, { redisClient: {
			get: vi.fn(async (key: string) => cache.get(key) ?? null),
			set: vi.fn(async (key: string, value: string) => cache.set(key, value)),
		} });
		await Promise.all([service.suggestForNote(createNote()), service.suggestForNote(createNote())]);
		await service.suggestForNote(createNote());
		expect(send).toHaveBeenCalledTimes(1);
		expect([...cache.keys()]).toEqual(['emoji-suggestion:v2:note-fixture:0']);
		expect(files.packManyByIds).toHaveBeenCalledTimes(1);
		await service.suggestForNote(createNote({ text: 'changed 🤯', updatedAt: new Date('2026-10-22T00:00:00Z') }));
		expect(send).toHaveBeenCalledTimes(2);
	});

	test('forwards one eligible image and excludes sensitive images and CW attachments', async () => {
		const send = vi.fn(async (url: string) => url.includes('/media.png') ? new Response(Buffer.from([1, 2, 3])) : jsonResponse(workerResponse()));
		const { service, files } = createService(createMeta(), send);
		const image = { url: 'https://files.example/media.png', type: 'image/png', isSensitive: false };
		files.packManyByIds.mockResolvedValue([image]);
		await service.suggestForNote(createNote({ text: null, fileIds: ['image1'] }));
		expect(files.packManyByIds).toHaveBeenCalledWith(['image1']);
		const request = JSON.parse((send.mock.calls[1] as unknown as [string, { body: string }])[1].body);
		expect(request.image).toBe('data:image/png;base64,AQID');
		send.mockClear();
		files.packManyByIds.mockClear();
		await service.suggestForNote(createNote({ cw: 'summary', fileIds: ['image1'] }));
		expect(files.packManyByIds).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0]?.[0]).not.toBe(image.url);
		send.mockClear();
		files.packManyByIds.mockResolvedValue([{ ...image, isSensitive: true }]);
		await service.suggestForNote(createNote({ fileIds: ['image1'] }));
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0]?.[0]).not.toBe(image.url);
	});

	test('preserves inline emoji tokens for image interpretation', () => {
		expect(normalizeEmojiSuggestionNoteText(createNote({ text: ':mi_kke: :hieltu: 🤯' }))).toBe(':mi_kke: :hieltu: 🤯');
	});

	test('syncs local emojis only when enabled and does not break creation on upstream failure', async () => {
		const send = vi.fn(async () => jsonResponse({ accepted: true }));
		const { service } = createService(createMeta(), send);
		const emoji = { id: 'emoji', name: 'hello', aliases: [], category: null, publicUrl: 'https://files.prismisskey.space/hello.png', host: null };
		await service.syncEmoji(emoji as never);
		expect(send).toHaveBeenCalledWith('https://suggest.example.invalid/v1/emojis', expect.objectContaining({ timeout: 1000 }));
		await service.syncEmoji({ ...emoji, host: 'remote.test' } as never);
		expect(send).toHaveBeenCalledTimes(1);
		const disabled = createService(createMeta({ emojiSuggestionEnabled: false }), send);
		await disabled.service.syncEmoji(emoji as never);
		expect(send).toHaveBeenCalledTimes(1);
		send.mockRejectedValueOnce(new Error('offline'));
		await expect(service.syncEmoji(emoji as never)).resolves.toBeUndefined();
	});

	test('normalizes cw notes without exposing hidden body text', () => {
		const normalized = normalizeEmojiSuggestionNoteText(createNote({
			cw: 'fixture cw @alice https://example.invalid',
			text: 'hidden body must not be sent',
			tags: ['fixtureTag'],
		}));

		expect(normalized).toContain('fixture cw @user');
		expect(normalized).toContain('#fixtureTag');
		expect(normalized).not.toContain('hidden body');
		expect(normalized).not.toContain('https://example.invalid');
	});

	test('uses renote source text when the reaction target has no body text', async () => {
		const send = vi.fn(async () => jsonResponse(workerResponse()));
		const { service } = createService(createMeta(), send);

		await service.suggestForNote(createNote({
			text: null,
			renote: createNote({ text: 'renote source text' }),
		}));

		const body = JSON.parse((send.mock.calls[0] as unknown as [string, { body: string }])[1].body) as { normalizedText: string };
		expect(body.normalizedText).toBe('renote source text');
	});
});

function readLastLogEvent(logInfo: ReturnType<typeof vi.fn>): Record<string, unknown> {
	const event = logInfo.mock.calls.at(-1)?.[1];
	expect(event).toBeDefined();
	return event as Record<string, unknown>;
}

function readLastLogJson(logInfo: ReturnType<typeof vi.fn>): string {
	return JSON.stringify(readLastLogEvent(logInfo));
}

function expectLogToOmit(json: string, forbidden: readonly string[]): void {
	for (const value of forbidden) {
		expect(json).not.toContain(value);
	}
}
