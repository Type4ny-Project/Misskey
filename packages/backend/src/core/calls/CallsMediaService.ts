/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { CallsParticipantsRepository, MiCallsParticipant, MiUser } from '@/models/_.js';
import type { CloudflareRealtimeSessionDescription, CloudflareRealtimeTracksResponse } from './CloudflareRealtimeProviderContract.js';
import { CallsLiveConnectionService, StaleCallsConnectionError, type CallsLiveConnection } from './CallsLiveConnectionService.js';
import { CallsMediaBindingService } from './CallsMediaBindingService.js';
import { CallsRoomError, CallsRoomService } from './CallsRoomService.js';
import { CloudflareRealtimeClient } from './CloudflareRealtimeClient.js';
import { CallsEventService } from './CallsEventService.js';
import { CallsMediaRevocationService } from './CallsMediaRevocationService.js';
import { CallsApplicationQuotaService } from './CallsApplicationQuotaService.js';
import { CallsTelemetryService } from './CallsTelemetryService.js';

export class CallsMediaAccessError extends Error {}

@Injectable()
export class CallsMediaService {
	constructor(
		@Inject(DI.callsParticipantsRepository)
		private participantsRepository: CallsParticipantsRepository,
		private roomService: CallsRoomService,
		private liveConnectionService: CallsLiveConnectionService,
		private bindingService: CallsMediaBindingService,
		private provider: CloudflareRealtimeClient,
		private eventService: CallsEventService,
		private revocationService: CallsMediaRevocationService,
		private quotaService: CallsApplicationQuotaService,
		private telemetry: CallsTelemetryService,
	) {}

	public async createSession(user: MiUser, input: {
		roomId: string;
		connectionId: string;
		applicationId: string;
		sessionDescription?: CloudflareRealtimeSessionDescription;
	}): Promise<{ participantId: string; generation: number; canPublish: boolean; sessionDescription?: CloudflareRealtimeSessionDescription }> {
		const authorizedParticipant = await this.authorizeParticipant(user, input.roomId);
		await this.quotaService.reserveSession(input.applicationId, authorizedParticipant.id);
		let locked: { participant: MiCallsParticipant; replacement: Awaited<ReturnType<CallsLiveConnectionService['replace']>> };
		try {
			locked = await this.liveConnectionService.withRoomLock(input.roomId, async (assertLockHeld) => {
				const lockedParticipant = await this.authorizeParticipant(user, input.roomId);
				await assertLockHeld();
				return {
					participant: lockedParticipant,
					replacement: await this.liveConnectionService.replace(lockedParticipant.id, input.connectionId, input.applicationId),
				};
			});
		} catch (error) {
			await this.quotaService.releaseSession(input.applicationId, authorizedParticipant.id);
			throw error;
		}
		const { participant, replacement } = locked;
		const createdGeneration: { connectionId: string; generation: number } = replacement.current;
		try {
			if (replacement.previous != null) {
				await this.revocationService.closeGeneration(participant.id, replacement.previous.generation);
				if (replacement.previous.applicationId !== input.applicationId) await this.quotaService.release(replacement.previous.applicationId, participant.id);
			}
			const response = await this.provider.createSession(input.sessionDescription);
			await this.liveConnectionService.bindSession(participant.id, input.connectionId, replacement.current.generation, response.sessionId);
			this.telemetry.lifecycle({ action: 'media-session-created', roomId: input.roomId, participantId: participant.id, generation: replacement.current.generation, applicationId: input.applicationId });
			return { participantId: participant.id, generation: replacement.current.generation, canPublish: participant.role !== 'listener', sessionDescription: response.sessionDescription };
		} catch (error) {
			await this.liveConnectionService.clear(participant.id, createdGeneration.connectionId, createdGeneration.generation);
			await this.quotaService.releaseSession(input.applicationId, participant.id);
			throw error;
		}
	}

	public async publish(user: MiUser, input: {
		roomId: string;
		connectionId: string;
		generation: number;
		mid: string;
		sessionDescription: CloudflareRealtimeSessionDescription;
	}): Promise<{ publicationId: string; negotiation: CloudflareRealtimeTracksResponse }> {
		const participant = await this.authorizeParticipant(user, input.roomId);
		if (participant.role === 'listener') throw new CallsMediaAccessError();
		const connection = await this.liveConnectionService.assertCurrent(participant.id, input.connectionId, input.generation);
		if (connection.sessionId == null) throw new CallsMediaAccessError();
		await this.quotaService.reserveTrack(connection.applicationId, participant.id);
		try {
			const trackName = `audio-${participant.id}-${input.generation}`;
			const response = await this.provider.addTracks(connection.sessionId, [{ location: 'local', mid: input.mid, trackName, kind: 'audio' }], input.sessionDescription);
			const track = response.tracks?.[0];
			if (track?.errorCode != null) throw new CallsMediaAccessError();
			const publication = await this.bindingService.createPublication({
				roomId: input.roomId,
				participantId: participant.id,
				connectionId: input.connectionId,
				generation: input.generation,
				applicationId: connection.applicationId,
				providerSessionId: connection.sessionId,
				providerTrackName: track?.trackName ?? trackName,
				providerMid: track?.mid ?? input.mid,
				mediaKind: 'audio',
			});
			const room = await this.roomService.getRoom(input.roomId);
			await this.eventService.publish(input.roomId, room.revision, 'track', { participantId: participant.id, publicationId: publication.id, available: true, mediaKind: 'audio' });
			this.telemetry.lifecycle({ action: 'track-published', roomId: input.roomId, participantId: participant.id, generation: input.generation, applicationId: connection.applicationId });
			return { publicationId: publication.id, negotiation: response };
		} catch (error) {
			await this.quotaService.releaseTrack(connection.applicationId, participant.id);
			throw error;
		}
	}

