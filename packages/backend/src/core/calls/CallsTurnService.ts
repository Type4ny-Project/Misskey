/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { CallsParticipantsRepository, MiUser } from '@/models/_.js';
import { CallsRoomError, CallsRoomService } from './CallsRoomService.js';

export type CallsIceServer = { urls: string[]; username?: string; credential?: string };

export class CallsTurnNotConfiguredError extends Error {}
export class CallsTurnProviderError extends Error {}

@Injectable()
export class CallsTurnService {
	constructor(
		@Inject(DI.config) private config: Config,
		@Inject(DI.redis) private redis: Redis.Redis,
		@Inject(DI.callsParticipantsRepository) private participantsRepository: CallsParticipantsRepository,
		private roomService: CallsRoomService,
	) {}

	public async issue(user: MiUser, roomId: string): Promise<{ iceServers: CallsIceServer[]; expiresAt: string }> {
		const turn = this.config.cloudflareRealtime?.turn;
		if (turn == null) throw new CallsTurnNotConfiguredError();
		const room = await this.roomService.getRoom(roomId);
		await this.roomService.assertCanAccess(user, room);
		if (room.state !== 'open') throw new CallsRoomError('invalid-state');
		const participant = await this.participantsRepository.findOneBy({ roomId, userId: user.id, state: 'active' });
		if (participant == null) throw new CallsRoomError('participant-not-found');

		const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turn.keyId)}/credentials/generate-ice-servers`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${turn.apiToken}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ ttl: turn.ttl }),
			signal: AbortSignal.timeout(10_000),
		});
		if (response.status !== 201) throw new CallsTurnProviderError();
		const body = await response.json() as { iceServers?: CallsIceServer[] };
		if (!Array.isArray(body.iceServers)) throw new CallsTurnProviderError();
		const iceServers = body.iceServers.map(server => ({
			...server,
			urls: server.urls.filter(url => !/:(?:53)(?:\?|$)/.test(url)),
		})).filter(server => server.urls.length > 0);
		const credential = iceServers.find(server => server.username != null);
		const expiresAt = new Date(Date.now() + turn.ttl * 1000).toISOString();
		if (credential?.username != null) {
			await this.redis.set(`calls:turn:${credential.username}`, JSON.stringify({ roomId, participantId: participant.id, userId: user.id, expiresAt }), 'EX', turn.ttl);
		}
		return { iceServers, expiresAt };
	}

	public async revoke(username: string): Promise<void> {
		const turn = this.config.cloudflareRealtime?.turn;
		if (turn == null) return;
		await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turn.keyId)}/credentials/${encodeURIComponent(username)}/revoke`, {
			method: 'POST', headers: { Authorization: `Bearer ${turn.apiToken}` }, signal: AbortSignal.timeout(10_000),
		});
		await this.redis.del(`calls:turn:${username}`);
	}
}
