/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CallsConnectionExistsError, CallsMediaAccessError, CallsMediaService } from '@/core/calls/CallsMediaService.js';
import { StaleCallsConnectionError } from '@/core/calls/CallsLiveConnectionService.js';
import { CallsRoomError } from '@/core/calls/CallsRoomService.js';
import type { MiCallsParticipant, MiCallsRoom, MiUser } from '@/models/_.js';

const user = { id: 'user-a', host: null } as MiUser;
const room = { id: 'room-a', state: 'open', revision: 1 } as MiCallsRoom;

function createFixture(role: MiCallsParticipant['role'] = 'speaker') {
	const participant = { id: 'participant-a', roomId: room.id, userId: user.id, role, state: 'active' } as MiCallsParticipant;
	const participants = {
		findOneBy: vi.fn().mockResolvedValue(participant),
		findBy: vi.fn().mockResolvedValue([]),
	};
	const rooms = { getRoom: vi.fn().mockResolvedValue(room), assertCanAccess: vi.fn().mockResolvedValue(undefined), assertCanJoin: vi.fn().mockResolvedValue(undefined), snapshot: vi.fn(), leave: vi.fn().mockResolvedValue(undefined) };
	const live = {
		get: vi.fn().mockResolvedValue(null),
		withRoomLock: vi.fn(async (_roomId: string, callback: (assertHeld: () => Promise<void>) => Promise<unknown>) => callback(async () => undefined)),
		replace: vi.fn().mockResolvedValue({ current: { participantId: participant.id, connectionId: 'connection-a', generation: 2, applicationId: 'app-a', sessionId: null }, previous: null }),
		bindSession: vi.fn().mockResolvedValue(undefined),
		assertCurrent: vi.fn().mockResolvedValue({ participantId: participant.id, connectionId: 'connection-a', generation: 2, applicationId: 'app-a', sessionId: 'session-a' }),
		clear: vi.fn().mockResolvedValue(true),
		heartbeat: vi.fn(),
		touchHost: vi.fn(),
	};
	const bindings = { getPublication: vi.fn(), createPublication: vi.fn(), removePublication: vi.fn(), listRoomPublications: vi.fn().mockResolvedValue([]), heartbeat: vi.fn(), addSubscriptions: vi.fn(), clearSubscriptions: vi.fn().mockResolvedValue([]) };
	const provider = { createSession: vi.fn().mockResolvedValue({ sessionId: 'session-a' }), addTracks: vi.fn(), closeTracks: vi.fn(), renegotiate: vi.fn() };
	const events = { publish: vi.fn() };
	const revocation = { closeGeneration: vi.fn(), revokeLostGeneration: vi.fn() };
	const quota = { reserveSession: vi.fn(), releaseSession: vi.fn(), reserveTrack: vi.fn(), releaseTrack: vi.fn(), touch: vi.fn(), release: vi.fn() };
	const telemetry = { lifecycle: vi.fn() };
	const service = new CallsMediaService(participants as never, rooms as never, live as never, bindings as never, provider as never, events as never, revocation as never, quota as never, telemetry as never);
	return { service, participant, participants, rooms, live, bindings, provider, events, revocation, quota };
}

