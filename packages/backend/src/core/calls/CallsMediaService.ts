/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { CallsParticipantsRepository, MiCallsParticipant, MiUser } from '@/models/_.js';
import type { CloudflareRealtimeSessionDescription, CloudflareRealtimeTracksResponse } from './CloudflareRealtimeProviderContract.js';
import { CallsLiveConnectionService } from './CallsLiveConnectionService.js';
import { CallsMediaBindingService } from './CallsMediaBindingService.js';
import { CallsRoomError, CallsRoomService } from './CallsRoomService.js';
import { CloudflareRealtimeClient } from './CloudflareRealtimeClient.js';
import { CallsEventService } from './CallsEventService.js';

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
	) {}

	public async createSession(user: MiUser, input: {
		roomId: string;
		connectionId: string;
		sessionDescription?: CloudflareRealtimeSessionDescription;
	}): Promise<{ participantId: string; generation: number; canPublish: boolean; sessionDescription?: CloudflareRealtimeSessionDescription }> {
		const participant = await this.authorizeParticipant(user, input.roomId);
		const replacement = await this.liveConnectionService.replace(participant.id, input.connectionId);
		if (replacement.previous != null) {
			await this.bindingService.clearGeneration(participant.id, replacement.previous.generation);
		}
		const response = await this.provider.createSession(input.sessionDescription);
		await this.liveConnectionService.bindSession(participant.id, input.connectionId, replacement.current.generation, response.sessionId);
		return { participantId: participant.id, generation: replacement.current.generation, canPublish: participant.role !== 'listener', sessionDescription: response.sessionDescription };
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
		const trackName = `audio-${participant.id}-${input.generation}`;
		const response = await this.provider.addTracks(connection.sessionId, [{ location: 'local', mid: input.mid, trackName, kind: 'audio' }], input.sessionDescription);
		const track = response.tracks?.[0];
		if (track?.errorCode != null) throw new CallsMediaAccessError();
		const publication = await this.bindingService.createPublication({
			roomId: input.roomId,
			participantId: participant.id,
			connectionId: input.connectionId,
			generation: input.generation,
			providerSessionId: connection.sessionId,
			providerTrackName: track?.trackName ?? trackName,
			providerMid: track?.mid ?? input.mid,
			mediaKind: 'audio',
		});
		const room = await this.roomService.getRoom(input.roomId);
		await this.eventService.publish(input.roomId, room.revision, 'track', { participantId: participant.id, publicationId: publication.id, available: true, mediaKind: 'audio' });
		return { publicationId: publication.id, negotiation: response };
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
		return this.provider.renegotiate(connection.sessionId, input.sessionDescription);
	}

	public async closePublication(user: MiUser, input: { roomId: string; connectionId: string; generation: number; publicationId: string }): Promise<CloudflareRealtimeTracksResponse> {
		const participant = await this.authorizeParticipant(user, input.roomId);
		await this.liveConnectionService.assertCurrent(participant.id, input.connectionId, input.generation);
		const binding = await this.bindingService.getPublication(input.publicationId);
		if (binding.roomId !== input.roomId || binding.participantId !== participant.id || binding.generation !== input.generation) throw new CallsMediaAccessError();
		const response = await this.provider.closeTracks(binding.providerSessionId, [{ mid: binding.providerMid ?? undefined }], true);
		await this.bindingService.removePublication(binding.id);
		const room = await this.roomService.getRoom(input.roomId);
		await this.eventService.publish(input.roomId, room.revision, 'track', { participantId: participant.id, publicationId: binding.id, available: false, mediaKind: 'audio' });
		return response;
	}

	public async reconcile(user: MiUser, roomId: string): Promise<{ roomRevision: number; publications: Array<{ id: string; participantId: string; mediaKind: 'audio' }> }> {
		const snapshot = await this.roomService.snapshot(user, roomId);
		const activeSpeakers = new Set(snapshot.participants.filter(p => p.role !== 'listener').map(p => p.id));
		const publications = (await this.bindingService.listRoomPublications(roomId)).filter(binding => activeSpeakers.has(binding.participantId));
		return { roomRevision: snapshot.room.revision, publications: publications.map(binding => ({ id: binding.id, participantId: binding.participantId, mediaKind: binding.mediaKind })) };
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
