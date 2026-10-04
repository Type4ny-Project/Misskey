/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { DEFAULT_POLICIES } from '@/core/RoleService.js';
import SendPoints, { meta as sendPointsMeta, paramDef as sendPointsParams } from '@/server/api/endpoints/point/send.js';
import { ApiCallService } from '@/server/api/ApiCallService.js';
import Logger from '@/logger.js';
import { envOption } from '@/env.js';
import { logManager } from '@/logging/logging-runtime.js';
import { PrettyConsoleBackend } from '@/logging/PrettyConsoleBackend.js';
import type { LogBackend } from '@/logging/LogBackend.js';
import type { LogRecord } from '@/logging/types.js';

/** API失敗ログを確認するための最小Fastify応答を作成します。 */
function createReply() {
	return {
		code: vi.fn(),
		header: vi.fn(),
		send: vi.fn(),
	};
}

/** APIサービスの依存関係を最小限の仮実装へ差し替えます。 */
function createService() {
	const authenticateService = {
		authenticate: vi.fn().mockResolvedValue([null, null]),
	};
	const telemetryService = {
		startSpan: vi.fn((_name: string, callback: () => unknown) => callback()),
		captureMessage: vi.fn(),
	};
	const apiLoggerService = { logger: new Logger('api') };

	const roleService = { getUserRoles: vi.fn().mockResolvedValue([]), getUserPolicies: vi.fn().mockResolvedValue({ ...DEFAULT_POLICIES }) };
	const service = new ApiCallService(
		{} as never,
		{} as never,
		{} as never,
		authenticateService as never,
		{ limit: vi.fn().mockResolvedValue(null) } as never,
		roleService as never,
		apiLoggerService as never,
		telemetryService as never,
	);
	return { service, telemetryService, authenticateService, roleService };
}

describe('ApiCallService structured error logging', () => {
	test('passes the Fastify request to endpoint executors', async () => {
		const { service } = createService();
		try {
			const reply = createReply();
			const endpoint = {
				name: 'drive/files/upload-commit',
				meta: {},
				params: {},
				exec: vi.fn().mockResolvedValue({}),
			};
			const request = {
				method: 'POST',
				body: {},
				query: {},
				headers: {},
				ip: '127.0.0.1',
				raw: {},
			};

			await service.handleRequest(endpoint as never, request as never, reply as never);

			expect(endpoint.exec).toHaveBeenCalledWith({}, null, null, null, '127.0.0.1', {}, request);
		} finally {
			service.dispose();
		}
	});

	test('redacts API credentials and serializes the endpoint error', async () => {
		const write = vi.fn<LogBackend['write']>();
		logManager.setBackend({ write });
		const previousQuiet = envOption.quiet;
		envOption.quiet = false;
		const { service, telemetryService } = createService();
		try {
			const reply = createReply();
			const endpoint = {
				name: 'notes/show',
				meta: {},
				params: {},
				exec: vi.fn().mockRejectedValue(new TypeError('broken endpoint')),
			};
			const request = {
				method: 'POST',
				body: {
					i: 'native-token',
					password: 'password',
					options: { visible: true },
				},
				query: {},
				headers: {},
				ip: '127.0.0.1',
			};

			await service.handleRequest(endpoint as never, request as never, reply as never);

			const record = write.mock.calls[0][0] as LogRecord;
			expect(record).toMatchObject({
				eventName: 'api.endpoint.failed',
				attributes: {
					'api.endpoint': 'notes/show',
					'api.params': {
						i: '[REDACTED]',
						password: '[REDACTED]',
						options: { visible: true },
					},
				},
				error: { type: 'TypeError', message: 'broken endpoint' },
			});
			expect(record.attributes?.['error.id']).toEqual(expect.any(String));
			expect(telemetryService.captureMessage.mock.calls[0][1].extra).not.toHaveProperty('ps');
		} finally {
			service.dispose();
			envOption.quiet = previousQuiet;
			logManager.setBackend(new PrettyConsoleBackend({ output: () => undefined }));
		}
	});
});


describe('Point transfer role policy', () => {
	test.each([false, true])('enforces the sender’s permission (%s) before transferring points', async allowed => {
		const fixture = createService();
		fixture.authenticateService.authenticate.mockResolvedValue([{ id: 'sender', host: null }, null] as never);
		fixture.roleService.getUserPolicies.mockResolvedValue({ ...DEFAULT_POLICIES, canSendPoints: allowed });
		const sendPoints = vi.fn().mockResolvedValue({ success: true, senderBalance: 90 });
		const endpoint = new SendPoints({} as never, { getBalance: async () => 100, sendPoints } as never, { getUser: async () => ({ id: 'recipient', host: null }) } as never);
		const reply = createReply();
		try {
			await fixture.service.handleRequest({ name: 'point/send', meta: sendPointsMeta, params: sendPointsParams, exec: endpoint.exec } as never,
				{ method: 'POST', body: { userId: 'recipient', points: 10 }, query: {}, headers: {}, ip: '127.0.0.1' } as never, reply as never);
			if (allowed) {
				expect(sendPoints).toHaveBeenCalledWith('sender', 'recipient', 10);
				expect(reply.send).toHaveBeenCalledWith({ success: true, senderBalance: 90 });
			} else {
				expect(sendPoints).not.toHaveBeenCalled();
				expect(reply.code).toHaveBeenCalledWith(403);
				expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'ROLE_PERMISSION_DENIED' }) }));
			}
		} finally { fixture.service.dispose(); }
	});
});
