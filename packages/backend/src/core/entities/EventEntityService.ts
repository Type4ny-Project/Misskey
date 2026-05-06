/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { EventsRepository, ChannelsRepository, MiUser } from '@/models/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiEvent } from '@/models/Event.js';
import { bindThis } from '@/decorators.js';
import { UserEntityService } from './UserEntityService.js';

@Injectable()
export class EventEntityService {
	constructor(
		@Inject(DI.eventsRepository)
		private eventsRepository: EventsRepository,

		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		private userEntityService: UserEntityService,
	) {
	}

	@bindThis
	public async pack(
		src: MiEvent['id'] | MiEvent,
		me?: { id: MiUser['id'] } | null | undefined,
	): Promise<Packed<'Event'>> {
		const event = typeof src === 'object' ? src : await this.eventsRepository.findOneByOrFail({ id: src });

		let channel: { id: string; name: string; color: string } | null = null;
		if (event.channelId) {
			const ch = event.channel ?? await this.channelsRepository.findOneBy({ id: event.channelId });
			if (ch) {
				channel = { id: ch.id, name: ch.name, color: ch.color };
			}
		}

		return await awaitAll({
			id: event.id,
			title: event.title,
			startAt: event.startAt.toISOString(),
			endAt: event.endAt ? event.endAt.toISOString() : null,
			description: event.description,
			url: event.url,
			tags: event.tags,
			createdById: event.createdById,
			createdBy: this.userEntityService.pack(event.createdBy ?? event.createdById, me),
			status: event.status,
			approvedById: event.approvedById,
			approvedBy: event.approvedById
				? this.userEntityService.pack(event.approvedBy ?? event.approvedById, me)
				: null,
			channelId: event.channelId,
			channel: channel,
			createdAt: event.createdAt.toISOString(),
			updatedAt: event.updatedAt.toISOString(),
		});
	}

	@bindThis
	public async packMany(
		events: MiEvent[],
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		return Promise.all(events.map(event => this.pack(event, me)));
	}
}
