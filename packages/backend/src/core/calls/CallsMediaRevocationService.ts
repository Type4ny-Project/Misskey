/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { CallsParticipantsRepository, CallsRoomsRepository, MiCallsParticipant } from '@/models/_.js';
import { CallsEventService } from './CallsEventService.js';
import { CallsLiveConnectionService } from './CallsLiveConnectionService.js';
import { CallsMediaBindingService, type CallsPublicationBinding } from './CallsMediaBindingService.js';
import { CloudflareRealtimeClient } from './CloudflareRealtimeClient.js';
import { CallsTurnCredentialStoreService } from './CallsTurnCredentialStoreService.js';
import { CallsApplicationQuotaService } from './CallsApplicationQuotaService.js';

export type CallsRevocationReason = 'access' | 'moderation' | 'room-ended' | 'logout' | 'stale-generation';

@Injectable()
export class CallsMediaRevocationService {
	constructor(
		@Inject(DI.callsRoomsRepository)
		private roomsRepository: CallsRoomsRepository,
		@Inject(DI.callsParticipantsRepository)
		private participantsRepository: CallsParticipantsRepository,
		private liveConnections: CallsLiveConnectionService,
		private bindings: CallsMediaBindingService,
		private provider: CloudflareRealtimeClient,
		private events: CallsEventService,
		private turnCredentials: CallsTurnCredentialStoreService,
		private quota: CallsApplicationQuotaService,
	) {}

	public async revokeParticipant(participant: MiCallsParticipant, roomRevision: number, reason: CallsRevocationReason): Promise<void> {
		const connection = await this.liveConnections.get(participant.id);
		if (connection != null) {
			const publications = await this.bindings.clearGeneration(participant.id, connection.generation);
			await this.closeProviderPublications(publications);
			await this.liveConnections.clear(participant.id, connection.connectionId, connection.generation);
			await this.quota.release(connection.applicationId, participant.id);
		}
		await this.turnCredentials.revokeParticipant(participant.id);
		await this.events.publish(participant.roomId, roomRevision, 'revoked', { participantId: participant.id, reason });
	}

	public async closeGeneration(participantId: string, generation: number): Promise<void> {
		const publications = await this.bindings.clearGeneration(participantId, generation);
		await this.closeProviderPublications(publications);
	}

	public async revokeLostGeneration(participant: MiCallsParticipant, generation: number, roomRevision: number): Promise<void> {
		const publications = await this.bindings.clearGeneration(participant.id, generation);
		await this.closeProviderPublications(publications);
		for (const applicationId of new Set(publications.map(publication => publication.applicationId))) {
			await this.quota.release(applicationId, participant.id);
		}
		await this.turnCredentials.revokeParticipant(participant.id);
		await this.events.publish(participant.roomId, roomRevision, 'revoked', { participantId: participant.id, reason: 'stale-generation' });
	}

	public async revokeRoom(roomId: string, roomRevision: number, reason: CallsRevocationReason): Promise<void> {
		const participants = await this.participantsRepository.findBy({ roomId, state: 'active' });
		await Promise.all(participants.map(participant => this.revokeParticipant(participant, roomRevision, reason)));
	}

	public async revokeChatRoomUser(chatRoomId: string, userId: string): Promise<void> {
		const rooms = await this.roomsRepository.findBy({ chatRoomId, attachmentType: 'chatRoom', state: 'open' });
		for (const room of rooms) {
			const participant = await this.participantsRepository.findOneBy({ roomId: room.id, userId, state: 'active' });
			if (participant != null) await this.revokeParticipant(participant, room.revision, 'access');
		}
	}

	public async revokeUser(userId: string, reason: CallsRevocationReason): Promise<void> {
		const participants = await this.participantsRepository.findBy({ userId, state: 'active' });
		for (const participant of participants) {
			const room = await this.roomsRepository.findOneBy({ id: participant.roomId });
			if (room != null) await this.revokeParticipant(participant, room.revision, reason);
		}
	}

	private async closeProviderPublications(publications: CallsPublicationBinding[]): Promise<void> {
		const bySession = Map.groupBy(publications, publication => publication.providerSessionId);
		await Promise.allSettled([...bySession].map(([sessionId, sessionPublications]) => this.provider.closeTracks(
			sessionId,
			sessionPublications.map(publication => ({ mid: publication.providerMid ?? undefined })),
			true,
		)));
	}
}
