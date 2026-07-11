/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { CallsFeatureDisabledError, CallsRoomError } from '@/core/calls/CallsRoomService.js';
import { ApiError } from '@/server/api/error.js';

export const callsErrors = {
	accessDenied: { message: 'You do not have access to this Calls room.', code: 'CALLS_ACCESS_DENIED', id: '3a432e2d-51e8-42f4-ae52-d2b0a7b89afa' },
	attachmentNotFound: { message: 'The attached room does not exist.', code: 'CALLS_ATTACHMENT_NOT_FOUND', id: '5985f4cf-84bb-4997-9e68-46f421f29e84' },
	invalidState: { message: 'The Calls room is not in the required state.', code: 'CALLS_INVALID_STATE', id: '27bbe09b-c516-4c8a-a9fc-4b5c8de79cbb' },
	invalidMetadata: { message: 'The Calls room metadata is invalid.', code: 'CALLS_INVALID_METADATA', id: '7fc75953-7ec9-4e2f-aee2-af12a8101971' },
	participantNotFound: { message: 'The Calls participant does not exist.', code: 'CALLS_PARTICIPANT_NOT_FOUND', id: '17e679a9-0ad9-4fe0-a09f-92dae12e445a' },
	roomFull: { message: 'The Calls room has reached its participant limit.', code: 'CALLS_ROOM_FULL', id: '0a9fe42c-7fc8-428c-8e80-cbf2063e8747' },
	roomNotFound: { message: 'The Calls room does not exist.', code: 'CALLS_ROOM_NOT_FOUND', id: '09fd2742-0fc7-4222-ad41-1c395427a7d1' },
	staleRevision: { message: 'The Calls room revision is stale.', code: 'CALLS_STALE_REVISION', id: 'fde2c128-2b65-4784-a0de-59f20eb901c1' },
	featureDisabled: { message: 'Misskey Calls is disabled on this instance.', code: 'CALLS_FEATURE_DISABLED', id: 'bc70cfca-3247-4cd5-a9b7-a88b381195af' },
} as const;

export function callsApiError(error: unknown): never {
	if (error instanceof CallsFeatureDisabledError) throw new ApiError(callsErrors.featureDisabled);
	if (!(error instanceof CallsRoomError)) throw error;
	const key = error.code === 'access-denied' ? 'accessDenied'
		: error.code === 'attachment-not-found' ? 'attachmentNotFound'
			: error.code === 'invalid-state' ? 'invalidState'
				: error.code === 'invalid-metadata' ? 'invalidMetadata'
				: error.code === 'participant-not-found' ? 'participantNotFound'
					: error.code === 'room-full' ? 'roomFull'
						: error.code === 'room-not-found' ? 'roomNotFound'
							: 'staleRevision';
	throw new ApiError(callsErrors[key]);
}
