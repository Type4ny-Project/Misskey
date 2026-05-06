/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, MoreThanOrEqual, LessThanOrEqual, And } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { EventsRepository, ChannelsRepository } from '@/models/_.js';
import type { MiEvent } from '@/models/Event.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import { ChannelService } from '@/core/ChannelService.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';

@Injectable()
export class EventService {
	public static NoSuchEventError = class extends Error {};
	public static NoSuchChannelError = class extends Error {};
	public static AccessDeniedError = class extends Error {};
	public static TooManyEventsError = class extends Error {};

	constructor(
		@Inject(DI.eventsRepository)
		private eventsRepository: EventsRepository,

		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		private channelService: ChannelService,
		private idService: IdService,
		private roleService: RoleService,
	) {
	}

	@bindThis
	public async canManageEvent(
		event: MiEvent,
		me: Pick<MiUser, 'id'> | null,
	): Promise<boolean> {
		if (me == null) {
			return false;
		}

		const isModerator = await this.roleService.isModerator(me);

		if (event.channelId == null) {
			return isModerator;
		}

		const channel = await this.channelsRepository.findOneBy({ id: event.channelId });
		if (channel == null) {
			return isModerator;
		}

		return await this.channelService.canEditChannel(channel, me, isModerator);
	}

	@bindThis
	public async canViewEvent(
		event: MiEvent,
		me: Pick<MiUser, 'id'> | null,
	): Promise<boolean> {
		if (event.status === 'approved') {
			return true;
		}

		if (me == null) {
			return false;
		}

		if (event.createdById === me.id) {
			return true;
		}

		return await this.canManageEvent(event, me);
	}

	@bindThis
	public async create(params: {
		user: MiLocalUser;
		title: string;
		startAt: Date;
		endAt?: Date | null;
		description?: string | null;
		url?: string | null;
		color?: string | null;
		tags?: string[];
		channelId?: string | null;
	}): Promise<MiEvent> {
		// Rate limit: count user's events created today
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const todayCount = await this.eventsRepository.countBy({
			createdById: params.user.id,
			createdAt: MoreThanOrEqual(todayStart),
		});
		if (todayCount >= 5) {
			throw new EventService.TooManyEventsError();
		}

		// Validate channel if provided
		if (params.channelId) {
			const channel = await this.channelsRepository.findOneBy({ id: params.channelId });
			if (!channel) {
				throw new EventService.NoSuchChannelError();
			}
		}

		const event = await this.eventsRepository.insertOne({
			id: this.idService.gen(),
			title: params.title,
			startAt: params.startAt,
			endAt: params.endAt ?? null,
			description: params.description ?? null,
			url: params.url ?? null,
			color: params.color ?? null,
			tags: params.tags ?? [],
			createdById: params.user.id,
			status: 'pending',
			channelId: params.channelId ?? null,
			createdAt: now,
			updatedAt: now,
		});

		return event;
	}

	@bindThis
	public async update(me: MiLocalUser, eventId: MiEvent['id'], params: {
		title?: string;
		startAt?: Date;
		endAt?: Date | null;
		description?: string | null;
		url?: string | null;
		color?: string | null;
		tags?: string[];
		channelId?: string | null;
	}): Promise<MiEvent> {
		const event = await this.eventsRepository.findOneBy({ id: eventId });
		if (!event) {
			throw new EventService.NoSuchEventError();
		}

		// Only the creator or a moderator can update
		const isModerator = await this.roleService.isModerator(me);
		if (event.createdById !== me.id && !isModerator) {
			throw new EventService.AccessDeniedError();
		}

		// Validate channel if provided
		if (params.channelId !== undefined && params.channelId !== null) {
			const channel = await this.channelsRepository.findOneBy({ id: params.channelId });
			if (!channel) {
				throw new EventService.NoSuchChannelError();
			}
		}

		const set: Partial<MiEvent> = {
			updatedAt: new Date(),
		};

		if (params.title !== undefined) set.title = params.title;
		if (params.startAt !== undefined) set.startAt = params.startAt;
		if (params.endAt !== undefined) set.endAt = params.endAt;
		if (params.description !== undefined) set.description = params.description;
		if (params.url !== undefined) set.url = params.url;
		if (params.color !== undefined) set.color = params.color;
		if (params.tags !== undefined) set.tags = params.tags;
		if (params.channelId !== undefined) set.channelId = params.channelId;

		// If a non-moderator edits, reset status to pending
		if (!isModerator) {
			set.status = 'pending';
			set.approvedById = null;
		}

		await this.eventsRepository.update(eventId, set);
		return await this.eventsRepository.findOneByOrFail({ id: eventId });
	}

	@bindThis
	public async delete(me: MiLocalUser, eventId: MiEvent['id']): Promise<void> {
		const event = await this.eventsRepository.findOneBy({ id: eventId });
		if (!event) {
			throw new EventService.NoSuchEventError();
		}

		const isModerator = await this.roleService.isModerator(me);
		if (event.createdById !== me.id && !isModerator) {
			throw new EventService.AccessDeniedError();
		}

		await this.eventsRepository.delete(eventId);
	}

	@bindThis
	public async approve(me: MiLocalUser, eventId: MiEvent['id']): Promise<MiEvent> {
		const event = await this.eventsRepository.findOneBy({ id: eventId });
		if (!event) {
			throw new EventService.NoSuchEventError();
		}

		if (!(await this.canManageEvent(event, me))) {
			throw new EventService.AccessDeniedError();
		}

		await this.eventsRepository.update(eventId, {
			status: 'approved',
			approvedById: me.id,
			updatedAt: new Date(),
		});

		return await this.eventsRepository.findOneByOrFail({ id: eventId });
	}

	@bindThis
	public async reject(me: MiLocalUser, eventId: MiEvent['id']): Promise<MiEvent> {
		const event = await this.eventsRepository.findOneBy({ id: eventId });
		if (!event) {
			throw new EventService.NoSuchEventError();
		}

		if (!(await this.canManageEvent(event, me))) {
			throw new EventService.AccessDeniedError();
		}

		await this.eventsRepository.update(eventId, {
			status: 'rejected',
			approvedById: me.id,
			updatedAt: new Date(),
		});

		return await this.eventsRepository.findOneByOrFail({ id: eventId });
	}
}
