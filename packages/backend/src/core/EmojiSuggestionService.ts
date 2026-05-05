/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHmac, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { MiNote } from '@/models/Note.js';
import type { MiMeta } from '@/models/Meta.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import { MetaService } from '@/core/MetaService.js';
import { bindThis } from '@/decorators.js';

const WORKER_REQUEST_SCHEMA_VERSION = 'emoji-suggest-worker-request-v1';
const WORKER_RESPONSE_SCHEMA_VERSION = 'emoji-suggest-worker-response-v1';
const NORMALIZATION_SCHEMA_VERSION = 'emoji-suggest-normalization-v1';
const WORKER_OWNED_VERSION_PLACEHOLDER = 'worker-owned';
const MAX_NORMALIZED_TEXT_LENGTH = 1000;
const MIN_SUGGESTION_SCORE = 0.4;

export type EmojiSuggestionCandidate = {
	name: string;
	score: number;
	aliases: string[];
	category: string | null;
};

export type EmojiSuggestionResponse = {
	items: EmojiSuggestionCandidate[];
	source: 'cache' | 'live' | 'fallback';
	reason: string | null;
	modelVersion: string;
	emojiIndexVersion: string;
};

type WorkerSuggestResponse = {
	schemaVersion: string;
	items: unknown;
	source: unknown;
	reason: unknown;
	emojiIndexVersion: unknown;
	modelVersion: unknown;
};

type EmojiSuggestionLogEvent = {
	event: 'emoji_suggestion_request';
	schemaVersion: 'emoji-suggestion-observability-v1';
	requestId: string;
	outcome: 'success' | 'fallback';
	source: EmojiSuggestionResponse['source'];
	fallbackReason: string | null;
	workerStatus: number | null;
	workerAuthStatus: 'not_attempted' | 'accepted' | 'rejected';
	cacheStatus: 'hit' | 'miss' | 'not_reported' | 'not_attempted';
	resultCount: number;
	maxResults: number | null;
	modelVersion: string;
	emojiIndexVersion: string;
	normalizedTextHmacPrefix: string | null;
	latencyBucket: string;
	durationMs: number;
};

