/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import * as Redis from 'ioredis';
import { describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { InboxRuleService } from '@/core/InboxRuleService.js';
import { ApInboxService } from '@/core/activitypub/ApInboxService.js';
import type { InboxRuleCondFormulaValue } from '@/models/InboxRule.js';
import type { MiRemoteUser } from '@/models/User.js';
import type { IObject } from '@/core/activitypub/type.js';

const sender = { host: 'remote.example' } as MiRemoteUser;
const follow = { type: 'Follow', object: 'https://local.example/users/alice' };
const condition: InboxRuleCondFormulaValue = { id: 'follow', type: 'thisActivityIsFollow' };

function createService(redisClient?: Redis.Redis, resolvedObject?: IObject) {
	const dependencies = [
		redisClient ?? {},
		{ findOneBy: vi.fn().mockResolvedValue({ host: sender.host }) },
		{},
		{},
		{ toPuny: (host: string) => host },
		{ pack: vi.fn().mockResolvedValue({ host: sender.host }) },
		{},
		{ createResolver: () => ({ resolve: vi.fn().mockResolvedValue(resolvedObject) }) },
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

describe('InboxRuleService activity conditions', () => {
	test.each([
		['thisActivityIsReaction', { type: 'Like' }, true],
		['thisActivityIsReaction', { type: 'EmojiReaction' }, true],
		['thisActivityIsReaction', { type: 'EmojiReact' }, true],
		['thisActivityIsReaction', { type: 'Undo', object: { type: 'Like' } }, false],
		['thisActivityIsRenote', { type: 'Announce' }, true],
		['thisActivityIsRenote', { type: 'Create', object: { type: 'Note' } }, false],
		['thisActivityIsReply', { type: 'Create', object: { type: 'Note', inReplyTo: 'https://local.example/notes/1' } }, true],
		['thisActivityIsReply', { type: 'Create', object: { type: 'Note', inReplyTo: null } }, false],
		['thisActivityIsReply', { type: 'Create', object: { type: 'Question', inReplyTo: 'https://local.example/notes/1' } }, true],
	] as const)('%s: %j matches %s', async (type, activity, expected) => {
		expect(await createService().evalCond(activity as IObject, sender, { id: 'condition', type })).toBe(expected);
	});
});

describe('InboxRuleService hourly follow request conditions', () => {
	test.each(['userFollowRequestsLastHourMoreThanOrEq', 'serverFollowRequestsLastHourMoreThanOrEq'] as const)('%s includes the threshold and composes without matching notes', async type => {
		const service = createService();
		const rate: InboxRuleCondFormulaValue = { id: 'rate', type, value: 3 };
		expect(await service.evalCond(follow, sender, rate, { user: 2, server: 2 })).toBe(false);
		expect(await service.evalCond(follow, sender, rate, { user: 3, server: 3 })).toBe(true);
		expect(await service.evalCond({ type: 'Create', object: { type: 'Note' } } as IObject, sender, rate, { user: 3, server: 3 })).toBe(false);
		expect(await service.evalCond(follow, sender, {
			id: 'and', type: 'and', values: [condition, { id: 'or', type: 'or', values: [rate] }],
		}, { user: 3, server: 3 })).toBe(true);
		expect(await service.evalCond(follow, sender, { id: 'not', type: 'not', value: rate }, { user: 3, server: 3 })).toBe(false);
	});
});

test('hourly counters include each receipt, share server counts, isolate accounts and expire old receipts', async () => {
	const config = loadConfig();
	const redis = new Redis.Redis(config.redis.port, config.redis.host);
	const service = createService(redis);
	const suffix = randomUUID();
	const alice = { id: `alice-${suffix}`, host: `${suffix}.example` } as MiRemoteUser;
	const bob = { id: `bob-${suffix}`, host: alice.host } as MiRemoteUser;
	const other = { id: `other-${suffix}`, host: `other-${suffix}.example` } as MiRemoteUser;
	const keys = [alice, bob, other].flatMap(user => [`inboxFollowRequests:user:${user.id}`, `inboxFollowRequests:server:${user.host}`]);
	const now = Date.now();
	const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
	try {
		await redis.zadd(keys[0], now - 60 * 60 * 1000, 'expired', now - 60 * 60 * 1000 + 1, 'recent');
		expect(await service.recordFollowRequest(alice)).toEqual({ user: 2, server: 1 });
		expect(await service.recordFollowRequest(alice)).toEqual({ user: 3, server: 2 });
		expect(await service.recordFollowRequest(bob)).toEqual({ user: 1, server: 3 });
		expect(await service.recordFollowRequest(other)).toEqual({ user: 1, server: 1 });
		const rejectRule = {
			id: 'rate-rule', action: { type: 'reject' },
			condFormula: { id: 'and', type: 'and', values: [condition, { id: 'rate', type: 'userFollowRequestsLastHourMoreThanOrEq', value: 3 }] },
		};
		const inboxDependencies = {
			inboxRuleService: service,
			inboxRuleRepository: { find: vi.fn().mockResolvedValue([rejectRule, rejectRule]) },
			moderationLogService: { log: vi.fn() },
			follow: vi.fn().mockResolvedValue('accepted'),
			create: vi.fn().mockResolvedValue('created'),
		};
		const inbox = Object.create(ApInboxService.prototype) as ApInboxService;
		Object.defineProperties(inbox, Object.fromEntries(Object.entries(inboxDependencies).map(([key, value]) => [key, { value }])));
		expect(await inbox.performOneActivity(other, follow)).toBe('accepted');
		expect(await inbox.performOneActivity(other, follow)).toContain('skip: rejected by rule');
		expect(await inbox.performOneActivity(other, follow)).toContain('skip: rejected by rule');
		expect(inboxDependencies.follow).toHaveBeenCalledTimes(1);
		expect(inboxDependencies.moderationLogService.log).toHaveBeenCalledTimes(2);
		expect(await inbox.performOneActivity(other, { type: 'Create', object: { type: 'Note' } } as IObject)).toBe('created');
		expect(await redis.zcard(`inboxFollowRequests:user:${other.id}`)).toBe(4);
		expect(await redis.ttl(keys[0])).toBeGreaterThan(0);
		clock.mockReturnValue(now + 60 * 60 * 1000);
		expect(await service.recordFollowRequest(alice)).toEqual({ user: 1, server: 1 });
	} finally {
		clock.mockRestore();
		await redis.del(...keys);
		await redis.quit();
	}
});

test.each([
	[{ type: 'Note', inReplyTo: 'https://local.example/notes/1' }, true],
	[{ type: 'Note', inReplyTo: null }, false],
	[{ type: 'Question', inReplyTo: 'https://local.example/notes/1' }, true],
])('reply condition also resolves URL-referenced Create.object: %j', async (note, expected) => {
	const service = createService(undefined, note as IObject);
	expect(await service.evalCond({ type: 'Create', object: 'https://remote.example/notes/2' } as IObject, sender, { id: 'reply', type: 'thisActivityIsReply' })).toBe(expected);
});
