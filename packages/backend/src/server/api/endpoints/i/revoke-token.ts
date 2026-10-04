/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AccessTokensRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { CallsMediaRevocationService } from '@/core/calls/CallsMediaRevocationService.js';

export const meta = {
	requireCredential: true,

	secure: true,
} as const;

export const paramDef = {
	anyOf: [
		{
			type: 'object',
			properties: {
				tokenId: { type: 'string', format: 'misskey:id' },
			},
			required: ['tokenId'],
		},
		{
			type: 'object',
			properties: {
				token: { type: 'string', nullable: true },
			},
			required: ['token'],
		},
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.accessTokensRepository)
		private accessTokensRepository: AccessTokensRepository,
		private callsMediaRevocationService: CallsMediaRevocationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if ('tokenId' in ps) {
				const tokenExist = await this.accessTokensRepository.exists({ where: { id: ps.tokenId } });

				if (tokenExist) {
					await this.accessTokensRepository.delete({
						id: ps.tokenId,
						userId: me.id,
					});
					await this.callsMediaRevocationService.revokeUser(me.id, 'logout');
				}
			} else if (ps.token) {
				const tokenExist = await this.accessTokensRepository.exists({ where: { token: ps.token } });

				if (tokenExist) {
					await this.accessTokensRepository.delete({
						token: ps.token,
						userId: me.id,
					});
					await this.callsMediaRevocationService.revokeUser(me.id, 'logout');
				}
			}
		});
	}
}