describe('CallsMediaService authorization boundaries', () => {
	test.each(['host', 'listener'] as const)('only the host heartbeat renews the room deadline (role: %s)', async role => {
		const fixture = createFixture(role);
		await fixture.service.heartbeat(user, room.id, 'connection-a', 2);
		if (role === 'host') expect(fixture.live.touchHost).toHaveBeenCalledWith(room.id);
		else expect(fixture.live.touchHost).not.toHaveBeenCalled();
	});

	beforeEach(() => vi.clearAllMocks());

	test('revokes existing media when a heartbeat observes access loss', async () => {
		const fixture = createFixture('listener');
		fixture.rooms.assertCanAccess.mockRejectedValue(new CallsRoomError('access-denied'));
		await expect(fixture.service.heartbeat(user, room.id, 'connection-a', 2)).rejects.toMatchObject({ code: 'access-denied' });
		expect(fixture.rooms.leave).toHaveBeenCalledWith(user, room.id);
		expect(fixture.live.heartbeat).not.toHaveBeenCalled();
	});

	test.each(['connect', 'heartbeat'] as const)('rejects media %s when the role disallows participation', async operation => {
		const fixture = createFixture('listener');
		fixture.rooms.assertCanJoin.mockRejectedValue(new CallsRoomError('access-denied'));
		await expect(operation === 'connect'
			? fixture.service.createSession(user, { roomId: room.id, connectionId: 'connection-a', applicationId: 'app-a' })
			: fixture.service.heartbeat(user, room.id, 'connection-a', 2)).rejects.toMatchObject({ code: 'access-denied' });
		expect(fixture.rooms.leave).toHaveBeenCalledWith(user, room.id);
		expect(fixture.provider.createSession).not.toHaveBeenCalled();
		expect(fixture.live.heartbeat).not.toHaveBeenCalled();
	});

	test.each(['removed', 'demoted', 'replaced'] as const)('closes a pending publication when its participant is %s', async change => {
		const fixture = createFixture();
		let finishProvider!: (response: { tracks: Array<{ mid: string }> }) => void;
		fixture.provider.addTracks.mockImplementation(() => new Promise(resolve => { finishProvider = resolve; }));
		const publishing = fixture.service.publish(user, { roomId: room.id, connectionId: 'connection-a', generation: 2, mid: '0', sessionDescription: { type: 'offer', sdp: 'offer' } });
		const rejected = expect(publishing).rejects.toBeInstanceOf(change === 'replaced' ? StaleCallsConnectionError : change === 'removed' ? CallsRoomError : CallsMediaAccessError);
		await vi.waitFor(() => expect(fixture.provider.addTracks).toHaveBeenCalled());
		if (change === 'removed') fixture.participants.findOneBy.mockResolvedValue(null as never);
		if (change === 'demoted') fixture.participant.role = 'listener';
		if (change === 'replaced') fixture.live.assertCurrent.mockRejectedValue(new StaleCallsConnectionError());
		finishProvider({ tracks: [{ mid: '0' }] });
		await rejected;
		expect(fixture.provider.closeTracks).toHaveBeenCalledWith('session-a', [{ mid: '0' }], true);
		expect(fixture.bindings.createPublication).not.toHaveBeenCalled();
		expect(fixture.quota.releaseTrack).toHaveBeenCalled();
	});

	test('removes a publication registered while its generation is revoked', async () => {
		const fixture = createFixture();
		fixture.provider.addTracks.mockResolvedValue({ tracks: [{ mid: '0' }] });
		fixture.bindings.createPublication.mockImplementation(async () => {
			fixture.live.assertCurrent.mockRejectedValue(new StaleCallsConnectionError());
			return { id: 'publication-a' };
		});
		await expect(fixture.service.publish(user, { roomId: room.id, connectionId: 'connection-a', generation: 2, mid: '0', sessionDescription: { type: 'offer', sdp: 'offer' } })).rejects.toBeInstanceOf(StaleCallsConnectionError);
		expect(fixture.provider.closeTracks).toHaveBeenCalledWith('session-a', [{ mid: '0' }], true);
		expect(fixture.bindings.removePublication).toHaveBeenCalledWith('publication-a');
	});

	test('closes a subscription completed after the listener was removed', async () => {
		const fixture = createFixture('listener');
		fixture.bindings.getPublication.mockResolvedValue({ id: 'publication-a', roomId: room.id, participantId: 'publisher', providerSessionId: 'publisher-session', providerTrackName: 'audio' });
		fixture.participants.findBy.mockResolvedValue([{ id: 'publisher', state: 'active', role: 'speaker' }] as never);
		fixture.provider.addTracks.mockImplementation(async () => {
			fixture.participants.findOneBy.mockResolvedValue(null as never);
			return { tracks: [{ mid: '1', sessionId: 'publisher-session', trackName: 'audio' }] };
		});
		await expect(fixture.service.subscribe(user, { roomId: room.id, connectionId: 'connection-a', generation: 2, publicationIds: ['publication-a'] })).rejects.toMatchObject({ code: 'participant-not-found' });
		expect(fixture.provider.closeTracks).toHaveBeenCalledWith('session-a', [{ mid: '1' }], true);
		expect(fixture.bindings.clearSubscriptions).toHaveBeenCalledWith(fixture.participant.id, 2);
	});

	test('listener cannot publish and never reaches the provider', async () => {
		const fixture = createFixture('listener');
		await expect(fixture.service.publish(user, { roomId: room.id, connectionId: 'connection-a', generation: 2, mid: '0', sessionDescription: { type: 'offer', sdp: 'offer' } })).rejects.toBeInstanceOf(CallsMediaAccessError);
		expect(fixture.live.assertCurrent).not.toHaveBeenCalled();
		expect(fixture.provider.addTracks).not.toHaveBeenCalled();
	});

	test.each(['microphone', 'camera', 'screen'] as const)('publishes %s with its media kind, source and separate quota', async mediaSource => {
		const fixture = createFixture();
		fixture.provider.addTracks.mockResolvedValue({ tracks: [{ mid: '1' }] });
		fixture.bindings.createPublication.mockResolvedValue({ id: 'public-id' });
		await fixture.service.publish(user, { roomId: room.id, connectionId: 'connection-a', generation: 2, mid: '1', mediaSource, sessionDescription: { type: 'offer', sdp: 'offer' } });
		const mediaKind = mediaSource === 'microphone' ? 'audio' : 'video';
		expect(fixture.provider.addTracks).toHaveBeenCalledWith('session-a', [expect.objectContaining({ kind: mediaKind, trackName: `${mediaSource}-participant-a-2-1` })], expect.anything());
		expect(fixture.bindings.createPublication).toHaveBeenCalledWith(expect.objectContaining({ mediaKind, mediaSource }));
		expect(fixture.quota.reserveTrack).toHaveBeenCalledWith('app-a', `${mediaSource}-participant-a-2-1`);
	});

	test('maps subscription mids to public IDs even when provider results are reordered', async () => {
		const fixture = createFixture('listener');
		const publications = [
			{ id: 'audio-id', roomId: room.id, participantId: 'publisher', providerSessionId: 'private-session', providerTrackName: 'private-audio', mediaKind: 'audio' },
			{ id: 'screen-id', roomId: room.id, participantId: 'publisher', providerSessionId: 'private-session', providerTrackName: 'private-screen', mediaKind: 'video' },
		];
		fixture.bindings.getPublication.mockImplementation(async id => publications.find(publication => publication.id === id));
		fixture.participants.findBy.mockResolvedValue([{ id: 'publisher', state: 'active', role: 'speaker' }] as never);
		fixture.provider.addTracks.mockResolvedValue({ tracks: [
			{ sessionId: 'private-session', trackName: 'private-screen', mid: '2' },
			{ sessionId: 'private-session', trackName: 'private-audio', mid: '1' },
		] });
		const result = await fixture.service.subscribe(user, { roomId: room.id, connectionId: 'connection-a', generation: 2, publicationIds: ['audio-id', 'screen-id'] });
		expect(result.subscriptions).toEqual([{ publicationId: 'screen-id', mid: '2' }, { publicationId: 'audio-id', mid: '1' }]);
		expect(fixture.provider.addTracks).toHaveBeenCalledWith('session-a', [expect.objectContaining({ kind: 'audio' }), expect.objectContaining({ kind: 'video' })]);
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
		expect(fixture.revocation.revokeLostGeneration).toHaveBeenCalledWith(fixture.participant, 7, room.revision, 'connection-a');
		expect(fixture.bindings.heartbeat).not.toHaveBeenCalled();
	});

	test('heartbeat keeps the current participant publications alive', async () => {
		const fixture = createFixture('host');
		await fixture.service.heartbeat(user, room.id, 'connection-a', 2);
		expect(fixture.bindings.heartbeat).toHaveBeenCalledWith(room.id, fixture.participant.id, 2);
	});

	test('a new device replaces only the previous connection', async () => {
		const fixture = createFixture();
		fixture.live.get.mockResolvedValue({ connectionId: 'old-device', generation: 1 });
		fixture.live.replace.mockResolvedValue({ current: { participantId: fixture.participant.id, connectionId: 'connection-a', generation: 2, applicationId: 'app-a', sessionId: null }, previous: { connectionId: 'old-device', generation: 1, applicationId: 'app-a' } } as never);
		await fixture.service.createSession(user, { roomId: room.id, connectionId: 'connection-a', applicationId: 'app-a', replaceExisting: true });
		expect(fixture.events.publish).toHaveBeenCalledWith(room.id, room.revision, 'revoked', { participantId: fixture.participant.id, reason: 'replaced', connectionId: 'old-device', generation: 1 });
		expect(fixture.revocation.closeGeneration).toHaveBeenCalledWith(fixture.participant.id, 1);
		expect(fixture.live.bindSession).toHaveBeenCalledWith(fixture.participant.id, 'connection-a', 2, 'session-a');
	});

	test('joining from another device requires confirmation before touching the existing connection', async () => {
		const fixture = createFixture();
		fixture.live.get.mockResolvedValue({ connectionId: 'old-device', generation: 1 });
		await expect(fixture.service.createSession(user, { roomId: room.id, connectionId: 'new-device', applicationId: 'app-a' })).rejects.toBeInstanceOf(CallsConnectionExistsError);
		expect(fixture.live.replace).not.toHaveBeenCalled();
		expect(fixture.revocation.closeGeneration).not.toHaveBeenCalled();
		expect(fixture.provider.createSession).not.toHaveBeenCalled();
		expect(fixture.quota.reserveSession).not.toHaveBeenCalled();
	});

	test('an old device cannot recover over the new connection or release its quota', async () => {
		const fixture = createFixture();
		fixture.live.get.mockResolvedValue({ connectionId: 'new-device', generation: 3 });
		await expect(fixture.service.createSession(user, { roomId: room.id, connectionId: 'old-device', applicationId: 'app-a', expectedGeneration: 2 })).rejects.toBeInstanceOf(StaleCallsConnectionError);
		expect(fixture.live.replace).not.toHaveBeenCalled();
		expect(fixture.quota.reserveSession).not.toHaveBeenCalled();
		expect(fixture.quota.releaseSession).not.toHaveBeenCalled();
	});

	test('an old heartbeat targets the old device without revoking the new credentials', async () => {
		const fixture = createFixture();
		fixture.live.assertCurrent.mockRejectedValue(new StaleCallsConnectionError());
		fixture.live.get.mockResolvedValue({ connectionId: 'new-device', generation: 3 });
		await expect(fixture.service.heartbeat(user, room.id, 'old-device', 2)).rejects.toBeInstanceOf(StaleCallsConnectionError);
		expect(fixture.events.publish).toHaveBeenCalledWith(room.id, room.revision, 'revoked', { participantId: fixture.participant.id, reason: 'replaced', connectionId: 'old-device', generation: 2 });
		expect(fixture.revocation.revokeLostGeneration).not.toHaveBeenCalled();
	});

	test.each([null, { connectionId: 'connection-a', generation: 1 }])('allows recovery when the live connection is missing or still belongs to this device: %j', async current => {
		const fixture = createFixture();
		fixture.live.get.mockResolvedValue(current);
		await fixture.service.createSession(user, { roomId: room.id, connectionId: 'connection-a', applicationId: 'app-a', expectedGeneration: 1 });
		expect(fixture.live.bindSession).toHaveBeenCalledWith(fixture.participant.id, 'connection-a', 2, 'session-a');
	});
});