	public async subscribe(user: MiUser, input: {
		roomId: string;
		connectionId: string;
		generation: number;
		publicationIds: string[];
	}): Promise<CloudflareRealtimeTracksResponse> {
		const participant = await this.authorizeParticipant(user, input.roomId);
		const connection = await this.liveConnectionService.assertCurrent(participant.id, input.connectionId, input.generation);
		if (connection.sessionId == null) throw new CallsMediaAccessError();
		await this.quotaService.touch(connection.applicationId, participant.id);
		const publications = await Promise.all(input.publicationIds.map(id => this.bindingService.getPublication(id)));
		if (publications.some(binding => binding.roomId !== input.roomId)) throw new CallsMediaAccessError();
		const publishers = await this.participantsRepository.findBy({ id: In(publications.map(binding => binding.participantId)) });
		const authorizedIds = new Set(publishers.filter(publisher => publisher.state === 'active' && publisher.role !== 'listener').map(publisher => publisher.id));
		if (publications.some(binding => !authorizedIds.has(binding.participantId))) throw new CallsMediaAccessError();
		return this.provider.addTracks(connection.sessionId, publications.map(binding => ({
			location: 'remote' as const,
			sessionId: binding.providerSessionId,
			trackName: binding.providerTrackName,
			kind: 'audio',
		})));
	}

	public async renegotiate(user: MiUser, input: { roomId: string; connectionId: string; generation: number; sessionDescription: CloudflareRealtimeSessionDescription }): Promise<CloudflareRealtimeTracksResponse> {
		const participant = await this.authorizeParticipant(user, input.roomId);
		const connection = await this.liveConnectionService.assertCurrent(participant.id, input.connectionId, input.generation);
		if (connection.sessionId == null) throw new CallsMediaAccessError();
		await this.quotaService.touch(connection.applicationId, participant.id);
		return this.provider.renegotiate(connection.sessionId, input.sessionDescription);
	}

	public async closePublication(user: MiUser, input: { roomId: string; connectionId: string; generation: number; publicationId: string }): Promise<CloudflareRealtimeTracksResponse> {
		const participant = await this.authorizeParticipant(user, input.roomId);
		await this.liveConnectionService.assertCurrent(participant.id, input.connectionId, input.generation);
		const binding = await this.bindingService.getPublication(input.publicationId);
		if (binding.roomId !== input.roomId || binding.participantId !== participant.id || binding.generation !== input.generation) throw new CallsMediaAccessError();
		const response = await this.provider.closeTracks(binding.providerSessionId, [{ mid: binding.providerMid ?? undefined }], true);
		await this.bindingService.removePublication(binding.id);
		await this.quotaService.releaseTrack(binding.applicationId, participant.id);
		const room = await this.roomService.getRoom(input.roomId);
		await this.eventService.publish(input.roomId, room.revision, 'track', { participantId: participant.id, publicationId: binding.id, available: false, mediaKind: 'audio' });
		this.telemetry.lifecycle({ action: 'track-closed', roomId: input.roomId, participantId: participant.id, generation: input.generation, applicationId: binding.applicationId });
		return response;
	}

	public async reconcile(user: MiUser, roomId: string): Promise<{ roomRevision: number; publications: Array<{ id: string; participantId: string; mediaKind: 'audio' }> }> {
		const snapshot = await this.roomService.snapshot(user, roomId);
		const activeSpeakers = new Set(snapshot.participants.filter(p => p.role !== 'listener').map(p => p.id));
		const publications = (await this.bindingService.listRoomPublications(roomId)).filter(binding => activeSpeakers.has(binding.participantId));
		return { roomRevision: snapshot.room.revision, publications: publications.map(binding => ({ id: binding.id, participantId: binding.participantId, mediaKind: binding.mediaKind })) };
	}

	public async heartbeat(user: MiUser, roomId: string, connectionId: string, generation: number): Promise<void> {
		const participant = await this.authorizeParticipant(user, roomId);
		let connection: CallsLiveConnection;
		try {
			connection = await this.liveConnectionService.assertCurrent(participant.id, connectionId, generation);
		} catch (error) {
			if (!(error instanceof StaleCallsConnectionError)) throw error;
			const room = await this.roomService.getRoom(roomId);
			await this.revocationService.revokeLostGeneration(participant, generation, room.revision);
			throw error;
		}
		await this.liveConnectionService.heartbeat(participant.id, connectionId, generation);
		await this.quotaService.touch(connection.applicationId, participant.id);
	}

	private async authorizeParticipant(user: MiUser, roomId: string): Promise<MiCallsParticipant> {
		const room = await this.roomService.getRoom(roomId);
		await this.roomService.assertCanAccess(user, room);
		if (room.state !== 'open') throw new CallsRoomError('invalid-state');
		const participant = await this.participantsRepository.findOneBy({ roomId, userId: user.id, state: 'active' });
		if (participant == null) throw new CallsRoomError('participant-not-found');
		return participant;
	}
}
