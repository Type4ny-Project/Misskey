/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type {
	CallsModerationLogsRepository,
	CallsParticipantsRepository,
	CallsRoomsRepository,
	ChatRoomsRepository,
	MiCallsParticipant,
	MiCallsRoom,
	MiChatRoom,
	MiUser,
} from '@/models/_.js';
import type { CallsModerationAction } from '@/models/CallsModerationLog.js';
import type { CallsParticipantRole } from '@/models/CallsParticipant.js';
import type { CallsRoomVisibility } from '@/models/CallsRoom.js';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';
import { ChatService } from '@/core/ChatService.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { CallsEventService } from './CallsEventService.js';
import { CallsMediaRevocationService } from './CallsMediaRevocationService.js';
import { CallsTelemetryService } from './CallsTelemetryService.js';
import type { Config } from '@/config.js';

export const CALLS_MAX_SPEAKERS = 8;
export const CALLS_MAX_LISTENERS = 100;

export type CallsRoomErrorCode =
	| 'access-denied'
	| 'attachment-not-found'
	| 'invalid-state'
	| 'invalid-metadata'
	| 'participant-not-found'
	| 'room-full'
	| 'room-not-found'
	| 'stale-revision';

export class CallsFeatureDisabledError extends Error {}

export class CallsRoomError extends Error {
	constructor(public readonly code: CallsRoomErrorCode) {
		super(code);
	}
}

export function isCallsRoomTransitionAllowed(from: MiCallsRoom['state'], to: MiCallsRoom['state']): boolean {
	return (from === 'scheduled' && (to === 'open' || to === 'cancelled')) || (from === 'open' && to === 'ended');
}

@Injectable()
export class CallsRoomService {
	constructor(
		@Inject(DI.config)
		private config: Config,
		@Inject(DI.callsRoomsRepository)
		private callsRoomsRepository: CallsRoomsRepository,
		@Inject(DI.callsParticipantsRepository)
		private callsParticipantsRepository: CallsParticipantsRepository,
		@Inject(DI.callsModerationLogsRepository)
		private callsModerationLogsRepository: CallsModerationLogsRepository,
		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,
		private cacheService: CacheService,
		private chatService: ChatService,
		private idService: IdService,
		private roleService: RoleService,
		private callsEventService: CallsEventService,
		private callsMediaRevocationService: CallsMediaRevocationService,
		private callsTelemetryService: CallsTelemetryService,
	) {}

	@bindThis
	public async create(owner: MiUser, params: {
		attachmentType: 'personal' | 'chatRoom';
		chatRoomId?: MiChatRoom['id'];
		title: string;
		description?: string;
		visibility?: CallsRoomVisibility;
		visibleUserIds?: MiUser['id'][];
		scheduledAt?: Date | null;
	}): Promise<MiCallsRoom> {
		this.assertEnabled();
		if (owner.host !== null) throw new CallsRoomError('access-denied');
		const title = this.sanitizeMetadata(params.title);
		if (title.length === 0) throw new CallsRoomError('invalid-metadata');
		const description = this.sanitizeMetadata(params.description ?? '');

		if (params.attachmentType === 'chatRoom') {
			const chatRoom = params.chatRoomId == null ? null : await this.chatRoomsRepository.findOneBy({ id: params.chatRoomId });
			if (chatRoom == null) throw new CallsRoomError('attachment-not-found');
			if (chatRoom.ownerId !== owner.id && !(await this.roleService.isModerator(owner))) {
				throw new CallsRoomError('access-denied');
			}
		}

		const now = new Date();
		const room = await this.callsRoomsRepository.insertOne({
			id: this.idService.gen(),
			attachmentType: params.attachmentType,
			ownerUserId: owner.id,
			chatRoomId: params.attachmentType === 'chatRoom' ? params.chatRoomId : null,
			title,
			description,
			visibility: params.attachmentType === 'chatRoom' ? 'specified' : (params.visibility ?? 'specified'),
			visibleUserIds: params.attachmentType === 'personal' && params.visibility === 'specified' ? [...new Set(params.visibleUserIds ?? [])] : [],
			state: 'scheduled',
			scheduledAt: params.scheduledAt ?? null,
			startedAt: null,
			endedAt: null,
			revision: 0,
			createdAt: now,
			updatedAt: now,
		});

		await this.callsParticipantsRepository.insertOne({
			id: this.idService.gen(),
			roomId: room.id,
			userId: owner.id,
			role: 'host',
			state: 'active',
			isMuted: false,
			joinedAt: now,
			leftAt: null,
			speakerRequestedAt: null,
			updatedAt: now,
		});
		this.callsTelemetryService.lifecycle({ action: 'room-created', roomId: room.id });

		return room;
	}

