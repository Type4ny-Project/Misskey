/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import { describe, expect, test } from 'vitest';
import { JsonLdError } from '@/core/activitypub/JsonLdService.js';
import { createUnrecoverableJsonLdError } from '@/queue/processors/InboxProcessorService.js';

describe('InboxProcessorService JSON-LD error classification', () => {
	test('does not retry JsonLdError instances', () => {
		const error = new JsonLdError('test-jsonld-error', 'test');

		expect(createUnrecoverableJsonLdError(error)).toBeInstanceOf(Bull.UnrecoverableError);
	});

	test('does not retry deterministic jsonld validation errors', () => {
		const error = Object.assign(new Error('Safe mode validation error.'), {
			name: 'jsonld.ValidationError',
		});

		const unrecoverableError = createUnrecoverableJsonLdError(error);

		expect(unrecoverableError).toBeInstanceOf(Bull.UnrecoverableError);
	});

	test('keeps transient errors retryable', () => {
		const error = new Error('request timeout');

		expect(createUnrecoverableJsonLdError(error)).toBeNull();
	});

	test('does not classify a different jsonld error as deterministic', () => {
		const error = Object.assign(new Error('failed to load remote context'), {
			name: 'jsonld.InvalidUrl',
		});

		expect(createUnrecoverableJsonLdError(error)).toBeNull();
	});
});
