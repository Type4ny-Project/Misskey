/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { meta, paramDef } from '@/server/api/endpoints/i/update.js';
import type { MiLocalUser } from '@/models/User.js';

describe('i/update lockdown parameters', () => {
	const execute = vi.fn(async () => undefined as never);
	const endpoint = new class extends Endpoint<typeof meta, typeof paramDef> {}(meta, paramDef, execute);
	const user = { id: 'local-user' } as MiLocalUser;

	test.each([
		{ requireSigninToViewContents: true },
		{ makeNotesFollowersOnlyBefore: -604800 },
		{ makeNotesFollowersOnlyBefore: 1700000000 },
		{ makeNotesHiddenBefore: -604800 },
		{ makeNotesHiddenBefore: 1700000000 },
	])('rejects enabling lockdown: %j', async params => {
		execute.mockClear();
		await expect(endpoint.exec(params, user, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(execute).not.toHaveBeenCalled();
	});

	test.each([
		{ requireSigninToViewContents: false },
		{ makeNotesFollowersOnlyBefore: null },
		{ makeNotesHiddenBefore: null },
		{ hideOnlineStatus: true },
	])('allows clearing restrictions or saving unrelated settings: %j', async params => {
		execute.mockClear();
		await endpoint.exec(params, user, null);
		expect(execute).toHaveBeenCalledWith(params, user, null, undefined, undefined, undefined, undefined, undefined);
	});
});
