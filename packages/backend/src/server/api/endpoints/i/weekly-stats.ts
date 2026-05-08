/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NoteReactionsRepository, NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';

type ReactionRanking = {
	reaction: string;
	count: number;
};

type TopPostedChannel = {
	id: string;
	name: string;
	notesCount: number;
};

export const meta = {
	tags: ['account', 'notes', 'reactions'],

	requireCredential: true,

	kind: 'read:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			sinceDate: {
				type: 'string',
				optional: false, nullable: false,
				format: 'date-time',
			},
			periodEndDate: {
				type: 'string',
				optional: false, nullable: false,
				format: 'date-time',
			},
			notesCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			reactionsCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			receivedReactionsCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			postingDaysCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			topReactions: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						reaction: {
							type: 'string',
							optional: false, nullable: false,
						},
						count: {
							type: 'number',
							optional: false, nullable: false,
						},
					},
				},
			},
			topReceivedReactions: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						reaction: {
							type: 'string',
							optional: false, nullable: false,
						},
						count: {
							type: 'number',
							optional: false, nullable: false,
						},
					},
				},
			},
			topPostedChannel: {
				type: 'object',
				optional: false, nullable: true,
				properties: {
					id: {
						type: 'string',
						optional: false, nullable: false,
					},
					name: {
						type: 'string',
						optional: false, nullable: false,
					},
					notesCount: {
						type: 'number',
						optional: false, nullable: false,
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.noteReactionsRepository)
		private noteReactionsRepository: NoteReactionsRepository,

		private idService: IdService,
	) {
		super(meta, paramDef, async (_ps, me) => {
			const sinceDate = getStartOfWeek();
			const periodEndDate = getPeriodEnd(sinceDate);
			const sinceId = this.idService.gen(sinceDate.getTime());

			const notesCountPromise = this.notesRepository.createQueryBuilder('note')
				.where('note.userId = :userId', { userId: me.id })
				.andWhere('note.id > :sinceId', { sinceId })
				.getCount();

			const reactionsCountPromise = this.noteReactionsRepository.createQueryBuilder('reaction')
				.where('reaction.userId = :userId', { userId: me.id })
				.andWhere('reaction.id > :sinceId', { sinceId })
				.getCount();

			const receivedReactionsCountPromise = this.noteReactionsRepository.createQueryBuilder('reaction')
				.innerJoin('reaction.note', 'note')
				.where('note.userId = :userId', { userId: me.id })
				.andWhere('reaction.id > :sinceId', { sinceId })
				.getCount();

			const noteIdsPromise = this.notesRepository.createQueryBuilder('note')
				.select('note.id', 'id')
				.where('note.userId = :userId', { userId: me.id })
				.andWhere('note.id > :sinceId', { sinceId })
				.getRawMany<{ id: string }>();

			const topPostedChannelPromise = this.notesRepository.createQueryBuilder('note')
				.select('note.channelId', 'channelId')
				.addSelect('channel.name', 'channelName')
				.addSelect('COUNT(*)', 'count')
				.innerJoin('note.channel', 'channel')
				.where('note.userId = :userId', { userId: me.id })
				.andWhere('note.id > :sinceId', { sinceId })
				.andWhere('note.channelId IS NOT NULL')
				.groupBy('note.channelId')
				.addGroupBy('channel.name')
				.orderBy('COUNT(*)', 'DESC')
				.addOrderBy('channel.name', 'ASC')
				.addOrderBy('note.channelId', 'ASC')
				.limit(1)
				.getRawOne<{ channelId: string; channelName: string; count: string }>();

			const topReactionsPromise = this.noteReactionsRepository.createQueryBuilder('reaction')
				.select('reaction.reaction', 'reaction')
				.addSelect('COUNT(*)', 'count')
				.where('reaction.userId = :userId', { userId: me.id })
				.andWhere('reaction.id > :sinceId', { sinceId })
				.groupBy('reaction.reaction')
				.orderBy('COUNT(*)', 'DESC')
				.addOrderBy('reaction.reaction', 'ASC')
				.limit(3)
				.getRawMany<{ reaction: string; count: string }>();

			const topReceivedReactionsPromise = this.noteReactionsRepository.createQueryBuilder('reaction')
				.select('reaction.reaction', 'reaction')
				.addSelect('COUNT(*)', 'count')
				.innerJoin('reaction.note', 'note')
				.where('note.userId = :userId', { userId: me.id })
				.andWhere('reaction.id > :sinceId', { sinceId })
				.groupBy('reaction.reaction')
				.orderBy('COUNT(*)', 'DESC')
				.addOrderBy('reaction.reaction', 'ASC')
				.limit(3)
				.getRawMany<{ reaction: string; count: string }>();

			const [
				notesCount,
				reactionsCount,
				receivedReactionsCount,
				noteIds,
				topPostedChannel,
				topReactions,
				topReceivedReactions,
			] = await Promise.all([
				notesCountPromise,
				reactionsCountPromise,
				receivedReactionsCountPromise,
				noteIdsPromise,
				topPostedChannelPromise,
				topReactionsPromise,
				topReceivedReactionsPromise,
			]);

			const postingDays = new Set(noteIds.map(item => formatDateKey(this.idService.parse(item.id).date)));

			return {
				sinceDate: sinceDate.toISOString(),
				periodEndDate: periodEndDate.toISOString(),
				notesCount,
				reactionsCount,
				receivedReactionsCount,
				postingDaysCount: postingDays.size,
				topReactions: toReactionRanking(topReactions),
				topReceivedReactions: toReactionRanking(topReceivedReactions),
				topPostedChannel: toTopPostedChannel(topPostedChannel),
			};
		});
	}
}

function getStartOfWeek(): Date {
	const date = new Date();
	const daysSinceMonday = (date.getDay() + 6) % 7;
	date.setHours(0, 0, 0, 0);
	date.setDate(date.getDate() - daysSinceMonday);
	return date;
}

function getPeriodEnd(sinceDate: Date): Date {
	const date = new Date(sinceDate);
	date.setDate(date.getDate() + 7);
	return date;
}

function toReactionRanking(items: { reaction: string; count: string }[]): ReactionRanking[] {
	return items.map(item => ({
		reaction: item.reaction,
		count: parseRawCount(item.count),
	}));
}

function parseRawCount(value: string | undefined): number {
	return value == null ? 0 : parseInt(value, 10);
}

function toTopPostedChannel(raw: { channelId: string; channelName: string; count: string } | undefined): TopPostedChannel | null {
	if (raw == null) return null;

	return {
		id: raw.channelId,
		name: raw.channelName,
		notesCount: parseRawCount(raw.count),
	};
}

function formatDateKey(date: Date): string {
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
