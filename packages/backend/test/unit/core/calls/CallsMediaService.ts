/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CallsMediaAccessError, CallsMediaService } from '@/core/calls/CallsMediaService.js';
import { StaleCallsConnectionError } from '@/core/calls/CallsLiveConnectionService.js';
import type { MiCallsParticipant, MiCallsRoom, MiUser } from '@/models/_.js';

const user = { id: 'user-a', host: null } as MiUser;
const room = { id: 'room-a', state: 'open', revision: 1 } as MiCallsRoom;

function createFixture(role: MiCallsParticipant['role'] = 'speaker') {
	const participant = { id: 'participant-a', roomId: room.id, userId: user.id, role, state: 'active' } as MiCallsParticipant;
	const participants = {
		findOneBy: vi.fn().mockResolvedValue(participant),
		findBy: vi.fn().mockResolvedValue([]),
	};
	const rooms = { getRoom: vi.fn().mockResolvedValue(room), assertCanAccess: vi.fn().mockResolvedValue(undefined), snapshot: vi.fn() };
	const live = {
		replace: vi.fn().mockResolvedValue({ current: { participantId: participant.id, connectionId: 'connection-a', generation: 2, applicationId: 'app-a', sessionId: null }, previous: null }),
		bindSession: vi.fn().mockResolvedValue(undefined),
		assertCurrent: vi.fn().mockResolvedValue({ participantId: participant.id, connectionId: 'connection-a', generation: 2, applicationId: 'app-a', sessionId: 'session-a' }),
		clear: vi.fn().mockResolvedValue(true),
	};
	const bindings = { getPublication: vi.fn(), createPublication: vi.fn(), removePublication: vi.fn(), listRoomPublications: vi.fn() };
	const provider = { createSession: vi.fn(), addTracks: vi.fn(), closeTracks: vi.fn(), renegotiate: vi.fn() };
	const events = { publish: vi.fn() };
	const revocation = { closeGeneration: vi.fn(), revokeLostGeneration: vi.fn() };
	const quota = { reserveSession: vi.fn(), releaseSession: vi.fn(), reserveTrack: vi.fn(), releaseTrack: vi.fn(), touch: vi.fn(), release: vi.fn() };
	const telemetry = { lifecycle: vi.fn() };
	const service = new CallsMediaService(participants as never, rooms as never, live as never, bindings as never, provider as never, events as never, revocation as never, quota as never, telemetry as never);
	return { service, participant, participants, rooms, live, bindings, provider, events, revocation, quota };
}

describe('CallsMediaService authorization boundaries', () => {
	beforeEach(() => vi.clearAllMocks());

	test('listener cannot publish and never reaches the provider', async () => {
		const fixture = createFixture('listener');
		await expect(fixture.service.publish(user, { roomId: room.id, connectionId: 'connection-a', generation: 2, mid: '0', sessionDescription: { type: 'offer', sdp: 'offer' } })).rejects.toBeInstanceOf(CallsMediaAccessError);
		expect(fixture.live.assertCurrent).not.toHaveBeenCalled();
		expect(fixture.provider.addTracks).not.toHaveBeenCalled();
	});

	test('cross-room publication cannot be subscribed', async () => {
		const fixture = createFixture();
		fixture.bindings.getPublication.mockResolvedValue({ id: 'publication-a', roomId: 'room-b', participantId: 'participant-b' });
		await expect(fixture.service.subscribe(user, { roomId: room.id, connectionId: 'connection-a', generation: 2, publicationIds: ['publication-a'] })).rejects.toBeInstanceOf(CallsMediaAccessError);
		expect(fixture.provider.addTracks).not.toHaveBeenCalled();
	});

	test('provider session failure clears the newly installed generation and releases quota', async () => {
		const fixture = createFixture();
		fixture.provider.createSession.mockRejectedValue(new Error('provider unavailable'));
		await expect(fixture.service.createSession(user, { roomId: room.id, connectionId: 'connection-a', applicationId: 'app-a' })).rejects.toThrow('provider unavailable');
		expect(fixture.live.clear).toHaveBeenCalledWith('participant-a', 'connection-a', 2);
		expect(fixture.quota.releaseSession).toHaveBeenCalledWith('app-a', 'participant-a');
	});

	test('publication close enforces participant and generation ownership', async () => {
		const fixture = createFixture();
		fixture.bindings.getPublication.mockResolvedValue({ id: 'publication-a', roomId: room.id, participantId: 'participant-b', generation: 2 });
		await expect(fixture.service.closePublication(user, { roomId: room.id, connectionId: 'connection-a', generation: 2, publicationId: 'publication-a' })).rejects.toBeInstanceOf(CallsMediaAccessError);
		expect(fixture.provider.closeTracks).not.toHaveBeenCalled();
	});

	test('heartbeat turns lost Redis live state into a targeted generation reset', async () => {
		const fixture = createFixture();
		fixture.live.assertCurrent.mockRejectedValue(new StaleCallsConnectionError());
		await expect(fixture.service.heartbeat(user, room.id, 'connection-a', 7)).rejects.toBeInstanceOf(StaleCallsConnectionError);
		expect(fixture.revocation.revokeLostGeneration).toHaveBeenCalledWith(fixture.participant, 7, room.revision);
	});
});
