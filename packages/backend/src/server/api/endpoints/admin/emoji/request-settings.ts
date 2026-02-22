/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';

export const meta = {
	tags: ['admin', 'emoji'],

	requireCredential: true,

	secure: true,

	requireAdmin: true,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			autoApproveEmojiRequest: { type: 'boolean' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		private metaService: MetaService,
	) {
		super(meta, paramDef, async () => {
			const instance = await this.metaService.fetch(true);

			return {
				autoApproveEmojiRequest: instance.policies?.autoApproveEmojiRequest !== false,
			};
		});
	}
}
