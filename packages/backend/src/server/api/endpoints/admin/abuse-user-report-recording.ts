/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { AbuseUserReportsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:abuse-user-reports',
	errors: {
		noSuchReport: { message: 'No such report.', code: 'NO_SUCH_REPORT', id: '824bd57e-8ce6-4d32-8b86-474933ce7a41' },
	},
	res: {
		type: 'object', nullable: false, optional: false,
		properties: {
			recording: { type: 'string', nullable: true, optional: false, description: 'Base64-encoded audio/wav evidence.' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { reportId: { type: 'string', format: 'misskey:id' } },
	required: ['reportId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(@Inject(DI.abuseUserReportsRepository) reports: AbuseUserReportsRepository) {
		super(meta, paramDef, async ps => {
			const report = await reports.createQueryBuilder('report')
				.select(['report.id', 'report.callsRecording'])
				.where('report.id = :id', { id: ps.reportId })
				.getOne();
			if (report == null) throw new ApiError(meta.errors.noSuchReport);
			return { recording: report.callsRecording?.toString('base64') ?? null };
		});
	}
}
