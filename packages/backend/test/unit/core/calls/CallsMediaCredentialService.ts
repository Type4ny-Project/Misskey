/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import { CallsMediaCredentialService, InvalidCallsMediaCredentialError } from '@/core/calls/CallsMediaCredentialService.js';

const config = { url: 'https://misskey.example', cloudflareRealtime: { appSecret: 'test-secret' } } as Config;
const input = {
	userId: 'user-a', applicationId: 'app-a', roomId: 'room-a', participantId: 'participant-a',
	connectionId: 'connection-a', generation: 2, canPublish: true,
};

describe('CallsMediaCredentialService', () => {
	beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z')));
	afterEach(() => vi.useRealTimers());

	test('binds the credential to every media security boundary', () => {
		const service = new CallsMediaCredentialService(config);
		const { credential } = service.issue(input);
		expect(service.verify(credential, { ...input, publish: true })).toMatchObject(input);
		for (const changed of [
			{ roomId: 'room-b' }, { userId: 'user-b' }, { applicationId: 'app-b' },
			{ participantId: 'participant-b' }, { connectionId: 'connection-b' }, { generation: 3 },
		]) {
			expect(() => service.verify(credential, { ...input, ...changed })).toThrow(InvalidCallsMediaCredentialError);
		}
	});

	test('rejects tampering, expiry, and listener publishing', () => {
		const service = new CallsMediaCredentialService(config);
		const listener = service.issue({ ...input, canPublish: false }).credential;
		expect(() => service.verify(`${listener}x`, input)).toThrow(InvalidCallsMediaCredentialError);
		expect(() => service.verify(listener, { ...input, publish: true })).toThrow(InvalidCallsMediaCredentialError);
		vi.advanceTimersByTime(301_000);
		expect(() => service.verify(listener, input)).toThrow(InvalidCallsMediaCredentialError);
	});
});
