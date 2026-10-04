/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { RoleService } from '@/core/RoleService.js';
import type { MiRole } from '@/models/_.js';

function createFixture(roles: MiRole[]) {
	const service = new RoleService(
		{} as never, { policies: {} } as never, { maxFileSize: 100 * 1024 * 1024 } as never,
		{} as never, { on: vi.fn() } as never, {} as never, {} as never, {} as never,
		{} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
	);
	vi.spyOn(service, 'getUserRoles').mockResolvedValue(roles);
	return service;
}

function role(value: number, priority = 0): MiRole {
	const result = mock<MiRole>();
	result.policies = {
		callsRoomSpeakerLimit: { value, priority, useDefault: false },
		callsRoomListenerLimit: { value, priority, useDefault: false },
	};
	return result;
}

describe('Calls capacity role aggregation', () => {
	test.each([
		{ roles: [role(2), role(10)], expected: 10 },
		{ roles: [role(0), role(10)], expected: 0 },
		{ roles: [role(0), role(2, 1)], expected: 2 },
	])('combines capacities and respects role priority ($expected)', async ({ roles, expected }) => {
		const policies = await createFixture(roles).getUserPolicies('user');
		expect(policies.callsRoomSpeakerLimit).toBe(expected);
		expect(policies.callsRoomListenerLimit).toBe(expected);
	});
});