	@bindThis
	public async getRoom(roomId: string): Promise<MiCallsRoom> {
		const room = await this.callsRoomsRepository.findOneBy({ id: roomId });
		if (room == null) throw new CallsRoomError('room-not-found');
		return room;
	}

	@bindThis
	public async assertCanAccess(user: MiUser, room: MiCallsRoom): Promise<void> {
		this.assertEnabled();
		if (user.host !== null) throw new CallsRoomError('access-denied');
		if (room.ownerUserId === user.id || await this.roleService.isModerator(user)) return;

		if (room.attachmentType === 'chatRoom') {
			const chatRoom = room.chatRoomId == null ? null : await this.chatRoomsRepository.findOneBy({ id: room.chatRoomId });
			if (chatRoom == null || !(await this.chatService.isRoomMember(chatRoom, user.id))) {
				throw new CallsRoomError('access-denied');
			}
			return;
		}

		if (room.visibility === 'public') return;
		if (room.visibility === 'followers') {
			const followings = await this.cacheService.userFollowingsCache.fetch(user.id);
			if (Object.hasOwn(followings, room.ownerUserId)) return;
		}

		if (!room.visibleUserIds.includes(user.id)) throw new CallsRoomError('access-denied');
	}

	@bindThis
	public async snapshot(user: MiUser, roomId: string): Promise<{ room: MiCallsRoom; participants: MiCallsParticipant[] }> {
		const room = await this.getRoom(roomId);
		await this.assertCanAccess(user, room);
		const participants = await this.callsParticipantsRepository.findBy({ roomId, state: 'active' });
		return { room, participants };
	}

	@bindThis
	public async listDiscoverable(user: MiUser, limit: number): Promise<MiCallsRoom[]> {
		if (user.host !== null) return [];
		const candidates = await this.callsRoomsRepository.find({
			where: { state: In(['scheduled', 'open']) },
			order: { createdAt: 'DESC' },
			take: Math.min(limit * 4, 400),
		});
		const visible: MiCallsRoom[] = [];
		for (const room of candidates) {
			try {
				await this.assertCanAccess(user, room);
				visible.push(room);
				if (visible.length === limit) break;
			} catch (error) {
				if (!(error instanceof CallsRoomError) || error.code !== 'access-denied') throw error;
			}
		}
		return visible;
	}

	@bindThis
	public async open(host: MiUser, roomId: string, expectedRevision: number): Promise<MiCallsRoom> {
		return this.transition(host, roomId, expectedRevision, 'scheduled', 'open');
	}

	@bindThis
	public async end(host: MiUser, roomId: string, expectedRevision: number): Promise<MiCallsRoom> {
		return this.transition(host, roomId, expectedRevision, 'open', 'ended');
	}

	@bindThis
	public async cancel(host: MiUser, roomId: string, expectedRevision: number): Promise<MiCallsRoom> {
		return this.transition(host, roomId, expectedRevision, 'scheduled', 'cancelled');
	}

