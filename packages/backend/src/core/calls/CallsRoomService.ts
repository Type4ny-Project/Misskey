/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { In, IsNull, QueryFailedError } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type {
	CallsModerationLogsRepository,
	CallsParticipantsRepository,
	CallsRoomsRepository,
	MiCallsModerationLog,
	ChatRoomsRepository,
	ChannelsRepository,
	MiCallsParticipant,
	MiCallsRoom,
	MiChatRoom,
	MiUser,
} from '@/models/_.js';
import { MiChannel } from '@/models/Channel.js';
import type { MiLocalUser } from '@/models/User.js';
import { ChannelFollowingService } from '@/core/ChannelFollowingService.js';
import type { CallsModerationAction } from '@/models/CallsModerationLog.js';
import type { CallsParticipantRole } from '@/models/CallsParticipant.js';
import type { CallsRoomMode, CallsRoomVisibility } from '@/models/CallsRoom.js';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';
import { ChatService } from '@/core/ChatService.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { CallsEventService } from './CallsEventService.js';
import { CallsLiveConnectionService, type CallsConnectionIdentity } from './CallsLiveConnectionService.js';
import { CallsMediaRevocationService } from './CallsMediaRevocationService.js';
import { CallsTelemetryService } from './CallsTelemetryService.js';
import type { Config } from '@/config.js';

