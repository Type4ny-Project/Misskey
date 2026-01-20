/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { PointService } from '@/core/PointService.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:account',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'f3a0d8e1-7b2c-4c9d-8e5f-6a1b2c3d4e5f',
		},

		invalidAmount: {
			message: 'Amount must be a positive integer.',
			code: 'INVALID_AMOUNT',
			id: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
		},

		userIsRemote: {
			message: 'Cannot give points to a remote user.',
			code: 'USER_IS_REMOTE',
			id: 'b2c3d4e5-6f7a-8b9c-0d1e-2f3a4b5c6d7e',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			success: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			newBalance: {
				type: 'number',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		amount: { type: 'integer', minimum: 1 },
	},
	required: ['userId', 'amount'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private pointService: PointService,
		private getterService: GetterService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Validate amount
			if (ps.amount <= 0 || !Number.isInteger(ps.amount)) {
				throw new ApiError(meta.errors.invalidAmount);
			}

			// Get target user
			const targetUser = await this.getterService.getUser(ps.userId).catch(err => {
				if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
				throw err;
			});

			// Cannot give points to remote users
			if (targetUser.host !== null) {
				throw new ApiError(meta.errors.userIsRemote);
			}

			// Add points
			const newBalance = await this.pointService.addPoints(ps.userId, ps.amount);

			return {
				success: true,
				newBalance,
			};
		});
	}
}
