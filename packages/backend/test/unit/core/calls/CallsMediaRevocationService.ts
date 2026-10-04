/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { CallsMediaRevocationService } from '@/core/calls/CallsMediaRevocationService.js';
import { CloudflareRealtimeClient } from '@/core/calls/CloudflareRealtimeClient.js';
import type { Config } from '@/config.js';
import type { MiCallsParticipant } from '@/models/_.js';

const participant = { id: 'participant-a', roomId: 'room-a', userId: 'user-a', state: 'active' } as MiCallsParticipant;

describe('CallsMediaRevocationService', () => {
	test.each(['camera', 'screen'] as const)('stops only the target participant’s %s and publishes its removal', async mediaSource => {
		const publications = ['microphone', 'camera', 'screen'].map((source, index) => ({ id: source, participantId: participant.id, mediaSource: source, mediaKind: source === 'microphone' ? 'audio' : 'video', providerSessionId: 'session-a', providerMid: String(index), applicationId: 'app-a', providerTrackName: source }));
		const bindings = { listRoomPublications: vi.fn().mockResolvedValue([...publications, { ...publications[1], id: 'other-camera', participantId: 'other-participant' }]), removePublication: vi.fn() };
		const provider = { closeTracks: vi.fn() };
		const events = { publish: vi.fn() };
		const quota = { releaseTrack: vi.fn() };
		const service = new CallsMediaRevocationService({} as never, {} as never, {} as never, bindings as never, provider as never, events as never, {} as never, quota as never);
		await service.stopParticipantVideo(participant, mediaSource, 2);
		expect(provider.closeTracks).toHaveBeenCalledExactlyOnceWith('session-a', [{ mid: mediaSource === 'camera' ? '1' : '2' }], true);
		expect(bindings.removePublication).toHaveBeenCalledExactlyOnceWith(mediaSource);
		expect(quota.releaseTrack).toHaveBeenCalledExactlyOnceWith('app-a', mediaSource);
		expect(events.publish).toHaveBeenCalledExactlyOnceWith(participant.roomId, 2, 'videoStopped', { participantId: participant.id, mediaSource });
	});

	test('retries a failed video stop notification after removing its publication binding', async () => {
		const publications = [{ id: 'camera', participantId: participant.id, mediaSource: 'camera', providerSessionId: 'session-a', providerMid: '1', applicationId: 'app-a', providerTrackName: 'camera' }];
		const bindings = {
			listRoomPublications: vi.fn().mockResolvedValueOnce(publications).mockResolvedValue([]),
			removePublication: vi.fn(),
		};
		const provider = { closeTracks: vi.fn() };
		const events = { publish: vi.fn().mockRejectedValueOnce(new Error('publish failed')).mockResolvedValue(undefined) };
		const service = new CallsMediaRevocationService({} as never, {} as never, {} as never, bindings as never, provider as never, events as never, {} as never, { releaseTrack: vi.fn() } as never);
		await expect(service.stopParticipantVideo(participant, 'camera', 2)).rejects.toThrow('publish failed');
		expect(bindings.removePublication).toHaveBeenCalledExactlyOnceWith('camera');
		await service.stopParticipantVideo(participant, 'camera', 3);
		expect(events.publish).toHaveBeenCalledTimes(2);
		expect(events.publish).toHaveBeenLastCalledWith(participant.roomId, 3, 'videoStopped', { participantId: participant.id, mediaSource: 'camera' });
		expect(provider.closeTracks).toHaveBeenCalledTimes(1);
		expect(bindings.removePublication).toHaveBeenCalledTimes(1);
	});

	test('keeps video bindings and quota when stopping the provider track fails', async () => {
		const bindings = { listRoomPublications: vi.fn().mockResolvedValue([{ id: 'camera', participantId: participant.id, mediaSource: 'camera', providerSessionId: 'session-a', providerMid: '1' }]), removePublication: vi.fn() };
		const quota = { releaseTrack: vi.fn() };
		const events = { publish: vi.fn() };
		const service = new CallsMediaRevocationService({} as never, {} as never, {} as never, bindings as never, { closeTracks: vi.fn().mockRejectedValue(new Error('close failed')) } as never, events as never, {} as never, quota as never);
		await expect(service.stopParticipantVideo(participant, 'camera', 2)).rejects.toThrow('close failed');
		expect(bindings.removePublication).not.toHaveBeenCalled();
		expect(quota.releaseTrack).not.toHaveBeenCalled();
		expect(events.publish).not.toHaveBeenCalled();
	});

	afterEach(() => vi.unstubAllGlobals());

	test('completes room revocation and releases media bindings after the provider session is gone', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('Session is gone', { status: 410 })));
		const provider = new CloudflareRealtimeClient({ cloudflareRealtime: { enabled: true, appId: 'app', appSecret: 'secret' } } as Config, { providerOperation: vi.fn() } as never);
		const publications = [{ participantId: participant.id, generation: 3, providerSessionId: 'session', providerMid: '0', applicationId: 'app', providerTrackName: 'audio' }];
		const bindings = { listGenerationPublications: vi.fn().mockResolvedValue(publications), listSubscriptions: vi.fn().mockResolvedValue([]), clearGeneration: vi.fn(), clearSubscriptions: vi.fn() };
		const events = { publish: vi.fn() };
		const quota = { releaseTrack: vi.fn(), release: vi.fn() };
		const turn = { revokeParticipant: vi.fn() };
		const service = new CallsMediaRevocationService(
			{} as never, { findBy: async () => [participant] } as never,
			{ get: async () => ({ connectionId: 'connection', generation: 3, applicationId: 'app' }), clear: vi.fn() } as never,
			bindings as never, provider, events as never, turn as never, quota as never,
		);
		await service.revokeRoom(participant.roomId, 6, 'room-ended');
		expect(bindings.clearGeneration).toHaveBeenCalledWith(participant.id, 3);
		expect(bindings.clearSubscriptions).toHaveBeenCalledWith(participant.id, 3);
		expect(quota.releaseTrack).toHaveBeenCalledWith('app', 'audio');
		expect(quota.release).toHaveBeenCalledWith('app', participant.id);
		expect(turn.revokeParticipant).toHaveBeenCalledWith(participant.id);
		expect(events.publish).toHaveBeenCalledWith(participant.roomId, 6, 'revoked', { participantId: participant.id, reason: 'room-ended' });
	});

	test('closes host tracks even after the live connection expired', async () => {
		const publications = [{ id: 'publication-a', participantId: participant.id, generation: 3, providerSessionId: 'host-session', providerMid: '0', applicationId: 'app-a', providerTrackName: 'camera' }];
		const bindings = { listRoomPublications: vi.fn().mockResolvedValue(publications), listGenerationPublications: vi.fn().mockResolvedValue(publications), listSubscriptions: vi.fn().mockResolvedValue([]), clearGeneration: vi.fn(), clearSubscriptions: vi.fn() };
		const provider = { closeTracks: vi.fn() };
		const service = new CallsMediaRevocationService(
			{} as never, {} as never, { get: async () => null } as never, bindings as never, provider as never,
			{ publish: vi.fn() } as never, { revokeParticipant: vi.fn() } as never, { release: vi.fn(), releaseTrack: vi.fn() } as never,
		);
		await service.revokeParticipant(participant, 8, 'room-ended');
		expect(provider.closeTracks).toHaveBeenCalledWith('host-session', [{ mid: '0' }], true);
		expect(bindings.clearGeneration).toHaveBeenCalledWith(participant.id, 3);
	});

	test('retains close bindings when the provider fails and does not release track quota', async () => {
		const bindings = { listGenerationPublications: vi.fn().mockResolvedValue([{ providerSessionId: 'session-a', providerMid: '1', applicationId: 'app-a', providerTrackName: 'audio' }]), listSubscriptions: vi.fn().mockResolvedValue([]), clearGeneration: vi.fn(), clearSubscriptions: vi.fn() };
		const quota = { releaseTrack: vi.fn() };
		const provider = { closeTracks: vi.fn().mockRejectedValue(new Error('close failed')) };
		const service = new CallsMediaRevocationService({} as never, {} as never, {} as never, bindings as never, provider as never, {} as never, {} as never, quota as never);
		await expect(service.closeGeneration(participant.id, 3)).rejects.toThrow('close failed');
		expect(bindings.clearGeneration).not.toHaveBeenCalled();
		expect(bindings.clearSubscriptions).not.toHaveBeenCalled();
		expect(quota.releaseTrack).not.toHaveBeenCalled();
	});
	test('closes receive-only subscriptions on participant revocation', async () => {
		const live = { get: vi.fn().mockResolvedValue({ connectionId: 'connection-a', generation: 3, applicationId: 'app-a' }), clear: vi.fn() };
		const bindings = { clearGeneration: vi.fn(), clearSubscriptions: vi.fn(), listGenerationPublications: vi.fn().mockResolvedValue([]), listSubscriptions: vi.fn().mockResolvedValue([{ providerSessionId: 'listener-session', providerMid: '1' }]) };
		const provider = { closeTracks: vi.fn() };
		const service = new CallsMediaRevocationService({} as never, {} as never, live as never, bindings as never, provider as never, { publish: vi.fn() } as never, { revokeParticipant: vi.fn() } as never, { release: vi.fn() } as never);
		await service.revokeParticipant(participant, 8, 'access');
		expect(provider.closeTracks).toHaveBeenCalledWith('listener-session', [{ mid: '1' }], true);
		expect(live.clear.mock.invocationCallOrder[0]).toBeLessThan(bindings.clearSubscriptions.mock.invocationCallOrder[0]);
	});
	test('invalidates the live connection before closing provider tracks and publishes a targeted revoke', async () => {
		const rooms = { findOneBy: vi.fn() };
		const participants = { findBy: vi.fn() };
		const live = {
			get: vi.fn().mockResolvedValue({ participantId: participant.id, connectionId: 'connection-a', generation: 3, applicationId: 'first-party', sessionId: 'session-a' }),
			clear: vi.fn().mockResolvedValue(true),
		};
		const bindings = { clearGeneration: vi.fn(), clearSubscriptions: vi.fn(),
			listSubscriptions: vi.fn().mockResolvedValue([]),
			listGenerationPublications: vi.fn().mockResolvedValue([{ id: 'publication-a', roomId: participant.roomId, participantId: participant.id, connectionId: 'connection-a', generation: 3, providerSessionId: 'session-a', providerTrackName: 'audio-a', providerMid: '0', mediaKind: 'audio', createdAt: new Date().toISOString() }]),
		};
		const provider = { closeTracks: vi.fn().mockResolvedValue({}) };
		const events = { publish: vi.fn().mockResolvedValue(undefined) };
		const turn = { revokeParticipant: vi.fn().mockResolvedValue(undefined) };
		const quota = { releaseTrack: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) };
		const service = new CallsMediaRevocationService(rooms as never, participants as never, live as never, bindings as never, provider as never, events as never, turn as never, quota as never);

		await service.revokeParticipant(participant, 8, 'moderation');

		expect(provider.closeTracks).toHaveBeenCalledWith('session-a', [{ mid: '0' }], true);
		expect(live.clear).toHaveBeenCalledWith(participant.id, 'connection-a', 3);
		expect(events.publish).toHaveBeenCalledWith(participant.roomId, 8, 'revoked', { participantId: participant.id, reason: 'moderation' });
		expect(turn.revokeParticipant).toHaveBeenCalledWith(participant.id);
		expect(quota.release).toHaveBeenCalledWith('first-party', participant.id);
	});

	test('revokes every active Calls connection when a user credential is revoked', async () => {
		const rooms = { findOneBy: vi.fn().mockResolvedValue({ id: 'room-a', revision: 4 }) };
		const participants = { findBy: vi.fn().mockResolvedValue([participant]) };
		const live = { get: vi.fn().mockResolvedValue(null) };
		const events = { publish: vi.fn().mockResolvedValue(undefined) };
		const turn = { revokeParticipant: vi.fn().mockResolvedValue(undefined) };
		const service = new CallsMediaRevocationService(rooms as never, participants as never, live as never, { listRoomPublications: vi.fn().mockResolvedValue([]) } as never, {} as never, events as never, turn as never, {} as never);

		await service.revokeUser(participant.userId, 'logout');

		expect(events.publish).toHaveBeenCalledWith(participant.roomId, 4, 'revoked', { participantId: participant.id, reason: 'logout' });
	});

	test('closes orphaned provider tracks when Redis live state is lost', async () => {
		const publications = [{ id: 'publication-a', participantId: participant.id, generation: 7, providerSessionId: 'session-a', providerMid: '0', applicationId: 'app-a' }];
		const bindings = { clearGeneration: vi.fn(), clearSubscriptions: vi.fn(), listGenerationPublications: vi.fn().mockResolvedValue(publications), listSubscriptions: vi.fn().mockResolvedValue([]) };
		const provider = { closeTracks: vi.fn().mockResolvedValue({}) };
		const events = { publish: vi.fn().mockResolvedValue(undefined) };
		const turn = { revokeParticipant: vi.fn().mockResolvedValue(undefined) };
		const quota = { releaseTrack: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) };
		const service = new CallsMediaRevocationService({} as never, {} as never, {} as never, bindings as never, provider as never, events as never, turn as never, quota as never);

		await service.revokeLostGeneration(participant, 7, 9, 'connection-a');

		expect(provider.closeTracks).toHaveBeenCalledWith('session-a', [{ mid: '0' }], true);
		expect(quota.release).toHaveBeenCalledWith('app-a', participant.id);
		expect(events.publish).toHaveBeenCalledWith(participant.roomId, 9, 'revoked', { participantId: participant.id, reason: 'stale-generation', connectionId: 'connection-a', generation: 7 });
	});

	test('detaches reload media locally and targets revocation at the old connection', async () => {
		const publications = [{ applicationId: 'app-a', providerSessionId: 'session-a' }];
		const closeTracks = vi.fn();
		const publish = vi.fn();
		const service = new CallsMediaRevocationService(
			{} as never, {} as never, {} as never,
			{ listGenerationPublications: vi.fn().mockResolvedValue(publications), listSubscriptions: vi.fn().mockResolvedValue([]), clearGeneration: vi.fn(), clearSubscriptions: vi.fn() } as never,
			{ closeTracks } as never, { publish } as never,
			{ revokeParticipant: vi.fn() } as never, { release: vi.fn() } as never,
		);
		const connection = { connectionId: 'old-connection', generation: 7, applicationId: 'app-a' };
		await expect(service.revokeDisconnectedGeneration(participant, connection as never, 9)).resolves.toEqual({ participantId: participant.id, generation: 7 });
		expect(closeTracks).not.toHaveBeenCalled();
		expect(publish).toHaveBeenCalledWith(participant.roomId, 9, 'revoked', { participantId: participant.id, reason: 'access', connectionId: 'old-connection', generation: 7 });
	});

	test('revokes current media immediately after ChatRoom membership loss', async () => {
		const rooms = { findBy: vi.fn().mockResolvedValue([{ id: participant.roomId, revision: 5 }]) };
		const participants = { findOneBy: vi.fn().mockResolvedValue(participant) };
		const live = { get: vi.fn().mockResolvedValue(null) };
		const events = { publish: vi.fn().mockResolvedValue(undefined) };
		const turn = { revokeParticipant: vi.fn().mockResolvedValue(undefined) };
		const service = new CallsMediaRevocationService(rooms as never, participants as never, live as never, { listRoomPublications: vi.fn().mockResolvedValue([]) } as never, {} as never, events as never, turn as never, {} as never);

		await service.revokeChatRoomUser('chat-a', participant.userId);

		expect(rooms.findBy).toHaveBeenCalledWith({ chatRoomId: 'chat-a', attachmentType: 'chatRoom', state: 'open' });
		expect(events.publish).toHaveBeenCalledWith(participant.roomId, 5, 'revoked', { participantId: participant.id, reason: 'access' });
	});

	test('room termination revokes every active participant', async () => {
		const participants = { findBy: vi.fn().mockResolvedValue([participant]) };
		const live = { get: vi.fn().mockResolvedValue(null) };
		const events = { publish: vi.fn().mockResolvedValue(undefined) };
		const turn = { revokeParticipant: vi.fn().mockResolvedValue(undefined) };
		const service = new CallsMediaRevocationService({} as never, participants as never, live as never, { listRoomPublications: vi.fn().mockResolvedValue([]) } as never, {} as never, events as never, turn as never, {} as never);

		await service.revokeRoom(participant.roomId, 6, 'room-ended');

		expect(events.publish).toHaveBeenCalledWith(participant.roomId, 6, 'revoked', { participantId: participant.id, reason: 'room-ended' });
	});
});
