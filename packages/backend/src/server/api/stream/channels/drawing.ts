/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { DrawingService } from '@/core/drawing/DrawingService.js';
import type { JsonObject } from '@/misc/json-value.js';
import Channel, { type ChannelRequest } from '../channel.js';

@Injectable({ scope: Scope.TRANSIENT })
export class DrawingChannel extends Channel {
	public readonly chName = 'drawing';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:calls';
	private roomId: string;

	constructor(@Inject(REQUEST) request: ChannelRequest, private drawingService: DrawingService) { super(request); }

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (typeof params.roomId !== 'string' || this.user == null) return false;
		this.roomId = params.roomId;
		try { await this.drawingService.assertAccess(this.user, this.roomId); } catch { return false; }
		this.subscriber.on(`drawingStream:${this.roomId}`, this.onEvent);
		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['drawing']['payload']) {
		try { await this.drawingService.assertAccess(this.user!, this.roomId); } catch {
			this.send('revoked', null);
			this.dispose();
			return;
		}
		this.send(data.type, data.body);
	}

	@bindThis
	public dispose() { this.subscriber.off(`drawingStream:${this.roomId}`, this.onEvent); }
}
