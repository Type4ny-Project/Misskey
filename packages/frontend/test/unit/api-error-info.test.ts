/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';

vi.mock('@/i.js', () => ({ $i: null }));

test.each([misskeyApi, misskeyApiGet])('retains the API endpoint on failures without including request data', async request => {
	const fetch = vi.spyOn(window, 'fetch').mockResolvedValue(new Response(JSON.stringify({
		error: { code: 'CALLS_ROOM_NOT_FOUND', id: 'error-id', message: 'Room not found' },
	}), { status: 400 }));
	try {
		await expect(request('calls/rooms/show', { roomId: 'room' })).rejects.toEqual({
			code: 'CALLS_ROOM_NOT_FOUND', id: 'error-id', message: 'Room not found', endpoint: 'calls/rooms/show',
		});
	} finally {
		fetch.mockRestore();
	}
});
