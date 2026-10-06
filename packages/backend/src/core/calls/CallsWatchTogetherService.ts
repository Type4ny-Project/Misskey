/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { CallsParticipantsRepository, MiUser } from '@/models/_.js';
import { CallsRoomError, CallsRoomService } from './CallsRoomService.js';
import { CallsLiveConnectionService } from './CallsLiveConnectionService.js';
import { CallsEventService } from './CallsEventService.js';

export type WatchTogetherState = {
	queue: string[];
	videoId: string | null;
	playing: boolean;
	position: number;
	updatedAt: number;
	revision: number;
};
export type WatchTogetherSnapshot = WatchTogetherState & { serverTime: number };

@Injectable()
export class CallsWatchTogetherService {
	constructor(
		@Inject(DI.redis) private redis: Redis.Redis,
		@Inject(DI.callsParticipantsRepository) private participants: CallsParticipantsRepository,
		private rooms: CallsRoomService,
		private connections: CallsLiveConnectionService,
		private events: CallsEventService,
	) {}

	public async assertAccess(user: MiUser, roomId: string) {
		const room = await this.rooms.getRoom(roomId);
		await this.rooms.assertCanAccess(user, room);
		if (await this.participants.existsBy({ roomId, userId: user.id, state: 'removed' })) throw new CallsRoomError('access-denied');
		return room;
	}

	private async read(roomId: string): Promise<WatchTogetherState> {
		const raw = await this.redis.get(`calls:watch-together:${roomId}`);
		return { queue: [], ...(raw == null ? { videoId: null, playing: false, position: 0, updatedAt: Date.now(), revision: 0 } : JSON.parse(raw) as WatchTogetherState) };
	}

	public async show(user: MiUser, roomId: string): Promise<WatchTogetherSnapshot> {
		const room = await this.assertAccess(user, roomId);
		const state = await this.read(roomId);
		if (room.state === 'open' && room.ownerUserId === user.id) await this.connections.touchHost(roomId);
		if (room.state !== 'open' && state.playing) {
			state.position += Math.max(0, (room.endedAt?.getTime() ?? Date.now()) - state.updatedAt) / 1000;
			state.playing = false;
		}
		return { ...state, serverTime: Date.now() };
	}

	public async update(user: MiUser, roomId: string, params: { expectedRevision: number; videoId?: string | null; playing?: boolean; position?: number; queue?: string[] }): Promise<WatchTogetherSnapshot> {
		return this.connections.withRoomLock(roomId, async assertHeld => {
			const room = await this.assertAccess(user, roomId);
			await this.rooms.assertCanModerateParticipants(user, room);
			const previous = await this.read(roomId);
			if (previous.revision !== params.expectedRevision) throw new CallsRoomError('stale-revision');
			const now = Date.now();
			const changingVideo = params.videoId !== undefined;
			const videoId = changingVideo ? params.videoId! : previous.videoId;
			const state: WatchTogetherState = {
				queue: params.queue ?? previous.queue,
				videoId,
				playing: videoId != null && (params.playing ?? (changingVideo ? false : previous.playing)),
				position: videoId == null ? 0 : params.position ?? (changingVideo ? 0 : previous.position + (previous.playing ? (now - previous.updatedAt) / 1000 : 0)),
				updatedAt: now,
				revision: previous.revision + 1,
			};
			await assertHeld();
			await this.redis.set(`calls:watch-together:${roomId}`, JSON.stringify(state), 'EX', 7 * 24 * 60 * 60);
			if (room.ownerUserId === user.id) await this.connections.touchHost(roomId);
			const snapshot = { ...state, serverTime: Date.now() };
			await this.events.publish(roomId, room.revision, 'watchTogether', { state: snapshot });
			return snapshot;
		});
	}
}