	private async transition(
		host: MiUser,
		roomId: string,
		expectedRevision: number,
		from: 'scheduled' | 'open',
		to: 'open' | 'ended' | 'cancelled',
	): Promise<MiCallsRoom> {
		const room = await this.getRoom(roomId);
		if (room.ownerUserId !== host.id && !(await this.roleService.isModerator(host))) throw new CallsRoomError('access-denied');
		if (room.state !== from || !isCallsRoomTransitionAllowed(room.state, to)) throw new CallsRoomError('invalid-state');

		const now = new Date();
		const result = await this.callsRoomsRepository.createQueryBuilder()
			.update()
			.set({
				state: to,
				startedAt: to === 'open' ? now : room.startedAt,
				endedAt: to === 'ended' || to === 'cancelled' ? now : null,
				revision: () => '"revision" + 1',
				updatedAt: now,
			})
			.where('id = :roomId AND revision = :expectedRevision', { roomId, expectedRevision })
			.returning('*')
			.execute();
		if (result.affected !== 1) throw new CallsRoomError('stale-revision');
		const updated = result.raw[0] as MiCallsRoom;
		await this.callsEventService.publish(roomId, updated.revision, 'lifecycle', { state: updated.state });
		this.callsTelemetryService.lifecycle({ action: `room-${updated.state}`, roomId });
		if (updated.state === 'ended' || updated.state === 'cancelled') {
			await this.callsMediaRevocationService.revokeRoom(roomId, updated.revision, 'room-ended');
		}
		return updated;
	}

	@bindThis
	public async join(user: MiUser, roomId: string): Promise<MiCallsParticipant> {
		const room = await this.getRoom(roomId);
		await this.assertCanAccess(user, room);
		if (room.state !== 'open') throw new CallsRoomError('invalid-state');

		const current = await this.callsParticipantsRepository.findOneBy({ roomId, userId: user.id });
		if (current?.state === 'active') return current;
		const listeners = await this.callsParticipantsRepository.countBy({ roomId, state: 'active', role: 'listener' });
		if (listeners >= CALLS_MAX_LISTENERS) throw new CallsRoomError('room-full');

		const now = new Date();
		let joined: MiCallsParticipant;
		if (current != null) {
			await this.callsParticipantsRepository.update(current.id, {
				role: current.role === 'host' ? 'host' : 'listener',
				state: 'active',
				isMuted: false,
				joinedAt: now,
				leftAt: null,
				speakerRequestedAt: null,
				updatedAt: now,
			});
			joined = await this.callsParticipantsRepository.findOneByOrFail({ id: current.id });
		} else {
			joined = await this.callsParticipantsRepository.insertOne({
				id: this.idService.gen(),
				roomId,
				userId: user.id,
				role: 'listener',
				state: 'active',
				isMuted: false,
				joinedAt: now,
				leftAt: null,
				speakerRequestedAt: null,
				updatedAt: now,
			});
		}
		const revision = await this.bumpRevision(roomId);
		await this.callsEventService.publish(roomId, revision, 'participant', { participantId: joined.id, action: 'joined' });
		this.callsTelemetryService.lifecycle({ action: 'participant-joined', roomId, participantId: joined.id });
		return joined;
	}

	@bindThis
	public async leave(user: MiUser, roomId: string): Promise<void> {
		const participant = await this.callsParticipantsRepository.findOneBy({ roomId, userId: user.id, state: 'active' });
		if (participant == null) throw new CallsRoomError('participant-not-found');
		if (participant.role === 'host') throw new CallsRoomError('invalid-state');
		const now = new Date();
		await this.callsParticipantsRepository.update(participant.id, { state: 'left', leftAt: now, updatedAt: now });
		const revision = await this.bumpRevision(roomId);
		await this.callsEventService.publish(roomId, revision, 'participant', { participantId: participant.id, action: 'left' });
		await this.callsMediaRevocationService.revokeParticipant(participant, revision, 'access');
		this.callsTelemetryService.lifecycle({ action: 'participant-left', roomId, participantId: participant.id, reason: 'access' });
	}

