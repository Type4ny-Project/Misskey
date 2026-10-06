/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';

export type CallsPublicationBinding = {
	id: string;
	roomId: string;
	participantId: string;
	connectionId: string;
	generation: number;
	applicationId: string;
	providerSessionId: string;
	providerTrackName: string;
	providerMid: string | null;
	mediaKind: 'audio' | 'video';
	mediaSource?: 'microphone' | 'camera' | 'screen';
	screenPublicationId?: string;
	createdAt: string;
};

export class CallsMediaBindingNotFoundError extends Error {}

export type CallsSubscriptionBinding = Pick<CallsPublicationBinding, 'providerSessionId' | 'providerMid'>;

@Injectable()
export class CallsMediaBindingService {
	private static readonly ttlSeconds = 120;

	constructor(
		@Inject(DI.redis)
		private redis: Redis.Redis,
		private idService: IdService,
	) {}

	public async createPublication(binding: Omit<CallsPublicationBinding, 'id' | 'createdAt'>): Promise<CallsPublicationBinding> {
		const publication: CallsPublicationBinding = { ...binding, id: this.idService.gen(), createdAt: new Date().toISOString() };
		const value = JSON.stringify(publication);
		const pipeline = this.redis.pipeline();
		pipeline.set(this.publicationKey(publication.id), value, 'EX', CallsMediaBindingService.ttlSeconds);
		pipeline.sadd(this.generationKey(publication.participantId, publication.generation), publication.id);
		pipeline.expire(this.generationKey(publication.participantId, publication.generation), CallsMediaBindingService.ttlSeconds);
		pipeline.sadd(this.roomKey(publication.roomId), publication.id);
		pipeline.expire(this.roomKey(publication.roomId), CallsMediaBindingService.ttlSeconds);
		await pipeline.exec();
		return publication;
	}

	public async getPublication(publicationId: string): Promise<CallsPublicationBinding> {
		const value = await this.redis.get(this.publicationKey(publicationId));
		if (value == null) throw new CallsMediaBindingNotFoundError();
		return JSON.parse(value) as CallsPublicationBinding;
	}

	public async heartbeat(roomId: string, participantId: string, generation: number): Promise<void> {
		await this.redis.expire(this.subscriptionKey(participantId, generation), CallsMediaBindingService.ttlSeconds);
		const key = this.generationKey(participantId, generation);
		const ids = await this.redis.smembers(key);
		if (ids.length === 0) return;
		const pipeline = this.redis.pipeline();
		for (const id of ids) pipeline.expire(this.publicationKey(id), CallsMediaBindingService.ttlSeconds);
		pipeline.expire(key, CallsMediaBindingService.ttlSeconds);
		pipeline.expire(this.roomKey(roomId), CallsMediaBindingService.ttlSeconds);
		await pipeline.exec();
	}

	public async listRoomPublications(roomId: string): Promise<CallsPublicationBinding[]> {
		const ids = await this.redis.smembers(this.roomKey(roomId));
		if (ids.length === 0) return [];
		const values = await this.redis.mget(ids.map(id => this.publicationKey(id)));
		return values.flatMap(value => value == null ? [] : [JSON.parse(value) as CallsPublicationBinding]);
	}

	public async removePublication(publicationId: string): Promise<void> {
		let binding: CallsPublicationBinding;
		try { binding = await this.getPublication(publicationId); } catch (error) {
			if (error instanceof CallsMediaBindingNotFoundError) return;
			throw error;
		}
		const pipeline = this.redis.pipeline();
		pipeline.del(this.publicationKey(publicationId));
		pipeline.srem(this.generationKey(binding.participantId, binding.generation), publicationId);
		pipeline.srem(this.roomKey(binding.roomId), publicationId);
		await pipeline.exec();
	}

	public async listGenerationPublications(participantId: string, generation: number): Promise<CallsPublicationBinding[]> {
		const ids = await this.redis.smembers(this.generationKey(participantId, generation));
		const bindings = await Promise.all(ids.map(async id => this.getPublication(id).catch(() => null)));
		return bindings.filter((binding): binding is CallsPublicationBinding => binding != null);
	}

	public async clearGeneration(participantId: string, generation: number): Promise<CallsPublicationBinding[]> {
		const key = this.generationKey(participantId, generation);
		const bindings = await this.listGenerationPublications(participantId, generation);
		const pipeline = this.redis.pipeline();
		for (const binding of bindings) {
			pipeline.del(this.publicationKey(binding.id));
			pipeline.srem(this.roomKey(binding.roomId), binding.id);
		}
		pipeline.del(key);
		await pipeline.exec();
		return bindings;
	}

	public async addSubscriptions(participantId: string, generation: number, providerSessionId: string, mids: string[]): Promise<void> {
		if (mids.length === 0) return;
		const key = this.subscriptionKey(participantId, generation);
		const pipeline = this.redis.pipeline();
		for (const providerMid of mids) pipeline.sadd(key, JSON.stringify({ providerSessionId, providerMid }));
		pipeline.expire(key, CallsMediaBindingService.ttlSeconds);
		await pipeline.exec();
	}

	public async clearSubscriptions(participantId: string, generation: number): Promise<CallsSubscriptionBinding[]> {
		const key = this.subscriptionKey(participantId, generation);
		const subscriptions = await this.listSubscriptions(participantId, generation);
		await this.redis.del(key);
		return subscriptions;
	}

	public async listSubscriptions(participantId: string, generation: number): Promise<CallsSubscriptionBinding[]> {
		return (await this.redis.smembers(this.subscriptionKey(participantId, generation))).map(value => JSON.parse(value) as CallsSubscriptionBinding);
	}

	private publicationKey(id: string): string { return `calls:publication:${id}`; }
	private generationKey(participantId: string, generation: number): string { return `calls:publications:${participantId}:${generation}`; }
	private roomKey(roomId: string): string { return `calls:room-publications:${roomId}`; }
	private subscriptionKey(participantId: string, generation: number): string { return `calls:subscriptions:${participantId}:${generation}`; }
}
