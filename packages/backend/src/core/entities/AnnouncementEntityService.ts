/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { AnnouncementsRepository, AnnouncementReadsRepository, AnnouncementReactionsRepository, MiAnnouncement, MiUser } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';

@Injectable()
export class AnnouncementEntityService {
	constructor(
		@Inject(DI.announcementsRepository)
		private announcementsRepository: AnnouncementsRepository,

		@Inject(DI.announcementReadsRepository)
		private announcementReadsRepository: AnnouncementReadsRepository,

		@Inject(DI.announcementReactionsRepository)
		private announcementReactionsRepository: AnnouncementReactionsRepository,

		private idService: IdService,
	) {
	}

	@bindThis
	public async getReactions(announcementId: MiAnnouncement['id']): Promise<Record<string, number>> {
		const reactions: Record<string, number> = {};
		const counts = await this.announcementReactionsRepository.createQueryBuilder('reaction')
			.select('reaction.reaction', 'reaction')
			.addSelect('COUNT(*)', 'count')
			.where('reaction.announcementId = :announcementId', { announcementId })
			.groupBy('reaction.reaction')
			.getRawMany<{ reaction: string; count: string }>();
		for (const count of counts) reactions[count.reaction] = Number(count.count);
		return reactions;
	}

	@bindThis
	public async pack(
		src: MiAnnouncement['id'] | MiAnnouncement & { isRead?: boolean | null },
		me?: { id: MiUser['id'] } | null | undefined,
	): Promise<Packed<'Announcement'>> {
		const announcement = typeof src === 'object'
			? src
			: await this.announcementsRepository.findOneByOrFail({
				id: src,
			}) as MiAnnouncement & { isRead?: boolean | null };

		if (me && announcement.isRead === undefined) {
			announcement.isRead = await this.announcementReadsRepository
				.countBy({
					announcementId: announcement.id,
					userId: me.id,
				})
				.then((count: number) => count > 0);
		}

		const reactions: Record<string, number> = {};
		let myReaction: string | null = null;
		if (announcement.reactionsEnabled && (announcement.userId == null || announcement.userId === me?.id)) {
			Object.assign(reactions, await this.getReactions(announcement.id));
			if (me) {
				myReaction = (await this.announcementReactionsRepository.findOneBy({
					announcementId: announcement.id,
					userId: me.id,
				}))?.reaction ?? null;
			}
		}

		return {
			id: announcement.id,
			createdAt: this.idService.parse(announcement.id).date.toISOString(),
			updatedAt: announcement.updatedAt?.toISOString() ?? null,
			title: announcement.title,
			text: announcement.text,
			imageUrl: announcement.imageUrl,
			icon: announcement.icon,
			display: announcement.display,
			forYou: announcement.userId === me?.id,
			needConfirmationToRead: announcement.needConfirmationToRead,
			silence: announcement.silence,
			reactionsEnabled: announcement.reactionsEnabled,
			reactions,
			myReaction,
			isRead: announcement.isRead !== null ? announcement.isRead : undefined,
		};
	}

	@bindThis
	public async packMany(
		announcements: (MiAnnouncement['id'] | MiAnnouncement & { isRead?: boolean | null } | MiAnnouncement)[],
		me?: { id: MiUser['id'] } | null | undefined,
	) : Promise<Packed<'Announcement'>[]> {
		return (await Promise.allSettled(announcements.map(x => this.pack(x, me))))
			.filter(result => result.status === 'fulfilled')
			.map(result => (result as PromiseFulfilledResult<Packed<'Announcement'>>).value);
	}
}
