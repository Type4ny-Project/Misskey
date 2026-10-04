/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { CallsRoomsRepository, CallsParticipantsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { GetterService } from '@/server/api/GetterService.js';
import { RoleService } from '@/core/RoleService.js';
import { AbuseReportService } from '@/core/AbuseReportService.js';
import { meta as userReportMeta } from '../../users/report-abuse.js';
import { callsErrors } from '../_shared.js';

export const meta = {
	tags: ['calls'], stability: 'experimental',
	requireCredential: true, kind: 'write:report-abuse',
	limit: { duration: 60 * 60 * 1000, max: 20 },
	errors: {
		...userReportMeta.errors,
		accessDenied: callsErrors.accessDenied,
		roomNotFound: callsErrors.roomNotFound,
		invalidRecording: { message: 'Invalid Calls recording.', code: 'INVALID_CALLS_RECORDING', id: '3fd4d7e4-0515-4368-92db-e15af920927d' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
		comment: { type: 'string', minLength: 1, maxLength: 2048 },
		reportedAt: { type: 'integer', minimum: 0 },
		// 60 seconds of mono 12 kHz, 8-bit PCM fits the API's 1 MiB request limit.
		recording: { type: 'string', maxLength: 960060 },
	},
	required: ['roomId', 'userId', 'comment', 'reportedAt'],
} as const;

function decodeRecording(encoded: string): Buffer {
	const wav = Buffer.from(encoded, 'base64');
	if (wav.length <= 44 || wav.length > 720044 || wav.toString('base64') !== encoded ||
		wav.toString('ascii', 0, 4) !== 'RIFF' || wav.readUInt32LE(4) !== wav.length - 8 ||
		wav.toString('ascii', 8, 16) !== 'WAVEfmt ' || wav.readUInt32LE(16) !== 16 ||
		wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 ||
		wav.readUInt32LE(24) !== 12000 || wav.readUInt32LE(28) !== 12000 ||
		wav.readUInt16LE(32) !== 1 || wav.readUInt16LE(34) !== 8 ||
		wav.toString('ascii', 36, 40) !== 'data' || wav.readUInt32LE(40) !== wav.length - 44) {
		throw new ApiError(meta.errors.invalidRecording);
	}
	return wav;
}

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.callsRoomsRepository) rooms: CallsRoomsRepository,
		@Inject(DI.callsParticipantsRepository) participants: CallsParticipantsRepository,
		getter: GetterService,
		roles: RoleService,
		reports: AbuseReportService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const room = await rooms.findOneBy({ id: ps.roomId });
			if (room == null) throw new ApiError(meta.errors.roomNotFound);
			const [reporter, target] = await Promise.all([
				participants.findOneBy({ roomId: ps.roomId, userId: me.id }),
				participants.findOneBy({ roomId: ps.roomId, userId: ps.userId }),
			]);
			// A report may be submitted after the 30-second capture or after leaving the call.
			if (reporter == null || target == null) throw new ApiError(meta.errors.accessDenied);
			if (me.id === ps.userId) throw new ApiError(meta.errors.cannotReportYourself);
			const user = await getter.getUser(ps.userId);
			if (await roles.isAdministrator(user)) throw new ApiError(meta.errors.cannotReportAdmin);
			const recording = ps.recording == null ? null : decodeRecording(ps.recording);
			await reports.report([{
				targetUserId: user.id, targetUserHost: user.host,
				reporterId: me.id, reporterHost: null, comment: ps.comment,
				callsContext: { roomId: room.id, roomTitle: room.title, reportedAt: ps.reportedAt, hasRecording: recording != null },
				callsRecording: recording,
			}]);
		});
	}
}
