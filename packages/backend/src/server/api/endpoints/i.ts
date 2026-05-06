/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { MetaService } from '@/core/MetaService.js';
import { RoleService } from '@/core/RoleService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../error.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,
	kind: "read:account",

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'MeDetailed',
	},

	errors: {
		userIsDeleted: {
			message: 'User is deleted.',
			code: 'USER_IS_DELETED',
			id: 'e5b3b9f0-2b8f-4b9f-9c1f-8c5c1b2e1b1a',
			kind: 'permission',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private userEntityService: UserEntityService,
		private notificationService: NotificationService,
		private metaService: MetaService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, user, token) => {
			const isSecure = token == null;

			const now = new Date();
			const today = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;

			// 渡ってきている user はキャッシュされていて古い可能性があるので改めて取得
			const userProfile = await this.userProfilesRepository.findOne({
				where: {
					userId: user.id,
				},
				relations: ['user'],
			});

			if (userProfile == null) {
				throw new ApiError(meta.errors.userIsDeleted);
			}

			const packedUser = userProfile.user;
			if (packedUser == null) {
				throw new ApiError(meta.errors.userIsDeleted);
			}

			if (!userProfile.loggedInDates.includes(today)) {
				// ログインボーナス付与
				const meta = await this.metaService.fetch();
				if (meta.enableLoginBonus) {
					const policies = await this.roleService.getUserPolicies(user.id);
					if (policies.loginBonusGrantEnabled) {
						const bonusPoints = randomInt(1, 6); // 1-5 points
						const currentUser = await this.usersRepository.findOneByOrFail({ id: user.id });
						const updatedPoints = currentUser.points + bonusPoints;
						await this.usersRepository.update(user.id, {
							points: updatedPoints,
						});
						packedUser.points = updatedPoints;
						this.notificationService.createNotification(user.id, 'loginBonus', {
							points: bonusPoints,
						});
					}
				}

				await this.userProfilesRepository.update({ userId: user.id }, {
					loggedInDates: [...userProfile.loggedInDates, today],
				});
				userProfile.loggedInDates = [...userProfile.loggedInDates, today];
			}

			return await this.userEntityService.pack(packedUser, packedUser, {
				schema: 'MeDetailed',
				includeSecrets: isSecure,
				userProfile,
			});
		});
	}
}
