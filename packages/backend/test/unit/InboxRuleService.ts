/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { InboxRuleService } from '@/core/InboxRuleService.js';
import type { InboxRuleCondFormulaValue } from '@/models/InboxRule.js';
import type { MiRemoteUser } from '@/models/User.js';
import type { IObject } from '@/core/activitypub/type.js';

const sender = { host: 'remote.example' } as MiRemoteUser;
const follow = { type: 'Follow', object: 'https://local.example/users/alice' };
const condition: InboxRuleCondFormulaValue = { id: 'follow', type: 'thisActivityIsFollow' };

function createService() {
	const dependencies = [
		{ findOneBy: vi.fn().mockResolvedValue({ host: sender.host }) },
		{},
		{},
		{ toPuny: (host: string) => host },
		{ pack: vi.fn().mockResolvedValue({ host: sender.host }) },
		{},
		{},
	] as unknown as ConstructorParameters<typeof InboxRuleService>;
	return new InboxRuleService(...dependencies);
}

describe('InboxRuleService follow request condition', () => {
	test.each([
		[follow, true],
		[{ type: 'Create', object: { type: 'Note', content: 'hello' } }, false],
		[{ type: 'Undo', object: follow }, false],
		[{ type: 'Accept', object: follow }, false],
	])('matches only the incoming Follow: %j', async (activity, expected) => {
		expect(await createService().evalCond(activity as IObject, sender, condition)).toBe(expected);
	});

	test('combines Follow with a server condition without matching notes or other servers', async () => {
		const service = createService();
		const formula: InboxRuleCondFormulaValue = {
			id: 'and', type: 'and', values: [
				condition,
				{ id: 'host', type: 'serverHost', value: sender.host },
			],
		};
		expect(await service.evalCond(follow, sender, formula)).toBe(true);
		expect(await service.evalCond({ type: 'Create', object: { type: 'Note' } } as IObject, sender, formula)).toBe(false);
		expect(await service.evalCond(follow, { ...sender, host: 'other.example' }, formula)).toBe(false);
		expect(await service.evalCond(follow, sender, { id: 'not', type: 'not', value: condition })).toBe(false);
	});
});
