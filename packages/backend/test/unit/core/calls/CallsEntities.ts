/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { getMetadataArgsStorage } from 'typeorm';
import { MiCallsParticipant } from '@/models/CallsParticipant.js';
import { MiCallsRoom } from '@/models/CallsRoom.js';

describe('Calls entity constraints', () => {
	test('room metadata enforces attachment, lifecycle, revision, visibility, and state invariants', () => {
		const storage = getMetadataArgsStorage();
		const checks = storage.checks.filter(check => check.target === MiCallsRoom).map(check => check.name);
		expect(checks).toEqual(expect.arrayContaining([
			'CHK_calls_room_attachment',
			'CHK_calls_room_lifecycle',
			'CHK_calls_room_revision',
			'CHK_calls_room_visibility',
			'CHK_calls_room_state',
		]));
	});

	test('participant metadata permits one membership and one host per room', () => {
		const storage = getMetadataArgsStorage();
		const indices = storage.indices.filter(index => index.target === MiCallsParticipant);
		expect(indices).toEqual(expect.arrayContaining([
			expect.objectContaining({ columns: ['roomId', 'userId'], unique: true }),
			expect.objectContaining({ name: 'IDX_calls_participant_one_host', columns: ['roomId'], unique: true }),
		]));
		const checks = storage.checks.filter(check => check.target === MiCallsParticipant).map(check => check.name);
		expect(checks).toEqual(expect.arrayContaining(['CHK_calls_participant_role', 'CHK_calls_participant_state', 'CHK_calls_participant_lifecycle']));
	});
});
