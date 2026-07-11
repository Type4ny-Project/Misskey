/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { CallsRoomService } from '@/core/calls/CallsRoomService.js';
import type { JsonObject } from '@/misc/json-value.js';
import Channel, { type ChannelRequest } from '../channel.js';

@Injectable({ scope: Scope.TRANSIENT })
export class CallsRoomChannel extends Channel {
	public readonly chName = 'callsRoom';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:calls';
	private roomId: string;

	constructor(
		@Inject(REQUEST) request: ChannelRequest,
		private callsRoomService: CallsRoomService,
	) { super(request); }

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (typeof params.roomId !== 'string' || this.user == null) return false;
		this.roomId = params.roomId;
		try {
			const room = await this.callsRoomService.getRoom(this.roomId);
			await this.callsRoomService.assertCanAccess(this.user, room);
		} catch { return false; }
		this.subscriber.on(`callsRoomStream:${this.roomId}`, this.onEvent);
		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['callsRoom']['payload']) {
		if (this.user == null) return;
		try {
			const room = await this.callsRoomService.getRoom(this.roomId);
			await this.callsRoomService.assertCanAccess(this.user, room);
		} catch {
			this.send('revoked', { reason: 'access' });
			this.dispose();
			return;
		}
		this.send(data.type, data.body);
	}

	@bindThis
	public dispose() { this.subscriber.off(`callsRoomStream:${this.roomId}`, this.onEvent); }
}
