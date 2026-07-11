/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { CallsMediaAccessError } from '@/core/calls/CallsMediaService.js';
import { CallsMediaBindingNotFoundError } from '@/core/calls/CallsMediaBindingService.js';
import { StaleCallsConnectionError } from '@/core/calls/CallsLiveConnectionService.js';
import { CloudflareRealtimeClientError, CloudflareRealtimeNotConfiguredError } from '@/core/calls/CloudflareRealtimeClient.js';
import type { CloudflareRealtimeTracksResponse } from '@/core/calls/CloudflareRealtimeProviderContract.js';
import { ApiError } from '@/server/api/error.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiUser } from '@/models/User.js';
import { CallsMediaCredentialService, InvalidCallsMediaCredentialError } from '@/core/calls/CallsMediaCredentialService.js';
import { callsApiError, callsErrors } from './_shared.js';

export const callsMediaErrors = {
	...callsErrors,
	mediaAccessDenied: { message: 'The media operation is not authorized.', code: 'CALLS_MEDIA_ACCESS_DENIED', id: 'c44f18b1-e904-4fd3-9115-31cfaac7a143' },
	staleConnection: { message: 'The Calls connection generation is stale.', code: 'CALLS_STALE_CONNECTION', id: 'df4889f6-b1d2-4a65-8834-b2fe00d86d91' },
	providerUnavailable: { message: 'The Calls media provider is unavailable.', code: 'CALLS_PROVIDER_UNAVAILABLE', id: '389e18c6-95bf-49f7-8467-af3969375ba3' },
	invalidCredential: { message: 'The Calls media credential is invalid or expired.', code: 'CALLS_INVALID_MEDIA_CREDENTIAL', id: 'e1aa5d25-5b5c-43d3-9de1-3b72e2678d60' },
} as const;

export const sessionDescriptionParam = {
	type: 'object',
	properties: {
		type: { type: 'string', enum: ['offer', 'answer'] },
		sdp: { type: 'string', minLength: 1, maxLength: 1_000_000 },
	},
	required: ['type', 'sdp'],
} as const;

export const negotiationResponseSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		requiresImmediateRenegotiation: { type: 'boolean', optional: false, nullable: false },
		sessionDescription: {
			type: 'object', optional: false, nullable: true,
			properties: {
				type: { type: 'string', enum: ['offer', 'answer'], optional: false, nullable: false },
				sdp: { type: 'string', optional: false, nullable: false },
			},
		},
		trackErrors: {
			type: 'array', optional: false, nullable: false,
			items: { type: 'object', properties: {
				index: { type: 'integer', optional: false, nullable: false },
				code: { type: 'string', optional: false, nullable: false },
				description: { type: 'string', optional: false, nullable: true },
			} },
		},
	},
} as const;

export function sanitizeNegotiation(response: CloudflareRealtimeTracksResponse) {
	return {
		requiresImmediateRenegotiation: response.requiresImmediateRenegotiation ?? false,
		sessionDescription: response.sessionDescription ?? null,
		trackErrors: (response.tracks ?? []).flatMap((track, index) => track.errorCode == null ? [] : [{ index, code: track.errorCode, description: track.errorDescription ?? null }]),
	};
}

export function callsMediaApiError(error: unknown): never {
	if (error instanceof InvalidCallsMediaCredentialError) throw new ApiError(callsMediaErrors.invalidCredential);
	if (error instanceof StaleCallsConnectionError) throw new ApiError(callsMediaErrors.staleConnection);
	if (error instanceof CallsMediaAccessError || error instanceof CallsMediaBindingNotFoundError) throw new ApiError(callsMediaErrors.mediaAccessDenied);
	if (error instanceof CloudflareRealtimeClientError || error instanceof CloudflareRealtimeNotConfiguredError) throw new ApiError(callsMediaErrors.providerUnavailable);
	callsApiError(error);
}

export function callsApplicationId(token: MiAccessToken | null, user: MiUser): string {
	return token?.appId ?? token?.id ?? `first-party:${user.id}`;
}

export function verifyCallsMediaCredential(
	service: CallsMediaCredentialService,
	credential: string,
	user: MiUser,
	token: MiAccessToken | null,
	input: { roomId: string; participantId: string; connectionId: string; generation: number },
	publish = false,
): void {
	service.verify(credential, { ...input, userId: user.id, applicationId: callsApplicationId(token, user), publish });
}
