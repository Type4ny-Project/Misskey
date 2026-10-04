/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { DataSource } from 'typeorm';
import { loadConfig } from '@/config.js';
import { entities } from '@/postgres.js';
import { MiUser, MiUserProfile, miRepository } from '@/models/_.js';
import type { MiRepository, UsersRepository, UserProfilesRepository } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import { LoginBonusService } from '@/core/LoginBonusService.js';
import { MetaService } from '@/core/MetaService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { DEFAULT_POLICIES, RoleService } from '@/core/RoleService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import MeEndpoint from '@/server/api/endpoints/i.js';
import { LastLoginBonusDate1791103468369 } from '../../../../../migration/1791103468369-LastLoginBonusDate.js';

describe('i login bonus', () => {
	const config = loadConfig();
	const db = new DataSource({
		type: 'postgres',
		host: config.db.host,
		port: config.db.port,
		username: config.db.user,
		password: config.db.pass,
		database: config.db.db,
		entities,
		synchronize: true,
		dropSchema: true,
	});
	let users: UsersRepository;
	let profiles: UserProfilesRepository;
	const metaService = mock<MetaService>();
	const roleService = mock<RoleService>();
	const notificationService = mock<NotificationService>();
	const userEntityService = mock<UserEntityService>();
	let service: LoginBonusService;
	let endpoint: MeEndpoint;
	let user: MiLocalUser;
	let today: string;

	beforeAll(async () => {
		await db.initialize();
		users = db.getRepository(MiUser).extend(miRepository as MiRepository<MiUser>);
		profiles = db.getRepository(MiUserProfile).extend(miRepository as MiRepository<MiUserProfile>);
		service = new LoginBonusService(db, users, profiles, notificationService, metaService, roleService);
		endpoint = new MeEndpoint(profiles, userEntityService, service);
	});

	afterAll(async () => {
		await db.destroy();
	});

	beforeEach(async () => {
		vi.clearAllMocks();
		await users.deleteAll();
		const now = new Date();
		today = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
		await users.insert({ id: 'loginbonususer', username: 'alice', usernameLower: 'alice', points: 20 });
		user = await users.findOneByOrFail({ id: 'loginbonususer' }) as MiLocalUser;
		await profiles.insert({ userId: user.id, loggedInDates: [today] });
		metaService.fetch.mockResolvedValue({ enableLoginBonus: true } as Awaited<ReturnType<MetaService['fetch']>>);
		roleService.getUserPolicies.mockResolvedValue({ ...DEFAULT_POLICIES });
		userEntityService.pack.mockImplementation(async packedUser => ({ points: (packedUser as MiUser).points }) as never);
	});

	test('awards once after migration even if today is already a logged-in day', async () => {
		const result = await endpoint.exec({}, user, null);
		expect(result.points).toBeGreaterThanOrEqual(21);
		expect(result.points).toBeLessThanOrEqual(25);
		expect((await profiles.findOneByOrFail({ userId: user.id })).lastLoginBonusDate).toBe(today);
		expect((await profiles.findOneByOrFail({ userId: user.id })).loggedInDates).toEqual([today]);
		expect((await endpoint.exec({}, user, null)).points).toBe(result.points);
		expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
	});

	test('records login while disabled and awards when enabled later the same day', async () => {
		await profiles.update({ userId: user.id }, { loggedInDates: [] });
		metaService.fetch.mockResolvedValue({ enableLoginBonus: false } as Awaited<ReturnType<MetaService['fetch']>>);
		expect((await endpoint.exec({}, user, null)).points).toBe(20);
		expect(await profiles.findOneByOrFail({ userId: user.id })).toMatchObject({
			loggedInDates: [today], lastLoginBonusDate: null,
		});
		metaService.fetch.mockResolvedValue({ enableLoginBonus: true } as Awaited<ReturnType<MetaService['fetch']>>);
		expect((await endpoint.exec({}, user, null)).points).toBeGreaterThan(20);
	});

	test('does not consume the bonus while the role policy disallows it', async () => {
		roleService.getUserPolicies.mockResolvedValue({ ...DEFAULT_POLICIES, loginBonusGrantEnabled: false });
		expect((await endpoint.exec({}, user, null)).points).toBe(20);
		expect((await profiles.findOneByOrFail({ userId: user.id })).lastLoginBonusDate).toBeNull();
		roleService.getUserPolicies.mockResolvedValue({ ...DEFAULT_POLICIES });
		expect((await endpoint.exec({}, user, null)).points).toBeGreaterThan(20);
	});

	test('awards again when the previous award was on an earlier day', async () => {
		await profiles.update({ userId: user.id }, { lastLoginBonusDate: '2020/1/1' });
		expect((await endpoint.exec({}, user, null)).points).toBeGreaterThan(20);
		expect((await profiles.findOneByOrFail({ userId: user.id })).lastLoginBonusDate).toBe(today);
	});

	test('concurrent requests award once and both return the updated balance', async () => {
		const findOne = profiles.findOne.bind(profiles);
		let snapshots = 0;
		let release!: () => void;
		const bothRead = new Promise<void>(resolve => { release = resolve; });
		vi.spyOn(profiles, 'findOne').mockImplementation(async options => {
			const profile = await findOne(options);
			if (options.relations) {
				if (++snapshots === 2) release();
				await bothRead;
			}
			return profile;
		});
		const responses = await Promise.all([endpoint.exec({}, user, null), endpoint.exec({}, user, null)]);
		const balance = (await users.findOneByOrFail({ id: user.id })).points;
		expect(balance).toBeGreaterThanOrEqual(21);
		expect(balance).toBeLessThanOrEqual(25);
		expect(responses.map(response => response.points)).toEqual([balance, balance]);
		expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
	});

	test.each([false, true])('migration preserves history and initializes the guard for enableLoginBonus=%s', async enabled => {
		const runner = db.createQueryRunner();
		const migration = new LastLoginBonusDate1791103468369();
		await runner.startTransaction();
		try {
			await runner.query(`INSERT INTO "meta" ("id", "enableLoginBonus") VALUES ('x', $1)`, [enabled]);
			await runner.query(`UPDATE "user_profile" SET "loggedInDates" = $1 WHERE "userId" = $2`, [['2026/9/30', '2026/10/1'], user.id]);
			await migration.down(runner);
			await migration.up(runner);
			const [profile] = await runner.query(`SELECT "lastLoginBonusDate", "loggedInDates" FROM "user_profile" WHERE "userId" = $1`, [user.id]);
			expect(profile).toEqual({
				lastLoginBonusDate: enabled ? '2026/10/1' : null,
				loggedInDates: ['2026/9/30', '2026/10/1'],
			});
			await migration.down(runner);
			await migration.up(runner);
		} finally {
			await runner.rollbackTransaction();
			await runner.release();
		}
	});
});
