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
import { CallsOperationGuardService, CallsOperationInProgressError, CallsOperationRateLimitError } from '@/core/calls/CallsOperationGuardService.js';
import { CallsApplicationDisabledError, CallsApplicationQuotaError } from '@/core/calls/CallsApplicationQuotaService.js';
import { callsApiError, callsErrors } from './_shared.js';

export const callsMediaErrors = {
	...callsErrors,
	mediaAccessDenied: { message: 'The media operation is not authorized.', code: 'CALLS_MEDIA_ACCESS_DENIED', id: 'c44f18b1-e904-4fd3-9115-31cfaac7a143' },
	staleConnection: { message: 'The Calls connection generation is stale.', code: 'CALLS_STALE_CONNECTION', id: 'df4889f6-b1d2-4a65-8834-b2fe00d86d91' },
	providerUnavailable: { message: 'The Calls media provider is unavailable.', code: 'CALLS_PROVIDER_UNAVAILABLE', id: '389e18c6-95bf-49f7-8467-af3969375ba3' },
	invalidCredential: { message: 'The Calls media credential is invalid or expired.', code: 'CALLS_INVALID_MEDIA_CREDENTIAL', id: 'e1aa5d25-5b5c-43d3-9de1-3b72e2678d60' },
	operationInProgress: { message: 'An operation with this operationId is still in progress.', code: 'CALLS_OPERATION_IN_PROGRESS', id: '0540d061-5c9f-4ea4-b415-32d74d24e0fb' },
	rateLimited: { message: 'The Calls operation rate limit was exceeded.', code: 'CALLS_RATE_LIMITED', id: '80fd6090-7f33-40a2-b066-d32bf3f87190' },
	applicationQuotaExceeded: { message: 'The Calls application quota was exceeded.', code: 'CALLS_APPLICATION_QUOTA_EXCEEDED', id: 'e4965d28-40f7-4dcb-9efe-54d3b1f26bd9' },
	applicationDisabled: { message: 'This Calls application is disabled.', code: 'CALLS_APPLICATION_DISABLED', id: 'ca1954f8-fbc4-4cb3-a4e4-851e63b7b165' },
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
	if (error instanceof CallsOperationInProgressError) throw new ApiError(callsMediaErrors.operationInProgress);
	if (error instanceof CallsOperationRateLimitError) throw new ApiError(callsMediaErrors.rateLimited);
	if (error instanceof CallsApplicationQuotaError) throw new ApiError(callsMediaErrors.applicationQuotaExceeded);
	if (error instanceof CallsApplicationDisabledError) throw new ApiError(callsMediaErrors.applicationDisabled);
	if (error instanceof StaleCallsConnectionError) throw new ApiError(callsMediaErrors.staleConnection);
	if (error instanceof CallsMediaAccessError || error instanceof CallsMediaBindingNotFoundError) throw new ApiError(callsMediaErrors.mediaAccessDenied);
	if (error instanceof CloudflareRealtimeClientError || error instanceof CloudflareRealtimeNotConfiguredError) throw new ApiError(callsMediaErrors.providerUnavailable);
	callsApiError(error);
}

export function executeCallsMediaOperation<T>(
	guard: CallsOperationGuardService,
	user: MiUser,
	token: MiAccessToken | null,
	input: { roomId: string; operationId: string },
	operationName: string,
	operation: () => Promise<T>,
): Promise<T> {
	return guard.execute({
		userId: user.id,
		applicationId: callsApplicationId(token, user),
		roomId: input.roomId,
		operation: operationName,
		operationId: input.operationId,
	}, operation);
}

export const operationIdParam = { type: 'string', minLength: 8, maxLength: 128 } as const;

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