export type CallsRoomErrorCode =
	| 'access-denied'
	| 'attachment-not-found'
	| 'active-attachment'
	| 'invalid-state'
	| 'invalid-metadata'
	| 'participant-not-found'
	| 'room-not-found'
	| 'room-full'
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
export class CallsRoomService implements OnModuleInit, OnApplicationShutdown {
	private hostTimeoutTimer: ReturnType<typeof setInterval> | null = null;
	private checkingHostTimeouts = false;

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
		private callsLiveConnectionService: CallsLiveConnectionService,
		private callsEventService: CallsEventService,
		private callsMediaRevocationService: CallsMediaRevocationService,
		private callsTelemetryService: CallsTelemetryService,
		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,
		private channelFollowingService: ChannelFollowingService,
	) {}

	public async onModuleInit(): Promise<void> {
		if (!this.config.cloudflareRealtime?.enabled) return;
		const rooms = await this.callsRoomsRepository.findBy({ state: 'open' });
		for (const room of rooms) await this.callsLiveConnectionService.touchHost(room.id, true);
		this.hostTimeoutTimer = setInterval(() => {
			if (this.checkingHostTimeouts) return;
			this.checkingHostTimeouts = true;
			void this.endRoomsWithExpiredHosts().catch(error => {
				console.error('[Calls] Host timeout check failed', error);
			}).finally(() => { this.checkingHostTimeouts = false; });
		}, 1000);
		this.hostTimeoutTimer.unref();
	}

	public onApplicationShutdown(): void {
		if (this.hostTimeoutTimer != null) clearInterval(this.hostTimeoutTimer);
	}

	public async endRoomsWithExpiredHosts(): Promise<void> {
		for (const roomId of await this.callsLiveConnectionService.expiredHostRooms()) {
			const ended = await this.callsLiveConnectionService.withRoomLock(roomId, async () => {
				const deadline = await this.callsLiveConnectionService.getHostDeadline(roomId);
				if (deadline == null || deadline > Date.now()) return null;
				const room = await this.callsRoomsRepository.findOneBy({ id: roomId });
				if (room == null || room.state !== 'open') {
					await this.callsLiveConnectionService.removeHostDeadline(roomId);
					return null;
				}
				const now = new Date();
				const result = await this.callsRoomsRepository.createQueryBuilder().update()
					.set({ state: 'ended', endedAt: now, updatedAt: now, revision: () => '"revision" + 1' })
					.where('id = :roomId AND state = :state AND revision = :revision', { roomId, state: 'open', revision: room.revision })
					.returning('*').execute();
				if (result.affected !== 1) return null;
				await this.callsLiveConnectionService.removeHostDeadline(roomId);
				return result.raw[0] as MiCallsRoom;
			});
			if (ended == null) continue;
			await this.callsEventService.publish(roomId, ended.revision, 'lifecycle', { state: 'ended', reason: 'host-timeout' });
			this.callsEventService.publishRoomsList('updated', { roomId, action: 'ended' });
			this.callsTelemetryService.lifecycle({ action: 'room-ended', roomId, reason: 'host-timeout' });
			try {
				await this.callsMediaRevocationService.revokeRoom(roomId, ended.revision, 'room-ended');
			} finally {
				await this.callsParticipantsRepository.update({ roomId, state: 'active' }, { state: 'left', leftAt: ended.endedAt, updatedAt: new Date() });
			}
		}
	}

	@bindThis
	public async create(owner: MiUser, params: {
		attachmentType: 'personal' | 'chatRoom';
		chatRoomId?: MiChatRoom['id'];
		title: string;
		description?: string;
		mode?: CallsRoomMode;
		visibility?: CallsRoomVisibility;
		visibleUserIds?: MiUser['id'][];
		scheduledAt?: Date | null;
	}): Promise<MiCallsRoom> {
		this.assertEnabled(params.attachmentType);
		if (owner.host !== null) throw new CallsRoomError('access-denied');
		await this.assertCanJoin(owner);
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
		const activeAttachment = await this.callsRoomsRepository.findOneBy({
			attachmentType: params.attachmentType,
			ownerUserId: params.attachmentType === 'personal' ? owner.id : undefined,
			chatRoomId: params.attachmentType === 'chatRoom' ? params.chatRoomId! : IsNull(),
			state: In(['scheduled', 'open']),
		});
		if (activeAttachment != null) throw new CallsRoomError('active-attachment');

		const now = new Date();
		const room = await this.callsRoomsRepository.manager.transaction(async manager => {
			const channel = params.attachmentType === 'personal' && params.visibility === 'public'
				? await manager.getRepository(MiChannel).save({
					id: this.idService.gen(), userId: owner.id, name: title.slice(0, 128),
					description, isUnlisted: true, isLocalOnly: true, allowRenoteToExternal: false,
				})
				: null;
			const room = await manager.getRepository<MiCallsRoom>(this.callsRoomsRepository.target).save({
				id: this.idService.gen(),
				attachmentType: params.attachmentType,
				ownerUserId: owner.id,
				chatRoomId: params.attachmentType === 'chatRoom' ? params.chatRoomId : null,
				channelId: channel?.id ?? null,
				title,
				description,
				mode: params.mode ?? 'open',
				visibility: params.attachmentType === 'chatRoom' ? 'specified' : (params.visibility ?? 'specified'),
				visibleUserIds: params.attachmentType === 'personal' && params.visibility === 'specified' ? [...new Set(params.visibleUserIds ?? [])] : [],
				moderatorUserIds: [],
				state: 'scheduled',
				scheduledAt: params.scheduledAt ?? null,
				startedAt: null,
				endedAt: null,
				revision: 0,
				createdAt: now,
				updatedAt: now,
			});

			await manager.getRepository<MiCallsParticipant>(this.callsParticipantsRepository.target).save({
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
			return room;
		});
		await this.followRoomChannel(owner, room);
		this.callsTelemetryService.lifecycle({ action: 'room-created', roomId: room.id });
		this.callsEventService.publishRoomsList('created', { roomId: room.id });

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
	public async listDiscoverable(user: MiUser, limit: number, chatRoomId?: MiChatRoom['id'], states: Array<'scheduled' | 'open'> = ['scheduled', 'open'], following = false): Promise<MiCallsRoom[]> {
		if (user.host !== null) return [];
		const where = { state: In(states), ...(chatRoomId == null ? {} : { chatRoomId }) };
		let followingRoomIds: string[] = [];
		let followingUserIds: string[] = [];
		if (following) {
			followingUserIds = Object.keys(await this.cacheService.userFollowingsCache.fetch(user.id));
			if (followingUserIds.length === 0) return [];
			const participants = await this.callsParticipantsRepository.findBy({ userId: In(followingUserIds), state: 'active' });
			followingRoomIds = [...new Set(participants.map(participant => participant.roomId))];
		}
		const candidates = await this.callsRoomsRepository.find({
			where: following ? [
				{ ...where, ownerUserId: In(followingUserIds) },
				{ ...where, id: In(followingRoomIds) },
			] : where,
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
	public async listActiveRoomsForUsers(viewer: MiUser, userIds: MiUser['id'][]): Promise<Array<{ userId: MiUser['id']; roomId: MiCallsRoom['id'] }>> {
		if (viewer.host !== null || userIds.length === 0) return [];
		const participants = await this.callsParticipantsRepository.findBy({ userId: In(userIds), state: 'active' });
		if (participants.length === 0) return [];
		const rooms = await this.callsRoomsRepository.findBy({ id: In([...new Set(participants.map(participant => participant.roomId))]), state: 'open' });
		const roomsById = new Map(rooms.map(room => [room.id, room]));
		const accessible = new Set<string>();
		for (const room of rooms) {
			try {
				await this.assertCanAccess(viewer, room);
				accessible.add(room.id);
			} catch (error) {
				if (!(error instanceof CallsRoomError) || error.code !== 'access-denied') throw error;
			}
		}
		return participants.flatMap(participant => {
			const room = roomsById.get(participant.roomId);
			return room != null && accessible.has(room.id) ? [{ userId: participant.userId, roomId: room.id }] : [];
		});
	}

	@bindThis
	public async open(host: MiUser, roomId: string, expectedRevision: number): Promise<MiCallsRoom> {
		await this.assertCanJoin(host);
		return this.transition(host, roomId, expectedRevision, 'scheduled', 'open');
	}

	@bindThis
	public async end(host: MiUser, roomId: string, expectedRevision: number, identity?: CallsConnectionIdentity): Promise<MiCallsRoom> {
		if (identity == null) return this.transition(host, roomId, expectedRevision, 'open', 'ended');
		return this.callsLiveConnectionService.withRoomLock(roomId, async () => {
			await this.assertCurrentConnection(host, roomId, identity);
			return this.transition(host, roomId, expectedRevision, 'open', 'ended');
		});
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
		if (to === 'open') await this.callsLiveConnectionService.touchHost(roomId);
		else await this.callsLiveConnectionService.removeHostDeadline(roomId);
		await this.callsEventService.publish(roomId, updated.revision, 'lifecycle', { state: updated.state });
		this.callsTelemetryService.lifecycle({ action: `room-${updated.state}`, roomId });
		this.callsEventService.publishRoomsList('updated', { roomId, action: updated.state as 'open' | 'ended' | 'cancelled' });
		if (updated.state === 'ended' || updated.state === 'cancelled') {
			await this.callsMediaRevocationService.revokeRoom(roomId, updated.revision, 'room-ended');
		}
		return updated;
	}

	@bindThis
	public async join(user: MiUser, roomId: string, reconnectToken?: string): Promise<MiCallsParticipant> {
		await this.assertCanJoin(user);
		return this.callsLiveConnectionService.withRoomLock(roomId, async () => {
			if (reconnectToken != null) await this.callsLiveConnectionService.consumeReconnectToken(reconnectToken);
			return this.joinLocked(user, roomId);
		});
	}

	@bindThis
	public async assertCanJoin(user: Pick<MiUser, 'id'>): Promise<void> {
		if (!(await this.roleService.getUserPolicies(user.id)).canJoinCalls) throw new CallsRoomError('access-denied');
	}

	@bindThis
	public async assertCanPublish(user: Pick<MiUser, 'id'>, mediaSource: 'microphone' | 'camera' | 'screen'): Promise<void> {
		const policies = await this.roleService.getUserPolicies(user.id);
		if (!policies.canJoinCalls || (mediaSource === 'microphone' && !policies.canSpeakInCalls)
			|| (mediaSource === 'camera' && !policies.canPublishCallsVideo)
			|| (mediaSource === 'screen' && !policies.canShareCallsScreen)) {
			throw new CallsRoomError('access-denied');
		}
	}

	private async assertCapacity(room: MiCallsRoom, role: CallsParticipantRole, excludingParticipantId?: string): Promise<void> {
		const policies = await this.roleService.getUserPolicies(room.ownerUserId);
		const limit = role === 'listener' ? policies.callsRoomListenerLimit : policies.callsRoomSpeakerLimit;
		if (limit === 0) return;
		const candidates = await this.callsParticipantsRepository.findBy({
			roomId: room.id, state: 'active', role: role === 'listener' ? 'listener' : In(['host', 'speaker']),
		});
		const joiningSince = Date.now() - CallsLiveConnectionService.ttlSeconds * 1000;
		const connected = await Promise.all(candidates.filter(participant => participant.id !== excludingParticipantId).map(async participant =>
			participant.joinedAt.getTime() >= joiningSince || await this.callsLiveConnectionService.get(participant.id) != null));
		if (connected.filter(Boolean).length >= limit) throw new CallsRoomError('room-full');
	}

	private async joinLocked(user: MiUser, roomId: string): Promise<MiCallsParticipant> {
		const room = await this.getRoom(roomId);
		await this.assertCanAccess(user, room);
		if (room.state !== 'open') throw new CallsRoomError('invalid-state');

		const current = await this.callsParticipantsRepository.findOneBy({ roomId, userId: user.id });
		if (current?.state === 'active') {
			await this.followRoomChannel(user, room);
			return current;
		}
		const role = current?.role === 'host' ? 'host' : room.mode === 'open' ? 'speaker' : 'listener';
		await this.assertCapacity(room, role);

		const now = new Date();
		let joined: MiCallsParticipant;
		if (current != null) {
			await this.callsParticipantsRepository.update(current.id, {
				role,
				state: 'active',
				isMuted: room.mode === 'open',
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
				role,
				state: 'active',
				isMuted: room.mode === 'open',
				joinedAt: now,
				leftAt: null,
				speakerRequestedAt: null,
				updatedAt: now,
			});
		}
		await this.followRoomChannel(user, room);
		const revision = await this.bumpRevision(roomId);
		await this.callsEventService.publish(roomId, revision, 'participant', { participantId: joined.id, action: 'joined' });
		this.callsTelemetryService.lifecycle({ action: 'participant-joined', roomId, participantId: joined.id });
		return joined;
	}

	private async followRoomChannel(user: MiUser, room: MiCallsRoom): Promise<void> {
		if (room.channelId == null) return;
		const channel = await this.channelsRepository.findOneByOrFail({ id: room.channelId });
		await this.channelFollowingService.followOrRequest(user as MiLocalUser, channel, true);
	}

	@bindThis
	public async leave(user: MiUser, roomId: string, identity?: CallsConnectionIdentity & { token?: string }): Promise<void> {
		if (identity?.token != null) {
			const disconnected = await this.callsLiveConnectionService.withRoomLock(roomId, async () => {
				if (await this.callsLiveConnectionService.isReconnectTokenConsumed(identity.token!)) return;
				const participant = await this.callsParticipantsRepository.findOneBy({ roomId, userId: user.id, state: 'active' });
				if (participant == null) return;
				const connection = await this.callsLiveConnectionService.get(participant.id);
				if (connection == null || connection.connectionId !== identity.connectionId || connection.generation !== identity.generation) return;
				if (!(await this.callsLiveConnectionService.clear(participant.id, identity.connectionId, identity.generation))) return;
				const now = new Date();
				await this.callsParticipantsRepository.update(participant.id, { state: 'left', leftAt: now, updatedAt: now });
				const revision = await this.bumpRevision(roomId);
				await this.callsEventService.publish(roomId, revision, 'participant', { participantId: participant.id, action: 'left' });
				const disconnected = await this.callsMediaRevocationService.revokeDisconnectedGeneration(participant, connection, revision);
				this.callsTelemetryService.lifecycle({ action: 'participant-left', roomId, participantId: participant.id, reason: 'reload' });
				return disconnected;
			});
			// Provider cleanup can exceed the join timeout; release the room lock first.
			if (disconnected != null) await this.callsMediaRevocationService.closeGeneration(disconnected.participantId, disconnected.generation);
			return;
		}
		if (identity != null) {
			return this.callsLiveConnectionService.withRoomLock(roomId, async () => {
				await this.assertCurrentConnection(user, roomId, identity);
				await this.leaveParticipant(user, roomId);
			});
		}
		await this.leaveParticipant(user, roomId);
	}

	private async assertCurrentConnection(user: MiUser, roomId: string, identity: CallsConnectionIdentity): Promise<void> {
		const participant = await this.callsParticipantsRepository.findOneBy({ roomId, userId: user.id, state: 'active' });
		if (participant == null) throw new CallsRoomError('participant-not-found');
		const current = await this.callsLiveConnectionService.get(participant.id);
		if (current == null || current.connectionId !== identity.connectionId || current.generation !== identity.generation) throw new CallsRoomError('invalid-state');
	}

	private async leaveParticipant(user: MiUser, roomId: string): Promise<void> {
		const participant = await this.callsParticipantsRepository.findOneBy({ roomId, userId: user.id, state: 'active' });
		if (participant == null) throw new CallsRoomError('participant-not-found');
		const now = new Date();
		await this.callsParticipantsRepository.update(participant.id, { state: 'left', leftAt: now, updatedAt: now });
		const revision = await this.bumpRevision(roomId);
		await this.callsEventService.publish(roomId, revision, 'participant', { participantId: participant.id, action: 'left' });
		await this.callsMediaRevocationService.revokeParticipant(participant, revision, 'access');
		this.callsTelemetryService.lifecycle({ action: 'participant-left', roomId, participantId: participant.id, reason: 'access' });
	}

	@bindThis
	public async setRole(host: MiUser, roomId: string, participantId: string, role: Exclude<CallsParticipantRole, 'host'>, expectedRevision: number): Promise<MiCallsParticipant> {
		return this.callsLiveConnectionService.withRoomLock(roomId, () =>
			this.moderateRole(host, roomId, participantId, role, expectedRevision, role === 'speaker' ? 'promote' : 'demote'));
	}

	private async moderateRole(host: MiUser, roomId: string, participantId: string, role: Exclude<CallsParticipantRole, 'host'>, expectedRevision: number, action: CallsModerationAction): Promise<MiCallsParticipant> {
		const room = await this.getRoom(roomId);
		if (room.ownerUserId !== host.id && !(await this.roleService.isModerator(host))) throw new CallsRoomError('access-denied');
		if (room.state !== 'open' || room.mode !== 'stage') throw new CallsRoomError('invalid-state');
		const participant = await this.callsParticipantsRepository.findOneBy({ id: participantId, roomId, state: 'active' });
		if (participant == null || participant.role === 'host') throw new CallsRoomError('participant-not-found');

		if (role === 'speaker') await this.assertCanJoin({ id: participant.userId });
		if (role === 'speaker' && participant.role !== role) await this.assertCapacity(room, role, participant.id);

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
		if (role === 'listener' && participant.speakerRequestedAt != null) {
			await this.callsEventService.publish(roomId, revision, 'speakerRequest', { participantId: participant.id, requested: false });
		}
		if (role === 'listener') await this.callsMediaRevocationService.revokeParticipant(updated, revision, 'moderation');
		this.callsTelemetryService.lifecycle({ action: `participant-${role}`, roomId, participantId: participant.id, reason: 'moderation' });
		return updated;
	}

	@bindThis
	public async requestSpeaker(user: MiUser, roomId: string): Promise<void> {
		await this.assertCanPublish(user, 'microphone');
		const room = await this.getRoom(roomId);
		if (room.mode !== 'stage') throw new CallsRoomError('invalid-state');
		const participant = await this.callsParticipantsRepository.findOneBy({ roomId, userId: user.id, state: 'active', role: 'listener' });
		if (participant == null) throw new CallsRoomError('participant-not-found');
		const now = new Date();
		await this.callsParticipantsRepository.update(participant.id, { speakerRequestedAt: now, updatedAt: now });
		const revision = await this.bumpRevision(roomId);
		await this.callsEventService.publish(roomId, revision, 'speakerRequest', { participantId: participant.id, requested: true });
	}

	@bindThis
	public async cancelSpeakerRequest(user: MiUser, roomId: string): Promise<void> {
		const participant = await this.callsParticipantsRepository.findOneBy({ roomId, userId: user.id, state: 'active', role: 'listener' });
		if (participant == null || participant.speakerRequestedAt == null) throw new CallsRoomError('participant-not-found');
		await this.callsParticipantsRepository.update(participant.id, { speakerRequestedAt: null, updatedAt: new Date() });
		const revision = await this.bumpRevision(roomId);
		await this.callsEventService.publish(roomId, revision, 'speakerRequest', { participantId: participant.id, requested: false });
	}

	@bindThis
	public async setMuted(user: MiUser, roomId: string, isMuted: boolean): Promise<void> {
		if (!isMuted) await this.assertCanPublish(user, 'microphone');
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
	public async muteParticipant(actor: MiUser, roomId: string, participantId: string, expectedRevision: number): Promise<void> {
		const room = await this.getRoom(roomId);
		this.assertEnabled(room.attachmentType);
		await this.assertCanModerateParticipants(actor, room);
		const participant = await this.callsParticipantsRepository.findOneBy({ id: participantId, roomId, state: 'active' });
		if (participant == null || participant.role !== 'speaker') throw new CallsRoomError('participant-not-found');
		if (participant.isMuted) {
			await this.callsEventService.publish(roomId, room.revision, 'mute', { participantId: participant.id, isMuted: true });
			return;
		}
		const result = await this.callsRoomsRepository.createQueryBuilder().update()
			.set({ revision: () => '"revision" + 1', updatedAt: new Date() })
			.where('id = :roomId AND revision = :expectedRevision AND state = :state', { roomId, expectedRevision, state: 'open' })
			.returning('revision').execute();
		if (result.affected !== 1) throw new CallsRoomError('stale-revision');
		const revision = Number((result.raw[0] as { revision: number }).revision);
		const now = new Date();
		await this.callsParticipantsRepository.update(participant.id, { isMuted: true, updatedAt: now });
		await this.callsModerationLogsRepository.insert({
			id: this.idService.gen(), roomId, actorUserId: actor.id, targetParticipantId: participant.id,
			action: 'mute', previousRole: participant.role, nextRole: participant.role,
			reason: null, roomRevision: revision, createdAt: now,
		});
		await this.callsEventService.publish(roomId, revision, 'mute', { participantId: participant.id, isMuted: true });
		this.callsTelemetryService.lifecycle({ action: 'participant-muted', roomId, participantId: participant.id, reason: 'moderation' });
	}

	@bindThis
	public async stopParticipantVideo(actor: MiUser, roomId: string, participantId: string, mediaSource: 'camera' | 'screen', expectedRevision: number): Promise<void> {
		const room = await this.getRoom(roomId);
		this.assertEnabled(room.attachmentType);
		await this.assertCanModerateParticipants(actor, room);
		const participant = await this.callsParticipantsRepository.findOneBy({ id: participantId, roomId, state: 'active' });
		if (participant == null || participant.role !== 'speaker') throw new CallsRoomError('participant-not-found');
		const result = await this.callsRoomsRepository.createQueryBuilder().update()
			.set({ revision: () => '"revision" + 1', updatedAt: new Date() })
			.where('id = :roomId AND revision = :expectedRevision AND state = :state', { roomId, expectedRevision, state: 'open' })
			.returning('revision').execute();
		if (result.affected !== 1) throw new CallsRoomError('stale-revision');
		const revision = Number((result.raw[0] as { revision: number }).revision);
		await this.callsMediaRevocationService.stopParticipantVideo(participant, mediaSource, revision);
		this.callsTelemetryService.lifecycle({ action: `participant-${mediaSource}-stopped`, roomId, participantId: participant.id, reason: 'moderation' });
	}

	@bindThis
	public async reportSpeaking(user: MiUser, roomId: string, speaking: boolean): Promise<void> {
		if (speaking) await this.assertCanPublish(user, 'microphone');
		const room = await this.getRoom(roomId);
		await this.assertCanAccess(user, room);
		if (room.state !== 'open') return;
		const participant = await this.callsParticipantsRepository.findOneBy({ roomId, userId: user.id, state: 'active' });
		if (participant == null || participant.role === 'listener' || participant.isMuted) return;
		await this.callsEventService.reportSpeaking(roomId, room.revision, participant.id, speaking);
	}

	@bindThis
	public async updateTitle(host: MiUser, roomId: string, title: string, expectedRevision: number): Promise<MiCallsRoom> {
		const room = await this.getRoom(roomId);
		if (room.ownerUserId !== host.id) throw new CallsRoomError('access-denied');
		if (room.state !== 'scheduled' && room.state !== 'open') throw new CallsRoomError('invalid-state');
		const sanitizedTitle = this.sanitizeMetadata(title);
		if (sanitizedTitle.length === 0) throw new CallsRoomError('invalid-metadata');
		const result = await this.callsRoomsRepository.createQueryBuilder().update()
			.set({ title: sanitizedTitle, revision: () => '"revision" + 1', updatedAt: new Date() })
			.where('id = :roomId AND revision = :expectedRevision AND state = :state', { roomId, expectedRevision, state: room.state })
			.returning('*').execute();
		if (result.affected !== 1) throw new CallsRoomError('stale-revision');
		const updated = result.raw[0] as MiCallsRoom;
		if (updated.channelId != null) await this.channelsRepository.update(updated.channelId, { name: updated.title.slice(0, 128) });
		await this.callsEventService.publish(roomId, updated.revision, 'title', { title: updated.title });
		this.callsEventService.publishRoomsList('updated', { roomId, action: 'title' });
		return updated;
	}

	@bindThis
	public async transferHost(host: MiUser, roomId: string, participantId: string, expectedRevision: number): Promise<MiCallsRoom> {
		return this.callsLiveConnectionService.withRoomLock(roomId, async () => {
			let transfer: { room: MiCallsRoom; formerHostParticipantId: string; formerHostRole: CallsParticipantRole };
			try {
				transfer = await this.callsRoomsRepository.manager.transaction(async manager => {
					const rooms = manager.getRepository<MiCallsRoom>(this.callsRoomsRepository.target);
					const participants = manager.getRepository<MiCallsParticipant>(this.callsParticipantsRepository.target);
					const logs = manager.getRepository<MiCallsModerationLog>(this.callsModerationLogsRepository.target);
					const room = await rooms.findOneBy({ id: roomId });
					if (room == null) throw new CallsRoomError('room-not-found');
					// Only the actor recorded by this committed transfer may resend its notifications.
					const retry = room.ownerUserId !== host.id && await logs.existsBy({ roomId, actorUserId: host.id, targetParticipantId: participantId, action: 'promote', nextRole: 'host', reason: 'host-transfer', roomRevision: expectedRevision + 1 });
					if (room.ownerUserId !== host.id && !retry) throw new CallsRoomError('access-denied');
					if (room.state !== 'open') throw new CallsRoomError('invalid-state');
					const participant = await participants.findOneBy({ id: participantId, roomId, state: 'active' });
					if (participant == null) throw new CallsRoomError('participant-not-found');
					const formerHost = await participants.findOneByOrFail({ roomId, userId: host.id });
					if (retry) {
						if (participant.role !== 'host' || room.ownerUserId !== participant.userId) throw new CallsRoomError('access-denied');
						return { room, formerHostParticipantId: formerHost.id, formerHostRole: formerHost.role };
					}
					if (participant.role === 'host') throw new CallsRoomError('participant-not-found');
					await this.assertCanJoin({ id: participant.userId });
					const now = new Date();
					// Keep current participants' access when the owner-based visibility changes.
					const activeParticipants = room.visibility === 'public' ? [] : await participants.findBy({ roomId, state: 'active' });
					const visibleUserIds = room.visibility === 'public' ? room.visibleUserIds : [...new Set([...room.visibleUserIds, host.id, ...activeParticipants.map(item => item.userId)])];
					const result = await rooms.createQueryBuilder().update()
						.set({ ownerUserId: participant.userId, visibleUserIds, moderatorUserIds: room.moderatorUserIds.filter(id => id !== participant.userId), revision: () => '"revision" + 1', updatedAt: now })
						.where('id = :roomId AND revision = :expectedRevision AND state = :state AND "ownerUserId" = :ownerUserId', { roomId, expectedRevision, state: 'open', ownerUserId: host.id })
						.returning('*').execute();
					if (result.affected !== 1) throw new CallsRoomError('stale-revision');
					await participants.update({ roomId, userId: host.id, role: 'host' }, { role: 'speaker', updatedAt: now });
					const promoted = await participants.update({ id: participant.id, state: 'active' }, { role: 'host', speakerRequestedAt: null, updatedAt: now });
					if (promoted.affected !== 1) throw new CallsRoomError('participant-not-found');
					const updated = result.raw[0] as MiCallsRoom;
					await logs.insert({ id: this.idService.gen(), roomId, actorUserId: host.id, targetParticipantId: participant.id, action: 'promote', previousRole: participant.role, nextRole: 'host', reason: 'host-transfer', roomRevision: updated.revision, createdAt: now });
					return { room: updated, formerHostParticipantId: formerHost.id, formerHostRole: 'speaker' as const };
				});
			} catch (error) {
				if (error instanceof QueryFailedError && error.driverError.code === '23505' && error.driverError.constraint === 'IDX_calls_room_active_personal_owner') throw new CallsRoomError('active-attachment');
				throw error;
			}
			await this.callsLiveConnectionService.touchHost(roomId);
			await this.callsEventService.publish(roomId, transfer.room.revision, 'role', { participantId: transfer.formerHostParticipantId, role: transfer.formerHostRole });
			await this.callsEventService.publish(roomId, transfer.room.revision, 'participant', { participantId, action: 'updated' });
			this.callsTelemetryService.lifecycle({ action: 'host-transferred', roomId, participantId });
			return transfer.room;
		});
	}

	@bindThis
	public async setModerator(host: MiUser, roomId: string, participantId: string, isModerator: boolean, expectedRevision: number): Promise<MiCallsRoom> {
		const room = await this.getRoom(roomId);
		if (room.ownerUserId !== host.id) throw new CallsRoomError('access-denied');
		if (room.state !== 'open') throw new CallsRoomError('invalid-state');
		const participant = await this.callsParticipantsRepository.findOneBy({ id: participantId, roomId, state: 'active' });
		if (participant == null || participant.role === 'host') throw new CallsRoomError('participant-not-found');
		const moderatorUserIds = room.moderatorUserIds.filter(id => id !== participant.userId);
		if (isModerator) moderatorUserIds.push(participant.userId);
		const result = await this.callsRoomsRepository.createQueryBuilder().update()
			.set({ moderatorUserIds, revision: () => '"revision" + 1', updatedAt: new Date() })
			.where('id = :roomId AND revision = :expectedRevision AND state = :state', { roomId, expectedRevision, state: 'open' })
			.returning('*').execute();
		if (result.affected !== 1) throw new CallsRoomError('stale-revision');
		const updated = result.raw[0] as MiCallsRoom;
		await this.callsEventService.publish(roomId, updated.revision, 'participant', { participantId, action: 'updated' });
		return updated;
	}

	@bindThis
	public async removeParticipant(host: MiUser, roomId: string, participantId: string, expectedRevision: number, reason?: string): Promise<void> {
		const room = await this.getRoom(roomId);
		await this.assertCanModerateParticipants(host, room);
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

	private async assertCanModerateParticipants(actor: MiUser, room: MiCallsRoom): Promise<void> {
		if (room.state !== 'open') throw new CallsRoomError('invalid-state');
		if (room.ownerUserId === actor.id || await this.roleService.isModerator(actor)) return;
		if (!room.moderatorUserIds.includes(actor.id) || !(await this.callsParticipantsRepository.existsBy({ roomId: room.id, userId: actor.id, state: 'active' }))) throw new CallsRoomError('access-denied');
		await this.assertCanAccess(actor, room);
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

	private assertEnabled(attachmentType?: MiCallsRoom['attachmentType']): void {
		// ChatRoom-attached Calls are temporarily disabled; personal Calls remain available.
		if (attachmentType === 'chatRoom' || this.config.cloudflareRealtime == null || !this.config.cloudflareRealtime.enabled) throw new CallsFeatureDisabledError();
	}
}
