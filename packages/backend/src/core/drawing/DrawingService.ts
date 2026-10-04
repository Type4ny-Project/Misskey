/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { CallsParticipantsRepository, MiUser } from '@/models/_.js';
import { CallsRoomService } from '@/core/calls/CallsRoomService.js';
import { CallsLiveConnectionService } from '@/core/calls/CallsLiveConnectionService.js';
import { ChatService } from '@/core/ChatService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';

export type DrawingScope = 'public' | 'chatRoom' | 'calls';
export type DrawingStroke = { color: string; width: number; eraser: boolean; points: number[][] };
export type DrawingMessage = { userId: string; text: string; id: string };
export type DrawingControl = {
	canvasId: string;
	version: number;
	scope: DrawingScope;
	ended: boolean;
	participantIds: string[];
	removedIds: string[];
	lastSeen: Record<string, number>;
};
export type DrawingSnapshot = Omit<DrawingControl, 'removedIds' | 'lastSeen'> & { strokes: DrawingStroke[]; messages: DrawingMessage[] };
export type DrawingEvent = Omit<DrawingControl, 'removedIds' | 'lastSeen'> & { action: string; stroke: DrawingStroke | null; message: DrawingMessage | null };
export type DrawingAction = 'start' | 'join' | 'leave' | 'stroke' | 'clear' | 'end' | 'kick' | 'message';
export class DrawingError extends Error {
	constructor(public readonly code: 'accessDenied' | 'invalidState' | 'roomFull' | 'canvasFull') { super(code); }
}

@Injectable()
export class DrawingService {
	constructor(
		@Inject(DI.redis) private redis: Redis.Redis,
		@Inject(DI.callsParticipantsRepository) private callsParticipants: CallsParticipantsRepository,
		private callsRoomService: CallsRoomService,
		private liveConnections: CallsLiveConnectionService,
		private chatService: ChatService,
		private events: GlobalEventService,
	) {}

	private key(roomId: string) { return `drawing:${roomId}`; }

	private async control(roomId: string): Promise<DrawingControl | null> {
		const raw = await this.redis.get(this.key(roomId));
		return raw == null ? null : JSON.parse(raw) as DrawingControl;
	}

	public async assertAccess(user: MiUser, roomId: string, control?: DrawingControl | null, write = false) {
		const room = await this.callsRoomService.getRoom(roomId);
		await this.callsRoomService.assertCanAccess(user, room);
		const availability = await this.chatService.getChatAvailability(user.id);
		if (!availability[write ? 'write' : 'read']) throw new DrawingError('accessDenied');
		const state = control === undefined ? await this.control(roomId) : control;
		if (state?.removedIds.includes(user.id)) throw new DrawingError('accessDenied');
		const participant = await this.callsParticipants.findOneBy({ roomId, userId: user.id });
		if (participant?.state === 'removed') throw new DrawingError('accessDenied');
		if (state?.scope === 'calls') {
			if (participant?.state !== 'active' || await this.liveConnections.get(participant.id) == null) throw new DrawingError('accessDenied');
		}
		// Calls moderators may inspect a ChatRoom, but drawing is limited to its members.
		if (state?.scope === 'chatRoom') {
			const chatRoom = room.chatRoomId == null ? null : await this.chatService.findRoomById(room.chatRoomId);
			if (chatRoom == null || !await this.chatService.isRoomMember(chatRoom, user.id)) throw new DrawingError('accessDenied');
		}
		return room;
	}

	public async snapshot(user: MiUser, roomId: string): Promise<DrawingSnapshot | null> {
		return this.liveConnections.withRoomLock(roomId, async () => {
			const control = await this.control(roomId);
			await this.assertAccess(user, roomId, control);
			if (control == null) return null;
			const { removedIds, lastSeen, ...visible } = control;
			const [strokes, messages] = await Promise.all([
				this.redis.lrange(`${this.key(roomId)}:strokes`, 0, -1),
				this.redis.lrange(`${this.key(roomId)}:messages`, 0, -1),
			]);
			const room = await this.callsRoomService.getRoom(roomId);
			return { ...visible, ended: visible.ended || room.state !== 'open', participantIds: visible.participantIds.filter(id => (control.lastSeen[id] ?? 0) > Date.now() - 90000), strokes: strokes.map(x => JSON.parse(x) as DrawingStroke), messages: messages.map(x => JSON.parse(x) as DrawingMessage) };
		});
	}

