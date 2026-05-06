/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedEventSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		title: {
			type: 'string',
			optional: false, nullable: false,
		},
		startAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
		endAt: {
			type: 'string',
			optional: false, nullable: true,
			format: 'date-time',
		},
		description: {
			type: 'string',
			optional: false, nullable: true,
		},
		url: {
			type: 'string',
			optional: false, nullable: true,
		},
		tags: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'string',
			},
		},
		createdById: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
		},
		createdBy: {
			type: 'object',
			ref: 'UserLite',
			optional: false, nullable: false,
		},
		status: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['pending', 'approved', 'rejected'],
		},
		approvedById: {
			type: 'string',
			optional: false, nullable: true,
			format: 'id',
		},
		approvedBy: {
			type: 'object',
			ref: 'UserLite',
			optional: false, nullable: true,
		},
		channelId: {
			type: 'string',
			optional: false, nullable: true,
			format: 'id',
		},
		channel: {
			type: 'object',
			optional: false, nullable: true,
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
					format: 'id',
				},
				name: {
					type: 'string',
					optional: false, nullable: false,
				},
				color: {
					type: 'string',
					optional: false, nullable: false,
				},
			},
		},
		createdAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
		updatedAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
	},
} as const;
