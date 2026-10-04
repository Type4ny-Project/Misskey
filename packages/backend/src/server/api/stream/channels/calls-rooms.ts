/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { bindThis } from '@/decorators.js';
import { CallsRoomService } from '@/core/calls/CallsRoomService.js';
import { CallsEntityService } from '@/core/entities/CallsEntityService.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import Channel, { type ChannelRequest } from '../channel.js';

@Injectable({ scope: Scope.TRANSIENT })
export class CallsRoomsChannel extends Channel {
	public readonly chName = 'callsRooms';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:calls';

	constructor(
		@Inject(REQUEST) request: ChannelRequest,
		private callsRoomService: CallsRoomService,
		private callsEntityService: CallsEntityService,
	) { super(request); }

	@bindThis
	public async init(_params: JsonObject): Promise<boolean> {
		if (this.user == null) return false;
		this.subscriber.on('callsRoomsStream', this.onEvent);
		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['callsRooms']['payload']) {
		try {
			const room = await this.callsRoomService.getRoom(data.body.roomId);
			await this.callsRoomService.assertCanAccess(this.user!, room);
			this.send(data.type, {
				action: data.type === 'created' ? 'created' : data.body.action,
				room: await this.callsEntityService.packRoom(room),
			});
		} catch {
			// Private rooms are filtered per subscriber.
		}
	}

	@bindThis
	public dispose() { this.subscriber.off('callsRoomsStream', this.onEvent); }
}
