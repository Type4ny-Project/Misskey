/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const CLOUDFLARE_REALTIME_API_BASE_URL = 'https://rtc.live.cloudflare.com/v1';
export const CLOUDFLARE_REALTIME_OPENAPI_VERSION = '2024-05-21';
export const CLOUDFLARE_REALTIME_OPENAPI_URL = `https://developers.cloudflare.com/realtime/static/realtime-api-${CLOUDFLARE_REALTIME_OPENAPI_VERSION}.yaml`;

export const cloudflareRealtimeLimits = {
	apiCallsPerSessionPerSecond: 50,
	tracksPerApiCall: 64,
	tracksPerSession: null,
	trackInactivityTimeoutSeconds: 30,
	connectedStateWaitTimeoutSeconds: 5,
} as const;

export const cloudflareRealtimeEndpoints = {
	createSession: '/apps/{appId}/sessions/new',
	addTracks: '/apps/{appId}/sessions/{sessionId}/tracks/new',
	updateTracks: '/apps/{appId}/sessions/{sessionId}/tracks/update',
	closeTracks: '/apps/{appId}/sessions/{sessionId}/tracks/close',
	renegotiateSession: '/apps/{appId}/sessions/{sessionId}/renegotiate',
	getSession: '/apps/{appId}/sessions/{sessionId}',
} as const;

export type CloudflareRealtimeSessionDescription = {
	type: 'offer' | 'answer';
	sdp: string;
};

export type CloudflareRealtimeTrack = {
	location: 'local' | 'remote';
	mid?: string;
	sessionId?: string;
	trackName?: string;
	bidirectionalMediaStream?: boolean;
	kind?: string;
	errorCode?: string;
	errorDescription?: string;
};

export type CloudflareRealtimeTracksResponse = {
	errorCode?: string;
	errorDescription?: string;
	requiresImmediateRenegotiation?: boolean;
	sessionDescription?: CloudflareRealtimeSessionDescription;
	tracks?: CloudflareRealtimeTrack[];
};

export type CloudflareRealtimeNewSessionResponse = CloudflareRealtimeTracksResponse & {
	sessionId: string;
};

export type CloudflareRealtimeSessionStateResponse = Pick<CloudflareRealtimeTracksResponse, 'errorCode' | 'errorDescription'> & {
	tracks?: Array<CloudflareRealtimeTrack & {
		status?: 'active' | 'inactive' | 'waiting';
	}>;
};

export type CloudflareRealtimeErrorKind =
	| 'invalid-request'
	| 'authentication'
	| 'not-found'
	| 'rate-limited'
	| 'provider-unavailable'
	| 'provider-error';

export type CloudflareRealtimeProviderError = {
	kind: CloudflareRealtimeErrorKind;
	status: number;
	providerCode?: string;
	providerDescription?: string;
	retryable: boolean;
};

/**
 * The provider OpenAPI deliberately leaves errorCode open-ended. Preserve it for
 * diagnostics while making retry decisions from the stable HTTP boundary.
 */
export function mapCloudflareRealtimeError(
	status: number,
	body?: Pick<CloudflareRealtimeTracksResponse, 'errorCode' | 'errorDescription'>,
): CloudflareRealtimeProviderError {
	let kind: CloudflareRealtimeErrorKind;

	if (status === 400 || status === 422) {
		kind = 'invalid-request';
	} else if (status === 401 || status === 403) {
		kind = 'authentication';
	} else if (status === 404) {
		kind = 'not-found';
	} else if (status === 429) {
		kind = 'rate-limited';
	} else if (status >= 500) {
		kind = 'provider-unavailable';
	} else {
		kind = 'provider-error';
	}

	return {
		kind,
		status,
		providerCode: body?.errorCode,
		providerDescription: body?.errorDescription,
		retryable: status === 408 || status === 429 || status >= 500,
	};
}
