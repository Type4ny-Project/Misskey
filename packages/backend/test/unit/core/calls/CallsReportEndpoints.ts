/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, expect, test, vi } from 'vitest';
import ReportAbuse from '@/server/api/endpoints/calls/rooms/report-abuse.js';
import Recording, { meta as recordingMeta } from '@/server/api/endpoints/admin/abuse-user-report-recording.js';
import type { MiLocalUser } from '@/models/User.js';

const reporter = { id: 'reportera' } as MiLocalUser;
const params = { roomId: 'rooma', userId: 'targeta', comment: 'Abuse in this call', reportedAt: 1791120000000 };
const rooms = { findOneBy: vi.fn() };
const participants = { findOneBy: vi.fn() };
const getter = { getUser: vi.fn() };
const roles = { isAdministrator: vi.fn() };
const reports = { report: vi.fn() };
const endpoint = new ReportAbuse(rooms as never, participants as never, getter as never, roles as never, reports as never);

function wav(seconds = 60): Buffer {
	const buffer = Buffer.alloc(44 + seconds * 12000, 128);
	buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4);
	buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(12000, 24); buffer.writeUInt32LE(12000, 28);
	buffer.writeUInt16LE(1, 32); buffer.writeUInt16LE(8, 34);
	buffer.write('data', 36); buffer.writeUInt32LE(buffer.length - 44, 40);
	return buffer;
}

beforeEach(() => {
	vi.resetAllMocks();
	rooms.findOneBy.mockResolvedValue({ id: params.roomId, title: 'Call title', state: 'ended' });
	participants.findOneBy.mockResolvedValue({ state: 'left' });
	getter.getUser.mockResolvedValue({ id: params.userId, host: null });
	roles.isAdministrator.mockResolvedValue(false);
});

test('saves the room context and audio after the call has ended', async () => {
	const recording = wav();
	await endpoint.exec({ ...params, recording: recording.toString('base64') }, reporter, null);
	expect(reports.report).toHaveBeenCalledWith([{
		targetUserId: params.userId, targetUserHost: null, reporterId: reporter.id, reporterHost: null, comment: params.comment,
		callsContext: { roomId: params.roomId, roomTitle: 'Call title', reportedAt: params.reportedAt, hasRecording: true },
		callsRecording: recording,
	}]);
});

test('allows a text-only report', async () => {
	await endpoint.exec(params, reporter, null);
	expect(reports.report.mock.calls[0][0][0]).toMatchObject({ callsContext: { hasRecording: false }, callsRecording: null });
});

test.each([0, 1])('rejects a report when participant %i has never joined the room', async missingIndex => {
	participants.findOneBy.mockReset()
		.mockResolvedValueOnce(missingIndex === 0 ? null : {})
		.mockResolvedValueOnce(missingIndex === 1 ? null : {});
	await expect(endpoint.exec(params, reporter, null)).rejects.toMatchObject({ code: 'CALLS_ACCESS_DENIED' });
	expect(reports.report).not.toHaveBeenCalled();
});

test.each(['self', 'admin'])('preserves the existing restriction on reporting %s', async target => {
	roles.isAdministrator.mockResolvedValue(target === 'admin');
	await expect(endpoint.exec({ ...params, userId: target === 'self' ? reporter.id : params.userId }, reporter, null)).rejects.toMatchObject({ code: target === 'self' ? 'CANNOT_REPORT_YOURSELF' : 'CANNOT_REPORT_THE_ADMIN' });
	expect(reports.report).not.toHaveBeenCalled();
});

test.each(['malformed', 'too-long'])('rejects %s audio evidence', async kind => {
	const recording = kind === 'too-long' ? wav(61) : Buffer.from('not audio');
	await expect(endpoint.exec({ ...params, recording: recording.toString('base64') }, reporter, null)).rejects.toMatchObject({ code: kind === 'too-long' ? 'INVALID_PARAM' : 'INVALID_CALLS_RECORDING' });
	expect(reports.report).not.toHaveBeenCalled();
});

test('retrieves evidence by report ID through the moderator-only API', async () => {
	const recording = wav(1);
	const query = { select: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), getOne: vi.fn().mockResolvedValue({ id: 'reporta', callsRecording: recording }) };
	const repository = { createQueryBuilder: vi.fn().mockReturnValue(query) };
	expect(recordingMeta.requireModerator).toBe(true);
	expect(recordingMeta.kind).toBe('read:admin:abuse-user-reports');
	await expect(new Recording(repository as never).exec({ reportId: 'reporta' }, reporter, null)).resolves.toEqual({ recording: recording.toString('base64') });
	query.getOne.mockResolvedValue(null);
	await expect(new Recording(repository as never).exec({ reportId: 'missinga' }, reporter, null)).rejects.toMatchObject({ code: 'NO_SUCH_REPORT' });
});
