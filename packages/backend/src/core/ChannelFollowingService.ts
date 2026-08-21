/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import type { DataSource, EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { ChannelFollowingsRepository, ChannelFollowRequestsRepository, ChannelsRepository, MiUser } from '@/models/_.js';
import { MiChannel } from '@/models/_.js';
import { MiChannelFollowing } from '@/models/ChannelFollowing.js';
import { MiChannelFollowRequest } from '@/models/ChannelFollowRequest.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEvents, GlobalEventService } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';
import type { MiLocalUser } from '@/models/User.js';
import { RedisKVCache } from '@/misc/cache.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

@Injectable()
export class ChannelFollowingService implements OnModuleInit {
	public userFollowingChannelsCache: RedisKVCache<Set<string>>;

	constructor(
		@Inject(DI.db)
		private db: DataSource,
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,
		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,
		@Inject(DI.channelFollowingsRepository)
		private channelFollowingsRepository: ChannelFollowingsRepository,
		@Inject(DI.channelFollowRequestsRepository)
		private channelFollowRequestsRepository: ChannelFollowRequestsRepository,
		private idService: IdService,
		private globalEventService: GlobalEventService,
	) {
		this.userFollowingChannelsCache = new RedisKVCache<Set<string>>(this.redisClient, 'userFollowingChannels', {
			lifetime: 1000 * 60 * 30, // 30m
			memoryCacheLifetime: 1000 * 60, // 1m
			fetcher: (key) => this.channelFollowingsRepository.find({
				where: { followerId: key },
				select: { followeeId: true },
			}).then(xs => new Set(xs.map(x => x.followeeId))),
			toRedisConverter: (value) => JSON.stringify(Array.from(value)),
			fromRedisConverter: (value) => new Set(JSON.parse(value)),
		});

		this.redisForSub.on('message', this.onMessage);
	}

	onModuleInit() {
	}

	/**
	 * フォローしているチャンネルの一覧を取得する.
	 * @param params
	 * @param [opts]
	 * @param	{(boolean|undefined)} [opts.idOnly=false] チャンネルIDのみを取得するかどうか. ID以外のフィールドに値がセットされなくなり、他テーブルとのJOINも一切されなくなるので注意.
	 * @param {(boolean|undefined)} [opts.joinUser=undefined] チャンネルオーナーのユーザ情報をJOINするかどうか(falseまたは省略時はJOINしない).
	 * @param {(boolean|undefined)} [opts.joinBannerFile=undefined] バナー画像のドライブファイルをJOINするかどうか(falseまたは省略時はJOINしない).
	 */
	@bindThis
	public async list(
		params: {
			requestUserId: MiUser['id'],
		},
		opts?: {
			idOnly?: boolean;
			joinUser?: boolean;
			joinBannerFile?: boolean;
		},
	): Promise<MiChannel[]> {
		if (opts?.idOnly) {
			const q = this.channelFollowingsRepository.createQueryBuilder('channel_following')
				.select('channel_following.followeeId')
				.where('channel_following.followerId = :userId', { userId: params.requestUserId });

			return q
				.getRawMany<{ channel_following_followeeId: string }>()
				.then(xs => xs.map(x => ({ id: x.channel_following_followeeId } as MiChannel)));
		} else {
			const q = this.channelsRepository.createQueryBuilder('channel')
				.innerJoin('channel_following', 'channel_following', 'channel_following.followeeId = channel.id')
				.where('channel_following.followerId = :userId', { userId: params.requestUserId });

			if (opts?.joinUser) {
				q.innerJoinAndSelect('channel.user', 'user');
			}

			if (opts?.joinBannerFile) {
				q.leftJoinAndSelect('channel.banner', 'drive_file');
			}

			return q.getMany();
		}
	}

	@bindThis
	public async follow(
		requestUser: Pick<MiUser, 'id'>,
		targetChannel: MiChannel,
	): Promise<void> {
		await this.db.transaction(async manager => {
			await this.lockChannel(manager, targetChannel.id);
			const inserted = await this.insertFollowing(manager, requestUser.id, targetChannel.id);
			if (!inserted) {
				throw new IdentifiableError('6e335e39-0203-4418-a936-b3f2dc987845', 'already following');
			}
			await manager.getRepository(MiChannelFollowRequest).delete({
				followerId: requestUser.id,
				channelId: targetChannel.id,
			});
		});

		this.globalEventService.publishInternalEvent('followChannel', {
			userId: requestUser.id,
			channelId: targetChannel.id,
		});
	}

	@bindThis
	public async followOrRequest(
		requestUser: MiLocalUser,
		targetChannel: MiChannel,
		bypassApproval: boolean,
	): Promise<'following' | 'pending' | 'alreadyFollowing'> {
		let followed = false;
		const state = await this.db.transaction(async manager => {
			const channel = await this.lockChannel(manager, targetChannel.id);
			const isFollowing = await manager.getRepository(MiChannelFollowing).exists({
				where: {
					followerId: requestUser.id,
					followeeId: channel.id,
				},
			});
			if (isFollowing) return 'alreadyFollowing' as const;

			if (!channel.isFollowApprovalRequired || bypassApproval) {
				const inserted = await this.insertFollowing(manager, requestUser.id, channel.id);
				if (!inserted) return 'alreadyFollowing' as const;
				await manager.getRepository(MiChannelFollowRequest).delete({
					followerId: requestUser.id,
					channelId: channel.id,
				});
				followed = true;
				return 'following' as const;
			}

			await manager.getRepository(MiChannelFollowRequest).createQueryBuilder()
				.insert()
				.values({
					id: this.idService.gen(),
					followerId: requestUser.id,
					channelId: channel.id,
				})
				.orIgnore()
				.execute();

			return 'pending' as const;
		});

		if (followed) this.publishFollowEvent(requestUser.id, targetChannel.id);
		return state;
	}

	@bindThis
	public async unfollow(
		requestUser: Pick<MiUser, 'id'>,
		targetChannel: MiChannel,
	): Promise<void> {
		await this.db.transaction(async manager => {
			await this.lockChannel(manager, targetChannel.id);
			const deleteResult = await manager.getRepository(MiChannelFollowing).delete({
				followerId: requestUser.id,
				followeeId: targetChannel.id,
			});
			if ((deleteResult.affected ?? 0) > 0) {
				await this.decrementFollowersCount(manager, targetChannel.id);
			}
			await manager.getRepository(MiChannelFollowRequest).delete({
				followerId: requestUser.id,
				channelId: targetChannel.id,
			});
		});

		this.globalEventService.publishInternalEvent('unfollowChannel', {
			userId: requestUser.id,
			channelId: targetChannel.id,
		});
	}

	@bindThis
	public async unfollowAll(requestUser: Pick<MiUser, 'id'>): Promise<void> {
		const followings = await this.channelFollowingsRepository.find({
			where: { followerId: requestUser.id },
			select: { followeeId: true },
		});

		for (const following of followings) {
			const channel = await this.channelsRepository.findOneBy({ id: following.followeeId });
			if (channel != null) await this.unfollow(requestUser, channel);
		}
	}

	@bindThis
	public async approveRequest(
		follower: Pick<MiUser, 'id'>,
		targetChannel: MiChannel,
	): Promise<boolean> {
		let approved = false;
		await this.db.transaction(async manager => {
			await this.lockChannel(manager, targetChannel.id);
			const requestDeleteResult = await manager.getRepository(MiChannelFollowRequest).delete({
				followerId: follower.id,
				channelId: targetChannel.id,
			});
			if ((requestDeleteResult.affected ?? 0) === 0) return;

			await this.insertFollowing(manager, follower.id, targetChannel.id);
			approved = true;
		});

		if (approved) {
			this.globalEventService.publishInternalEvent('followChannel', {
				userId: follower.id,
				channelId: targetChannel.id,
			});
		}
		return approved;
	}

	@bindThis
	public async rejectRequest(
		follower: Pick<MiUser, 'id'>,
		targetChannel: MiChannel,
	): Promise<boolean> {
		return await this.db.transaction(async manager => {
			await this.lockChannel(manager, targetChannel.id);
			const result = await manager.getRepository(MiChannelFollowRequest).delete({
				followerId: follower.id,
				channelId: targetChannel.id,
			});
			return (result.affected ?? 0) > 0;
		});
	}

	@bindThis
	public async setFollowApprovalRequired(
		targetChannel: MiChannel,
		required: boolean,
	): Promise<void> {
		const approvedFollowerIds: MiUser['id'][] = [];
		await this.db.transaction(async manager => {
			await this.lockChannel(manager, targetChannel.id);

			if (!required) {
				const requests = await manager.getRepository(MiChannelFollowRequest).find({
					where: { channelId: targetChannel.id },
					select: { followerId: true },
				});
				await manager.getRepository(MiChannelFollowRequest).delete({ channelId: targetChannel.id });
				for (const request of requests) {
					if (await this.insertFollowing(manager, request.followerId, targetChannel.id)) {
						approvedFollowerIds.push(request.followerId);
					}
				}
			}

			await manager.getRepository(MiChannel).update(targetChannel.id, {
				isFollowApprovalRequired: required,
			});
		});

		for (const followerId of approvedFollowerIds) {
			this.publishFollowEvent(followerId, targetChannel.id);
		}
	}

	private async lockChannel(manager: EntityManager, channelId: MiChannel['id']): Promise<MiChannel> {
		return await manager.getRepository(MiChannel).findOneOrFail({
			where: { id: channelId },
			lock: { mode: 'pessimistic_write' },
		});
	}

	private async insertFollowing(
		manager: EntityManager,
		followerId: MiUser['id'],
		channelId: MiChannel['id'],
	): Promise<boolean> {
		const result = await manager.getRepository(MiChannelFollowing).createQueryBuilder()
			.insert()
			.values({
				id: this.idService.gen(),
				followerId,
				followeeId: channelId,
			})
			.orIgnore()
			.returning('id')
			.execute();
		const inserted = Array.isArray(result.raw) && result.raw.length > 0;
		if (inserted) {
			await manager.getRepository(MiChannel).increment({ id: channelId }, 'followersCount', 1);
		}
		return inserted;
	}

	private async decrementFollowersCount(manager: EntityManager, channelId: MiChannel['id']): Promise<void> {
		await manager.getRepository(MiChannel).createQueryBuilder()
			.update()
			.set({ followersCount: () => 'GREATEST("followersCount" - 1, 0)' })
			.where('id = :channelId', { channelId })
			.execute();
	}

	private publishFollowEvent(userId: MiUser['id'], channelId: MiChannel['id']): void {
		this.globalEventService.publishInternalEvent('followChannel', { userId, channelId });
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'followChannel': {
					this.userFollowingChannelsCache.refresh(body.userId);
					break;
				}
				case 'unfollowChannel': {
					this.userFollowingChannelsCache.delete(body.userId);
					break;
				}
			}
		}
	}

	@bindThis
	public dispose(): void {
		this.userFollowingChannelsCache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
