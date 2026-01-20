/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { EmojiRequestsRepository, EmojisRepository } from '@/models/_.js';
import type { MiEmojiRequest } from '@/models/EmojiRequest.js';
import type { MiUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class EmojiRequestService {
	constructor(
		@Inject(DI.emojiRequestsRepository)
		private emojiRequestsRepository: EmojiRequestsRepository,

		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,

		private idService: IdService,
	) {
	}

	@bindThis
	public async create(
		user: MiUser,
		data: {
			name: string;
			category: string | null;
			originalUrl: string;
			aliases: string[];
			license: string | null;
			comment: string;
		},
	): Promise<MiEmojiRequest> {
		const emojiRequest = await this.emojiRequestsRepository.insertOne({
			id: this.idService.gen(),
			userId: user.id,
			name: data.name,
			category: data.category,
			originalUrl: data.originalUrl,
			publicUrl: data.originalUrl,
			aliases: data.aliases,
			license: data.license,
			comment: data.comment,
			status: 'pending',
		});

		return emojiRequest;
	}

	@bindThis
	public async list(
		params: {
			userId?: MiUser['id'];
			status?: string;
			limit?: number;
			sinceId?: string;
			untilId?: string;
		},
	): Promise<MiEmojiRequest[]> {
		const query = this.emojiRequestsRepository.createQueryBuilder('emoji_request');

		if (params.userId) {
			query.andWhere('emoji_request.userId = :userId', { userId: params.userId });
		}

		if (params.status) {
			query.andWhere('emoji_request.status = :status', { status: params.status });
		}

		query.orderBy('emoji_request.createdAt', 'DESC');

		if (params.sinceId) {
			query.andWhere('emoji_request.id > :sinceId', { sinceId: params.sinceId });
		}

		if (params.untilId) {
			query.andWhere('emoji_request.id < :untilId', { untilId: params.untilId });
		}

		if (params.limit) {
			query.take(params.limit);
		}

		return query.getMany();
	}

	@bindThis
	public async approve(
		emojiRequest: MiEmojiRequest,
	): Promise<void> {
		await this.emojiRequestsRepository.update(emojiRequest.id, {
			status: 'approved',
			updatedAt: new Date(),
		});
	}

	@bindThis
	public async reject(
		emojiRequest: MiEmojiRequest,
		reason: string,
	): Promise<void> {
		await this.emojiRequestsRepository.update(emojiRequest.id, {
			status: 'rejected',
			rejectionReason: reason,
			updatedAt: new Date(),
		});
	}

	@bindThis
	public async findById(
		id: MiEmojiRequest['id'],
	): Promise<MiEmojiRequest | null> {
		return this.emojiRequestsRepository.findOneBy({ id });
	}

	@bindThis
	public async countPending(): Promise<number> {
		return this.emojiRequestsRepository.countBy({ status: 'pending' });
	}
}