	public async update(user: MiUser, roomId: string, action: DrawingAction, params: { canvasId?: string; scope?: DrawingScope; userId?: string; stroke?: DrawingStroke; text?: string }): Promise<void> {
		await this.liveConnections.withRoomLock(roomId, async assertHeld => {
			let control = await this.control(roomId);
			const room = await this.assertAccess(user, roomId, control, true);
			if (room.state !== 'open') throw new DrawingError('invalidState');
			const ownerAction = ['start', 'clear', 'end', 'kick'].includes(action);
			if (ownerAction && room.ownerUserId !== user.id) throw new DrawingError('accessDenied');
			const transaction = this.redis.multi();
			const key = this.key(roomId);
			if (action === 'start') {
				if (control != null || params.scope == null) throw new DrawingError('invalidState');
				if (params.scope === 'public' && (room.attachmentType !== 'personal' || room.visibility !== 'public')) throw new DrawingError('accessDenied');
				if (params.scope === 'chatRoom' && room.chatRoomId == null) throw new DrawingError('accessDenied');
				control = { canvasId: randomUUID(), version: 0, scope: params.scope, ended: false, participantIds: [user.id], removedIds: [], lastSeen: { [user.id]: Date.now() } };
				await this.assertAccess(user, roomId, control, true);
			} else {
				if (control == null || control.ended || control.canvasId !== params.canvasId) throw new DrawingError('invalidState');
				control.participantIds = control.participantIds.filter(id => (control!.lastSeen[id] ?? 0) > Date.now() - 90000);
				if (action === 'join') {
					control.lastSeen[user.id] = Date.now();
					if (!control.participantIds.includes(user.id)) {
						if (control.participantIds.length >= 16) throw new DrawingError('roomFull');
						control.participantIds.push(user.id);
					}
				} else if (action === 'leave') {
					control.participantIds = control.participantIds.filter(id => id !== user.id);
				} else if (action === 'kick') {
					if (params.userId == null || params.userId === room.ownerUserId || !control.participantIds.includes(params.userId)) throw new DrawingError('invalidState');
					control.participantIds = control.participantIds.filter(id => id !== params.userId);
					control.removedIds.push(params.userId);
				} else if (action === 'clear') {
					control.canvasId = randomUUID();
					transaction.del(`${key}:strokes`);
				} else if (action === 'end') {
					control.ended = true;
				} else {
					if (!control.participantIds.includes(user.id)) throw new DrawingError('accessDenied');
					if (action === 'stroke') {
						if (params.stroke == null) throw new DrawingError('invalidState');
						if (await this.redis.llen(`${key}:strokes`) >= 10000) throw new DrawingError('canvasFull');
						transaction.rpush(`${key}:strokes`, JSON.stringify(params.stroke));
					} else if (action === 'message') {
						if (params.text == null || params.text.trim().length === 0) throw new DrawingError('invalidState');
					}
				}
			}
			const message = action === 'message' ? { userId: user.id, text: params.text!.trim(), id: randomUUID() } : null;
			if (message != null) transaction.rpush(`${key}:messages`, JSON.stringify(message)).ltrim(`${key}:messages`, -50, -1);
			control.version++;
			await assertHeld();
			transaction.set(key, JSON.stringify(control));
			const result = await transaction.exec();
			const error = result?.find(([err]) => err != null)?.[0];
			if (error != null) throw error;
			const { removedIds, lastSeen, ...visible } = control;
			this.events.publishDrawingStream(roomId, { ...visible, action, stroke: action === 'stroke' ? params.stroke! : null, message });
		});
	}
}
