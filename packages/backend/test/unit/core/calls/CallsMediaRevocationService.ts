/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { CallsMediaRevocationService } from '@/core/calls/CallsMediaRevocationService.js';
import type { MiCallsParticipant } from '@/models/_.js';

const participant = { id: 'participant-a', roomId: 'room-a', userId: 'user-a', state: 'active' } as MiCallsParticipant;

describe('CallsMediaRevocationService', () => {
	test('closes provider tracks before clearing a live connection and publishes a targeted revoke', async () => {
		const rooms = { findOneBy: vi.fn() };
		const participants = { findBy: vi.fn() };
		const live = {
			get: vi.fn().mockResolvedValue({ participantId: participant.id, connectionId: 'connection-a', generation: 3, applicationId: 'first-party', sessionId: 'session-a' }),
			clear: vi.fn().mockResolvedValue(true),
		};
		const bindings = {
			clearGeneration: vi.fn().mockResolvedValue([{ id: 'publication-a', roomId: participant.roomId, participantId: participant.id, connectionId: 'connection-a', generation: 3, providerSessionId: 'session-a', providerTrackName: 'audio-a', providerMid: '0', mediaKind: 'audio', createdAt: new Date().toISOString() }]),
		};
		const provider = { closeTracks: vi.fn().mockResolvedValue({}) };
		const events = { publish: vi.fn().mockResolvedValue(undefined) };
		const turn = { revokeParticipant: vi.fn().mockResolvedValue(undefined) };
		const quota = { release: vi.fn().mockResolvedValue(undefined) };
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
		const service = new CallsMediaRevocationService(rooms as never, participants as never, live as never, {} as never, {} as never, events as never, turn as never, {} as never);

		await service.revokeUser(participant.userId, 'logout');

		expect(events.publish).toHaveBeenCalledWith(participant.roomId, 4, 'revoked', { participantId: participant.id, reason: 'logout' });
	});

	test('closes orphaned provider tracks when Redis live state is lost', async () => {
		const publications = [{ id: 'publication-a', participantId: participant.id, generation: 7, providerSessionId: 'session-a', providerMid: '0', applicationId: 'app-a' }];
		const bindings = { clearGeneration: vi.fn().mockResolvedValue(publications) };
		const provider = { closeTracks: vi.fn().mockResolvedValue({}) };
		const events = { publish: vi.fn().mockResolvedValue(undefined) };
		const turn = { revokeParticipant: vi.fn().mockResolvedValue(undefined) };
		const quota = { release: vi.fn().mockResolvedValue(undefined) };
		const service = new CallsMediaRevocationService({} as never, {} as never, {} as never, bindings as never, provider as never, events as never, turn as never, quota as never);

		await service.revokeLostGeneration(participant, 7, 9);

		expect(provider.closeTracks).toHaveBeenCalledWith('session-a', [{ mid: '0' }], true);
		expect(quota.release).toHaveBeenCalledWith('app-a', participant.id);
		expect(events.publish).toHaveBeenCalledWith(participant.roomId, 9, 'revoked', { participantId: participant.id, reason: 'stale-generation' });
	});

	test('revokes current media immediately after ChatRoom membership loss', async () => {
		const rooms = { findBy: vi.fn().mockResolvedValue([{ id: participant.roomId, revision: 5 }]) };
		const participants = { findOneBy: vi.fn().mockResolvedValue(participant) };
		const live = { get: vi.fn().mockResolvedValue(null) };
		const events = { publish: vi.fn().mockResolvedValue(undefined) };
		const turn = { revokeParticipant: vi.fn().mockResolvedValue(undefined) };
		const service = new CallsMediaRevocationService(rooms as never, participants as never, live as never, {} as never, {} as never, events as never, turn as never, {} as never);

		await service.revokeChatRoomUser('chat-a', participant.userId);

		expect(rooms.findBy).toHaveBeenCalledWith({ chatRoomId: 'chat-a', attachmentType: 'chatRoom', state: 'open' });
		expect(events.publish).toHaveBeenCalledWith(participant.roomId, 5, 'revoked', { participantId: participant.id, reason: 'access' });
	});

	test('room termination revokes every active participant', async () => {
		const participants = { findBy: vi.fn().mockResolvedValue([participant]) };
		const live = { get: vi.fn().mockResolvedValue(null) };
		const events = { publish: vi.fn().mockResolvedValue(undefined) };
		const turn = { revokeParticipant: vi.fn().mockResolvedValue(undefined) };
		const service = new CallsMediaRevocationService({} as never, participants as never, live as never, {} as never, {} as never, events as never, turn as never, {} as never);

		await service.revokeRoom(participant.roomId, 6, 'room-ended');

		expect(events.publish).toHaveBeenCalledWith(participant.roomId, 6, 'revoked', { participantId: participant.id, reason: 'room-ended' });
	});
});
