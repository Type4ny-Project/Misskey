/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { formatErrorInfo } from '@/utility/error-info.js';

describe('error information', () => {
	test('includes native errors, environment and the displayed message', () => {
		const error = new Error('Media connection failed');
		const report = JSON.parse(formatErrorInfo({ text: 'Something happened', error }));
		expect(report).toMatchObject({
			text: 'Something happened', userAgent: navigator.userAgent,
			error: { name: 'Error', message: error.message, stack: error.stack },
		});
		expect(report.version).toBeTypeOf('string');
		expect(new Date(report.date).toISOString()).toBe(report.date);
	});

	test('includes API identifiers without copying arbitrary error or info properties', () => {
		const error = {
			code: 'INTERNAL_ERROR', id: 'api-id', message: 'Internal error',
			i: 'secret-token', request: { password: 'secret-password' },
			info: { e: { id: 'server-id', message: 'Unexpected failure' }, token: 'another-secret' },
		};
		const report = JSON.parse(formatErrorInfo({ error, endpoint: 'calls/rooms/join' }));
		expect(report.endpoint).toBe('calls/rooms/join');
		expect(report.error).toEqual({ code: 'INTERNAL_ERROR', id: 'api-id', message: 'Internal error', serverError: { id: 'server-id', message: 'Unexpected failure' } });
	});

	test('supports alerts without an error and string rejections', () => {
		expect(JSON.parse(formatErrorInfo({ text: 'Something happened' }))).toMatchObject({ text: 'Something happened', error: {} });
		expect(JSON.parse(formatErrorInfo({ error: 'Failed' })).error).toEqual({ message: 'Failed' });
	});
});
