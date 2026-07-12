/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedCallsParticipantSchema = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'id', optional: false, nullable: false },
		roomId: { type: 'string', format: 'id', optional: false, nullable: false },
		userId: { type: 'string', format: 'id', optional: false, nullable: false },
		role: { type: 'string', enum: ['host', 'speaker', 'listener'], optional: false, nullable: false },
		state: { type: 'string', enum: ['active', 'left', 'removed'], optional: false, nullable: false },
		isMuted: { type: 'boolean', optional: false, nullable: false },
		joinedAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
		leftAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
		speakerRequestedAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
	},
} as const;

export const packedCallsRoomSchema = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'id', optional: false, nullable: false },
		attachment: {
			optional: false, nullable: false,
			oneOf: [
				{ type: 'object', properties: { type: { type: 'string', enum: ['personal'], optional: false, nullable: false }, ownerUserId: { type: 'string', format: 'id', optional: false, nullable: false } } },
				{ type: 'object', properties: { type: { type: 'string', enum: ['chatRoom'], optional: false, nullable: false }, ownerUserId: { type: 'string', format: 'id', optional: false, nullable: false }, chatRoomId: { type: 'string', format: 'id', optional: false, nullable: false } } },
			],
		},
		title: { type: 'string', optional: false, nullable: false },
		description: { type: 'string', optional: false, nullable: false },
		visibility: { type: 'string', enum: ['public', 'followers', 'specified'], optional: false, nullable: false },
		state: { type: 'string', enum: ['scheduled', 'open', 'ended', 'cancelled'], optional: false, nullable: false },
		scheduledAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
		startedAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
		endedAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
		revision: { type: 'integer', optional: false, nullable: false },
		createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
		updatedAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
	},
} as const;