	@bindThis
	public async setRole(host: MiUser, roomId: string, participantId: string, role: Exclude<CallsParticipantRole, 'host'>, expectedRevision: number): Promise<MiCallsParticipant> {
		return this.moderateRole(host, roomId, participantId, role, expectedRevision, role === 'speaker' ? 'promote' : 'demote');
	}

	private async moderateRole(host: MiUser, roomId: string, participantId: string, role: Exclude<CallsParticipantRole, 'host'>, expectedRevision: number, action: CallsModerationAction): Promise<MiCallsParticipant> {
		const room = await this.getRoom(roomId);
		if (room.ownerUserId !== host.id && !(await this.roleService.isModerator(host))) throw new CallsRoomError('access-denied');
		if (room.state !== 'open') throw new CallsRoomError('invalid-state');
		const participant = await this.callsParticipantsRepository.findOneBy({ id: participantId, roomId, state: 'active' });
		if (participant == null || participant.role === 'host') throw new CallsRoomError('participant-not-found');

		if (role === 'speaker') {
			const speakers = await this.callsParticipantsRepository.countBy({ roomId, state: 'active', role: In(['host', 'speaker']) });
			if (speakers >= CALLS_MAX_SPEAKERS) throw new CallsRoomError('room-full');
		}

		const revisionResult = await this.callsRoomsRepository.createQueryBuilder()
			.update()
			.set({ revision: () => '"revision" + 1', updatedAt: new Date() })
			.where('id = :roomId AND revision = :expectedRevision AND state = :state', { roomId, expectedRevision, state: 'open' })
			.returning('revision')
			.execute();
		if (revisionResult.affected !== 1) throw new CallsRoomError('stale-revision');
		const revision = Number((revisionResult.raw[0] as { revision: number }).revision);
		const now = new Date();
		await this.callsParticipantsRepository.update(participant.id, {
			role,
			isMuted: role === 'listener' ? true : participant.isMuted,
			speakerRequestedAt: null,
			updatedAt: now,
		});
		await this.callsModerationLogsRepository.insert({
			id: this.idService.gen(),
			roomId,
			actorUserId: host.id,
			targetParticipantId: participant.id,
			action,
			previousRole: participant.role,
			nextRole: role,
			reason: null,
			roomRevision: revision,
			createdAt: now,
		});
		const updated = await this.callsParticipantsRepository.findOneByOrFail({ id: participant.id });
		await this.callsEventService.publish(roomId, revision, 'role', { participantId: participant.id, role });
		if (role === 'listener') await this.callsMediaRevocationService.revokeParticipant(updated, revision, 'moderation');
		this.callsTelemetryService.lifecycle({ action: `participant-${role}`, roomId, participantId: participant.id, reason: 'moderation' });
		return updated;
	}

	@bindThis
	public async requestSpeaker(user: MiUser, roomId: string): Promise<void> {
		const participant = await this.callsParticipantsRepository.findOneBy({ roomId, userId: user.id, state: 'active', role: 'listener' });
		if (participant == null) throw new CallsRoomError('participant-not-found');
		const now = new Date();
		await this.callsParticipantsRepository.update(participant.id, { speakerRequestedAt: now, updatedAt: now });
		const revision = await this.bumpRevision(roomId);
		await this.callsEventService.publish(roomId, revision, 'speakerRequest', { participantId: participant.id, requested: true });
	}

