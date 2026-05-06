/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import type * as Redis from 'ioredis';

type ListenerMap = Map<string | symbol, Set<(...args: any[]) => void>>;

export class TenantRedisSubMultiplexer {
	private readonly emitter = new EventEmitter();
	private readonly listeners: ListenerMap = new Map();

	constructor(
		private readonly getCurrentClient: () => Redis.Redis,
		private readonly clients: Redis.Redis[],
	) {
		for (const client of clients) {
			client.on('message', (channel, message) => {
				this.emitter.emit('message', channel, message);
			});
		}
	}

	public on(event: string | symbol, listener: (...args: any[]) => void): this {
		this.emitter.on(event, listener);
		let set = this.listeners.get(event);
		if (set == null) {
			set = new Set();
			this.listeners.set(event, set);
		}
		set.add(listener);
		return this;
	}

	public off(event: string | symbol, listener: (...args: any[]) => void): this {
		this.emitter.off(event, listener);
		this.listeners.get(event)?.delete(listener);
		return this;
	}

	public async ping(): Promise<string> {
		return await this.getCurrentClient().ping();
	}
}
