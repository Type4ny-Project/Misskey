/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import {
	CLOUDFLARE_REALTIME_API_BASE_URL,
	cloudflareRealtimeEndpoints,
	mapCloudflareRealtimeError,
	type CloudflareRealtimeNewSessionResponse,
	type CloudflareRealtimeProviderError,
	type CloudflareRealtimeSessionDescription,
	type CloudflareRealtimeSessionStateResponse,
	type CloudflareRealtimeTrack,
	type CloudflareRealtimeTracksResponse,
} from './CloudflareRealtimeProviderContract.js';

export class CloudflareRealtimeClientError extends Error {
	constructor(public readonly detail: CloudflareRealtimeProviderError) {
		super(`Cloudflare Realtime request failed (${detail.kind}, HTTP ${detail.status})`);
	}
}

export class CloudflareRealtimeNotConfiguredError extends Error {}

@Injectable()
export class CloudflareRealtimeClient {
	private static readonly timeoutMs = 10_000;

	constructor(
		@Inject(DI.config)
		private config: Config,
	) {}

	public async createSession(sessionDescription?: CloudflareRealtimeSessionDescription): Promise<CloudflareRealtimeNewSessionResponse> {
		return this.request('POST', cloudflareRealtimeEndpoints.createSession, sessionDescription == null ? {} : { sessionDescription });
	}

	public async getSession(sessionId: string): Promise<CloudflareRealtimeSessionStateResponse> {
		return this.request('GET', this.path(cloudflareRealtimeEndpoints.getSession, sessionId));
	}

	public async addTracks(sessionId: string, tracks: CloudflareRealtimeTrack[], sessionDescription?: CloudflareRealtimeSessionDescription): Promise<CloudflareRealtimeTracksResponse> {
		return this.request('POST', this.path(cloudflareRealtimeEndpoints.addTracks, sessionId), { tracks, sessionDescription });
	}

	public async updateTracks(sessionId: string, tracks: CloudflareRealtimeTrack[], sessionDescription?: CloudflareRealtimeSessionDescription): Promise<CloudflareRealtimeTracksResponse> {
		return this.request('PUT', this.path(cloudflareRealtimeEndpoints.updateTracks, sessionId), { tracks, sessionDescription });
	}

	public async closeTracks(sessionId: string, tracks: Array<Pick<CloudflareRealtimeTrack, 'mid'>>, force = false, sessionDescription?: CloudflareRealtimeSessionDescription): Promise<CloudflareRealtimeTracksResponse> {
		return this.request('PUT', this.path(cloudflareRealtimeEndpoints.closeTracks, sessionId), { tracks, force, sessionDescription });
	}

	public async renegotiate(sessionId: string, sessionDescription: CloudflareRealtimeSessionDescription): Promise<CloudflareRealtimeTracksResponse> {
		return this.request('PUT', this.path(cloudflareRealtimeEndpoints.renegotiateSession, sessionId), { sessionDescription });
	}

	private path(template: string, sessionId: string): string {
		return template.replace('{sessionId}', encodeURIComponent(sessionId));
	}

	private async request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
		const provider = this.config.cloudflareRealtime;
		if (provider == null) throw new CloudflareRealtimeNotConfiguredError();
		const url = `${CLOUDFLARE_REALTIME_API_BASE_URL}${path.replace('{appId}', encodeURIComponent(provider.appId))}`;
		let response: Response;
		try {
			response = await fetch(url, {
				method,
				headers: {
					Authorization: `Bearer ${provider.appSecret}`,
					'Content-Type': 'application/json',
				},
				body: body == null || method === 'GET' ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(CloudflareRealtimeClient.timeoutMs),
			});
		} catch (error) {
			throw new CloudflareRealtimeClientError({
				kind: 'provider-unavailable',
				status: 0,
				providerDescription: error instanceof Error ? error.name : 'network error',
				retryable: true,
			});
		}

		const responseBody = await this.readJson(response);
		if (!response.ok) {
			throw new CloudflareRealtimeClientError(mapCloudflareRealtimeError(response.status, responseBody));
		}
		return responseBody as T;
	}

	private async readJson(response: Response): Promise<CloudflareRealtimeTracksResponse> {
		try {
			return await response.json() as CloudflareRealtimeTracksResponse;
		} catch {
			if (!response.ok) return {};
			throw new CloudflareRealtimeClientError({ kind: 'provider-error', status: response.status, retryable: false });
		}
	}
}
