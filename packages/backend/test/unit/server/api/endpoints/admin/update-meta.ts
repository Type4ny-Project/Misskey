/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Config } from '@/config.js';
import type { MiLocalUser } from '@/models/User.js';
import { MiMeta } from '@/models/Meta.js';
import { MetaService } from '@/core/MetaService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import UpdateMetaEndpoint from '@/server/api/endpoints/admin/update-meta.js';

describe('admin/update-meta login bonus settings', () => {
	const metaService = mock<MetaService>();
	const moderationLogService = mock<ModerationLogService>();
	const settings = Object.assign(new MiMeta(), {
		enableLoginBonus: false,
		loginBonusResetTime: '00:00',
		loginBonusMinPoints: 1,
		loginBonusMaxPoints: 5,
	});
	const endpoint = new UpdateMetaEndpoint(mock<Config>(), settings, metaService, moderationLogService);
	const admin = mock<MiLocalUser>();

	beforeEach(() => {
		vi.clearAllMocks();
		metaService.fetch.mockResolvedValue(settings);
	});

	test('saves enablement, reset time and a fixed points amount', async () => {
		const params = { enableLoginBonus: true, loginBonusResetTime: '07:30', loginBonusMinPoints: 10, loginBonusMaxPoints: 10 };
		await endpoint.exec(params, admin, null);
		expect(metaService.update).toHaveBeenCalledWith(params);
	});

	test.each([
		{ loginBonusMinPoints: 6 },
		{ loginBonusMinPoints: 10, loginBonusMaxPoints: 9 },
	])('rejects an inverted range, including partial updates: %j', async params => {
		await expect(endpoint.exec(params, admin, null)).rejects.toMatchObject({ code: 'INVALID_LOGIN_BONUS_POINTS_RANGE' });
		expect(metaService.update).not.toHaveBeenCalled();
	});

	test.each([
		{ loginBonusResetTime: '24:00' },
		{ loginBonusMinPoints: 0 },
		{ loginBonusMaxPoints: 1.5 },
	])('rejects invalid time or points: %j', async params => {
		await expect(endpoint.exec(params, admin, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(metaService.update).not.toHaveBeenCalled();
	});

	test('keeps existing settings when changing an unrelated setting', async () => {
		await endpoint.exec({ name: 'Test' }, admin, null);
		expect(metaService.update).toHaveBeenCalledWith({ name: 'Test' });
	});
});