	@bindThis
	public async setMuted(user: MiUser, roomId: string, isMuted: boolean): Promise<void> {
		const room = await this.getRoom(roomId);
		await this.assertCanAccess(user, room);
		if (room.state !== 'open') throw new CallsRoomError('invalid-state');
		const participant = await this.callsParticipantsRepository.findOneBy({ roomId, userId: user.id, state: 'active' });
		if (participant == null || participant.role === 'listener') throw new CallsRoomError('participant-not-found');
		if (participant.isMuted === isMuted) return;
		const now = new Date();
		await this.callsParticipantsRepository.update(participant.id, { isMuted, updatedAt: now });
		const revision = await this.bumpRevision(roomId);
		await this.callsModerationLogsRepository.insert({
			id: this.idService.gen(), roomId, actorUserId: user.id, targetParticipantId: participant.id,
			action: isMuted ? 'mute' : 'unmute', previousRole: participant.role, nextRole: participant.role,
			reason: null, roomRevision: revision, createdAt: now,
		});
		await this.callsEventService.publish(roomId, revision, 'mute', { participantId: participant.id, isMuted });
		this.callsTelemetryService.lifecycle({ action: isMuted ? 'participant-muted' : 'participant-unmuted', roomId, participantId: participant.id });
	}

	@bindThis
	public async reportSpeaking(user: MiUser, roomId: string, speaking: boolean): Promise<void> {
		const room = await this.getRoom(roomId);
		await this.assertCanAccess(user, room);
		if (room.state !== 'open') return;
		const participant = await this.callsParticipantsRepository.findOneBy({ roomId, userId: user.id, state: 'active' });
		if (participant == null || participant.role === 'listener' || participant.isMuted) return;
		await this.callsEventService.reportSpeaking(roomId, room.revision, participant.id, speaking);
	}

	@bindThis
	public async removeParticipant(host: MiUser, roomId: string, participantId: string, expectedRevision: number, reason?: string): Promise<void> {
		const room = await this.getRoom(roomId);
		if (room.ownerUserId !== host.id && !(await this.roleService.isModerator(host))) throw new CallsRoomError('access-denied');
		const participant = await this.callsParticipantsRepository.findOneBy({ id: participantId, roomId, state: 'active' });
		if (participant == null || participant.role === 'host') throw new CallsRoomError('participant-not-found');
		const result = await this.callsRoomsRepository.createQueryBuilder().update()
			.set({ revision: () => '"revision" + 1', updatedAt: new Date() })
			.where('id = :roomId AND revision = :expectedRevision', { roomId, expectedRevision })
			.returning('revision').execute();
		if (result.affected !== 1) throw new CallsRoomError('stale-revision');
		const now = new Date();
		await this.callsParticipantsRepository.update(participant.id, { state: 'removed', leftAt: now, isMuted: true, updatedAt: now });
		await this.callsModerationLogsRepository.insert({
			id: this.idService.gen(), roomId, actorUserId: host.id, targetParticipantId: participant.id,
			action: 'remove', previousRole: participant.role, nextRole: null, reason: reason ?? null,
			roomRevision: Number((result.raw[0] as { revision: number }).revision), createdAt: now,
		});
		await this.callsEventService.publish(roomId, Number((result.raw[0] as { revision: number }).revision), 'participant', { participantId: participant.id, action: 'removed' });
		await this.callsMediaRevocationService.revokeParticipant(participant, Number((result.raw[0] as { revision: number }).revision), 'moderation');
		this.callsTelemetryService.lifecycle({ action: 'participant-removed', roomId, participantId: participant.id, reason: 'moderation' });
	}

	private async bumpRevision(roomId: string): Promise<number> {
		const result = await this.callsRoomsRepository.createQueryBuilder().update()
			.set({ revision: () => '"revision" + 1', updatedAt: new Date() })
			.where('id = :roomId', { roomId }).returning('revision').execute();
		if (result.affected !== 1) throw new CallsRoomError('room-not-found');
		return Number((result.raw[0] as { revision: number }).revision);
	}

	private sanitizeMetadata(value: string): string {
		return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
	}

	private assertEnabled(): void {
		if (this.config.cloudflareRealtime == null || !this.config.cloudflareRealtime.enabled) throw new CallsFeatureDisabledError();
	}
}
