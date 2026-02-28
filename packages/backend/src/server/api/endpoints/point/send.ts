/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { PointService } from '@/core/PointService.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['point'],

	limit: {
		duration: ms('1hour'),
		max: 30,
	},

	requireCredential: true,

	kind: 'write:account',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'a8f60e0b-7c3e-4f8c-9d5a-1a2b3c4d5e6f',
		},

		recipientIsYourself: {
			message: 'You cannot send points to yourself.',
			code: 'RECIPIENT_IS_YOURSELF',
			id: 'b9e71f1c-8d4f-5a9b-0e6c-2b3c4d5e6f7a',
		},

		insufficientPoints: {
			message: 'You do not have enough points.',
			code: 'INSUFFICIENT_POINTS',
			id: 'c0f82a2d-9e5a-6b0c-1f7d-3c4d5e6f7a8b',
		},

		invalidAmount: {
			message: 'Amount must be a positive integer.',
			code: 'INVALID_AMOUNT',
			id: 'd1a93b3e-0f6b-7c1d-2a8e-4d5e6f7a8b9c',
		},

		recipientIsRemoteUser: {
			message: 'You cannot send points to a remote user.',
			code: 'RECIPIENT_IS_REMOTE_USER',
			id: 'e2ba4c4f-1a7c-8d2e-3b9f-5e6f7a8b9c0d',
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
			senderBalance: {
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
		points: { type: 'integer', minimum: 1 },
	},
	required: ['userId', 'points'],
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
			// Cannot send to yourself
			if (me.id === ps.userId) {
				throw new ApiError(meta.errors.recipientIsYourself);
			}

			// Validate amount
			if (ps.points <= 0 || !Number.isInteger(ps.points)) {
				throw new ApiError(meta.errors.invalidAmount);
			}

			// Get recipient
			const recipient = await this.getterService.getUser(ps.userId).catch(err => {
				if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
				throw err;
			});

			// Cannot send to remote users
			if (recipient.host !== null) {
				throw new ApiError(meta.errors.recipientIsRemoteUser);
			}

			// Check sender's balance
			const senderBalance = await this.pointService.getBalance(me.id);
			if (senderBalance < ps.points) {
				throw new ApiError(meta.errors.insufficientPoints);
			}

			// Perform the transfer
			const result = await this.pointService.sendPoints(me.id, ps.userId, ps.points);

			return {
				success: result.success,
				senderBalance: result.senderBalance,
			};
		});
	}
}