@Injectable()
export class EmojiSuggestionService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		private metaService: MetaService,
		private httpRequestService: HttpRequestService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('emoji-suggestion');
	}

	@bindThis
	public async suggestForNote(note: MiNote, locale = 'ja-JP', language = 'ja'): Promise<EmojiSuggestionResponse> {
		const startedAt = Date.now();
		const requestId = randomUUID();
		const event: EmojiSuggestionLogEvent = {
			event: 'emoji_suggestion_request',
			schemaVersion: 'emoji-suggestion-observability-v1',
			requestId,
			outcome: 'fallback',
			source: 'fallback',
			fallbackReason: null,
			workerStatus: null,
			workerAuthStatus: 'not_attempted',
			cacheStatus: 'not_attempted',
			resultCount: 0,
			maxResults: null,
			modelVersion: WORKER_OWNED_VERSION_PLACEHOLDER,
			emojiIndexVersion: WORKER_OWNED_VERSION_PLACEHOLDER,
			normalizedTextHmacPrefix: null,
			latencyBucket: '0-50ms',
			durationMs: 0,
		};

		let response: EmojiSuggestionResponse | null = null;

		try {
			const meta = await this.metaService.fetch();
			const fallback = (reason: string): EmojiSuggestionResponse => this.createFallback(meta, reason);

			if (!meta.emojiSuggestionEnabled) return response = fallback('disabled');
			if (!meta.emojiSuggestionEndpoint || !meta.emojiSuggestionApiKey) return response = fallback('unconfigured');
			if (!this.isEligible(note)) return response = fallback('ineligible');

			const normalizedText = normalizeEmojiSuggestionNoteText(note);
			if (normalizedText.length === 0) return response = fallback('emptyText');

			const maxResults = clampMaxSuggestions(meta.emojiSuggestionMaxSuggestions);
			event.maxResults = maxResults;
			const normalizedTextHmac = `hmac-sha256:${createHmac('sha256', meta.emojiSuggestionApiKey).update(normalizedText).digest('hex')}`;
			event.normalizedTextHmacPrefix = readSafeHashPrefix(normalizedTextHmac);
			const request = {
				schemaVersion: WORKER_REQUEST_SCHEMA_VERSION,
				requestId,
				instanceId: this.config.host || new URL(this.config.url).host,
				eligibility: {
					visibility: note.visibility,
					localOnly: note.localOnly,
				},
				normalizedText,
				normalizedTextHmac,
				normalizationSchema: NORMALIZATION_SCHEMA_VERSION,
				locale,
				language,
				maxResults,
				deadlineMs: meta.emojiSuggestionTimeoutMs,
			};

			try {
				const res = await this.httpRequestService.send(meta.emojiSuggestionEndpoint, {
					method: 'POST',
					timeout: meta.emojiSuggestionTimeoutMs,
					size: 1024 * 64,
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json, */*',
						Authorization: `Bearer ${meta.emojiSuggestionApiKey}`,
						'x-emoji-suggest-api-key': meta.emojiSuggestionApiKey,
					},
					body: JSON.stringify(request),
				}, {
					throwErrorWhenResponseNotOk: false,
				});
				event.workerStatus = res.status;

				if (res.status === 401 || res.status === 403) {
					event.workerAuthStatus = 'rejected';
					return response = fallback('workerUnauthorized');
				}
				if (!res.ok) return response = fallback('workerUnavailable');

				event.workerAuthStatus = 'accepted';

				return response = parseWorkerResponse(await res.json(), maxResults);
			} catch {
				return response = fallback('timeout');
			}
		} finally {
			if (response !== null) {
				this.logCompletion(event, response, startedAt);
			}
		}
	}

	private isEligible(note: MiNote): boolean {
		return note.visibility === 'public' || note.visibility === 'home';
	}

	private createFallback(meta: MiMeta, reason: string): EmojiSuggestionResponse {
		return {
			items: [],
			source: 'fallback',
			reason,
			modelVersion: WORKER_OWNED_VERSION_PLACEHOLDER,
			emojiIndexVersion: WORKER_OWNED_VERSION_PLACEHOLDER,
		};
	}

	private logCompletion(event: EmojiSuggestionLogEvent, response: EmojiSuggestionResponse, startedAt: number): void {
		const durationMs = Math.max(0, Date.now() - startedAt);
		event.outcome = response.source === 'fallback' ? 'fallback' : 'success';
		event.source = response.source;
		event.fallbackReason = response.reason;
		event.cacheStatus = response.source === 'cache' ? 'hit' : response.source === 'live' ? 'miss' : event.cacheStatus;
		event.resultCount = response.items.length;
		event.modelVersion = response.modelVersion;
		event.emojiIndexVersion = response.emojiIndexVersion;
		event.durationMs = durationMs;
		event.latencyBucket = bucketDurationMs(durationMs);
		this.logger.info('emoji_suggestion_request', event);
	}
}

export function clampMaxSuggestions(value: number): number {
	if (!Number.isFinite(value)) return 8;
	return Math.min(16, Math.max(1, Math.trunc(value)));
}

export function normalizeEmojiSuggestionNoteText(note: Pick<MiNote, 'text' | 'cw' | 'tags'>): string {
	const source = note.cw != null
		? [note.cw, ...(note.tags ?? []).map(tag => `#${tag}`)].join(' ')
		: note.text ?? '';

	return source
		.normalize('NFKC')
		.replace(/https?:\/\/\S+/g, ' ')
		.replace(/@([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_.-]+)?/g, '@user')
		.replace(/\$\[[^\s\]]+\s*/g, ' ')
		.replace(/\]/g, ' ')
		.replace(/:([a-zA-Z0-9_+-]+):/g, ' $1 ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_NORMALIZED_TEXT_LENGTH);
}

function parseWorkerResponse(value: unknown, maxResults: number): EmojiSuggestionResponse {
	if (!isWorkerSuggestResponse(value)) return createMalformedFallback();
	if (!Array.isArray(value.items)) return createMalformedFallback();
	if (value.source !== 'cache' && value.source !== 'live' && value.source !== 'fallback') return createMalformedFallback();
	if (typeof value.modelVersion !== 'string' || typeof value.emojiIndexVersion !== 'string') return createMalformedFallback();
	if (value.reason !== null && typeof value.reason !== 'string') return createMalformedFallback();

	const items: EmojiSuggestionCandidate[] = [];
	for (const item of value.items) {
		if (!isWorkerSuggestItem(item)) return createMalformedFallback();
		if (item.score < MIN_SUGGESTION_SCORE) continue;
		items.push({
			name: item.name,
			score: item.score,
			aliases: [...item.aliases],
			category: item.category,
		});
		if (items.length >= maxResults) break;
	}

	return {
		items,
		source: value.source,
		reason: value.reason,
		modelVersion: value.modelVersion,
		emojiIndexVersion: value.emojiIndexVersion,
	};
}

function isWorkerSuggestResponse(value: unknown): value is WorkerSuggestResponse {
	return typeof value === 'object' && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === WORKER_RESPONSE_SCHEMA_VERSION;
}

function isWorkerSuggestItem(value: unknown): value is EmojiSuggestionCandidate {
	if (typeof value !== 'object' || value === null) return false;
	const item = value as Partial<EmojiSuggestionCandidate>;
	return typeof item.name === 'string'
		&& typeof item.score === 'number'
		&& Number.isFinite(item.score)
		&& Array.isArray(item.aliases)
		&& item.aliases.every(alias => typeof alias === 'string')
		&& (typeof item.category === 'string' || item.category === null);
}

function createMalformedFallback(): EmojiSuggestionResponse {
	return {
		items: [],
		source: 'fallback',
		reason: 'malformedResponse',
		modelVersion: WORKER_OWNED_VERSION_PLACEHOLDER,
		emojiIndexVersion: WORKER_OWNED_VERSION_PLACEHOLDER,
	};
}

function readSafeHashPrefix(value: string | null | undefined): string | null {
	const hex = value?.split(':').at(-1);
	return hex !== undefined && /^[0-9a-f]+$/i.test(hex) ? hex.slice(0, 12).toLowerCase() : null;
}

function bucketDurationMs(durationMs: number): string {
	if (durationMs <= 50) return '0-50ms';
	if (durationMs <= 100) return '51-100ms';
	if (durationMs <= 250) return '101-250ms';
	if (durationMs <= 500) return '251-500ms';
	if (durationMs <= 1000) return '501-1000ms';
	return '1001ms+';
}
