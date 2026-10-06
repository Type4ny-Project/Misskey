/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { once } from 'node:events';
import { createServer, connect } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Redis } from 'ioredis';
import { GlobalModule } from '@/GlobalModule.js';
import { DI } from '@/di-symbols.js';
import { loadConfig } from '@/config.js';
import type { FactoryProvider } from '@nestjs/common';
import type { Server, Socket, AddressInfo } from 'node:net';

describe('Redis subscription recovery', () => {
	const config = loadConfig();
	const providers = Reflect.getMetadata('providers', GlobalModule) as FactoryProvider[];
	const provider = providers.find(p => p.provide === DI.redisForSub)!;
	let publisher: Redis;
	let subscriber: Redis;
	let proxy: Server;
	let port: number;
	let channel: string;
	let reconnects: number;
	const sockets = new Set<Socket>();

	async function startProxy() {
		proxy.listen(port, '127.0.0.1');
		await once(proxy, 'listening');
	}

	async function stopProxy() {
		const closed = once(proxy, 'close');
		proxy.close();
		for (const socket of sockets) socket.destroy();
		await closed;
	}

	async function receiveMessage() {
		const message = once(subscriber, 'message');
		await vi.waitFor(async () => {
			expect(await publisher.publish(channel, 'recovered')).toBe(1);
		});
		expect(await message).toEqual([channel, 'recovered']);
	}

	beforeEach(async () => {
		publisher = new Redis(config.redisForPubsub);
		await once(publisher, 'ready');
		channel = `subscription-recovery:${randomUUID()}`;
		proxy = createServer(client => {
			const upstream = connect(config.redisForPubsub.port, config.redisForPubsub.host);
			for (const socket of [client, upstream]) {
				sockets.add(socket);
				socket.on('close', () => sockets.delete(socket));
			}
			client.pipe(upstream).pipe(client);
			client.on('close', () => upstream.destroy());
			upstream.on('error', () => client.destroy());
		});
		port = 0;
		await startProxy();
		port = (proxy.address() as AddressInfo).port;
		await stopProxy();
		reconnects = 0;
	});

	function createSubscriber() {
		subscriber = provider.useFactory({
			...config,
			host: channel,
			redisForPubsub: {
				...config.redisForPubsub,
				host: '127.0.0.1',
				port,
				maxRetriesPerRequest: 1,
				retryStrategy: () => 20,
			},
		});
		subscriber.on('error', () => {}); // Expected while the isolated proxy is offline.
		subscriber.on('reconnecting', () => reconnects++);
	}

	afterEach(async () => {
		subscriber?.disconnect();
		publisher?.disconnect();
		if (proxy?.listening) await stopProxy();
		for (const socket of sockets) socket.destroy();
	});

	test('subscribes after initial connection failures exceed the request retry limit', async () => {
		createSubscriber();
		await vi.waitFor(() => expect(reconnects).toBeGreaterThanOrEqual(3));
		await startProxy();
		await receiveMessage();
	});

	test('restores an established subscription after a connection outage', async () => {
		await startProxy();
		createSubscriber();
		await receiveMessage();
		await stopProxy();
		await vi.waitFor(() => expect(reconnects).toBeGreaterThanOrEqual(3));
		await startProxy();
		await receiveMessage();
	});
});
