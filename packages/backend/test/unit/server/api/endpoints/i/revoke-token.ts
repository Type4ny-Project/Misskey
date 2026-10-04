/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import RevokeToken from '@/server/api/endpoints/i/revoke-token.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiAccessToken } from '@/models/AccessToken.js';

const user = { id: 'usera' } as MiLocalUser;
const token = { id: 'tokena', userId: user.id } as MiAccessToken;

test.each([{ tokenId: token.id }, { token: 'access-token' }])('revokes its own token and Calls access with %o', async params => {
	const tokens = { findOneBy: vi.fn().mockResolvedValue(token), delete: vi.fn().mockResolvedValue({ affected: 1 }) };
	const calls = { revokeUser: vi.fn().mockResolvedValue(undefined) };
	const endpoint = new RevokeToken(tokens as never, calls as never);

	await endpoint.exec(params, user, token);

	expect(tokens.findOneBy).toHaveBeenCalledWith({ ...('tokenId' in params ? { id: params.tokenId } : params), userId: user.id });
	expect(tokens.delete).toHaveBeenCalledWith({ id: token.id });
	expect(calls.revokeUser).toHaveBeenCalledWith(user.id, 'logout');
});

test('requires an authenticated user', async () => {
	const tokens = { findOneBy: vi.fn(), delete: vi.fn() };
	const calls = { revokeUser: vi.fn() };
	const endpoint = new RevokeToken(tokens as never, calls as never);

	await expect(endpoint.exec({ tokenId: token.id }, null, null)).rejects.toMatchObject({ code: 'CREDENTIAL_REQUIRED' });
	expect(tokens.findOneBy).not.toHaveBeenCalled();
	expect(calls.revokeUser).not.toHaveBeenCalled();
});

test('prevents a third-party token from revoking another token or Calls access', async () => {
	const tokens = { findOneBy: vi.fn().mockResolvedValue(token), delete: vi.fn() };
	const calls = { revokeUser: vi.fn() };
	const endpoint = new RevokeToken(tokens as never, calls as never);

	await expect(endpoint.exec({ tokenId: token.id }, user, { id: 'tokenb' } as MiAccessToken)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
	expect(tokens.delete).not.toHaveBeenCalled();
	expect(calls.revokeUser).not.toHaveBeenCalled();
});

test('keeps Calls access when the target token does not belong to the user', async () => {
	const tokens = { findOneBy: vi.fn().mockResolvedValue(null), delete: vi.fn() };
	const calls = { revokeUser: vi.fn() };
	const endpoint = new RevokeToken(tokens as never, calls as never);

	await endpoint.exec({ tokenId: token.id }, user, null);

	expect(tokens.findOneBy).toHaveBeenCalledWith({ id: token.id, userId: user.id });
	expect(tokens.delete).not.toHaveBeenCalled();
	expect(calls.revokeUser).not.toHaveBeenCalled();
});
