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
			getLogger: vi.fn(() => ({ info: logInfo })),
		} as unknown as LoggerService;
		const config = {
			url: 'https://misskey.example.test',
			host: 'misskey.example.test',
		} as Config;

		return {
			service: new EmojiSuggestionService(config, metaService, httpRequestService, loggerService),
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

	test('calls Worker for public notes regardless of localOnly', async () => {
		const send = vi.fn(async () => jsonResponse(workerResponse()));
		const { service, logInfo } = createService(createMeta(), send);

		await expect(service.suggestForNote(createNote())).resolves.toMatchObject({
			source: 'live',
			items: [{ name: 'ablobgoodnightreverse' }],
		});
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

		const body = JSON.parse(send.mock.calls[0][1].body as string) as { normalizedText: string; instanceId: string; eligibility: { visibility: string; localOnly: boolean }; maxResults: number; deadlineMs: number; modelVersion?: string; emojiIndexVersion?: string; budgetMode?: string };
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
			source: 'live',
			items: [{ name: 'ablobgoodnightreverse' }],
		});
		expect(send).toHaveBeenCalledTimes(2);
		const localOnlyBody = JSON.parse(send.mock.calls[1][1].body as string) as { eligibility: { visibility: string; localOnly: boolean } };
		expect(localOnlyBody.eligibility).toEqual({ visibility: 'public', localOnly: true });

		for (const note of [
			createNote({ visibility: 'home' }),
			createNote({ visibility: 'followers' }),
			createNote({ visibility: 'specified' }),
		]) {
			await expect(service.suggestForNote(note)).resolves.toMatchObject({
				items: [],
				source: 'fallback',
				reason: 'ineligible',
			});
		}

		expect(send).toHaveBeenCalledTimes(2);
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
		await expect(cacheHarness.service.suggestForNote(createNote())).resolves.toMatchObject({ source: 'cache' });
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
		await expect(authHarness.service.suggestForNote(createNote())).resolves.toMatchObject({ source: 'fallback', reason: 'workerUnauthorized' });
		expect(readLastLogEvent(authHarness.logInfo)).toMatchObject({
			outcome: 'fallback',
			fallbackReason: 'workerUnauthorized',
			workerStatus: 401,
			workerAuthStatus: 'rejected',
		});
		expectLogToOmit(readLastLogJson(authHarness.logInfo), forbidden);

		const timeoutSend = vi.fn(async () => { throw new Error('aborted'); });
		const timeoutHarness = createService(createMeta(), timeoutSend);
		await expect(timeoutHarness.service.suggestForNote(createNote())).resolves.toMatchObject({ source: 'fallback', reason: 'timeout' });
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
				source: 'fallback',
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
				source: 'fallback',
			});
			expect(send).toHaveBeenCalledTimes(1);
		}
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
