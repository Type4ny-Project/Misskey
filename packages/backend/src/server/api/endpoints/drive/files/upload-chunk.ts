/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../../error.js';

const chunkSize = 5 * 1024 * 1024;
const sessionTtl = 60 * 30;

type UploadSession = {
	sessionId: string;
	userId: string;
	name: string;
	size: number;
	folderId: string | null;
	isSensitive: boolean;
	comment: string | null;
	force: boolean;
	totalChunks: number;
	tempDir: string;
	tempFilePath: string;
};

function getSessionKey(sessionId: string): string {
	return `drive:chunk-upload:session:${sessionId}`;
}

function getChunksKey(sessionId: string): string {
	return `drive:chunk-upload:session:${sessionId}:chunks`;
}

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	requireFile: true,

	prohibitMoved: true,

	kind: 'write:drive',

	description: 'Upload a chunk for a chunked drive file upload session.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			uploaded: { type: 'number' },
		},
		required: ['uploaded'],
	},

	errors: {
		sessionNotFound: {
			message: 'Upload session not found.',
			code: 'SESSION_NOT_FOUND',
			id: '4e53158b-2687-43cf-a607-f9fddeafddf9',
		},
		invalidChunkIndex: {
			message: 'Invalid chunk index.',
			code: 'INVALID_CHUNK_INDEX',
			id: 'a9d3439d-6228-4e5e-8f56-e9b50f0e0d26',
		},
		invalidChunkSize: {
			message: 'Invalid chunk size.',
			code: 'INVALID_CHUNK_SIZE',
			id: 'a67226fc-ec7d-4118-91be-a21cf7b20a45',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string' },
		index: { type: 'number', minimum: 0 },
	},
	required: ['sessionId', 'index'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
	) {
		super(meta, paramDef, async (ps, me, _, file, cleanup) => {
			if (file == null) {
				throw new ApiError();
			}

			try {
				const sessionJson = await this.redisClient.get(getSessionKey(ps.sessionId));
				if (sessionJson == null) {
					throw new ApiError(meta.errors.sessionNotFound);
				}

				const session = JSON.parse(sessionJson) as UploadSession;
				if (session.userId !== me.id) {
					throw new ApiError(meta.errors.sessionNotFound);
				}

				if (!Number.isInteger(ps.index) || ps.index < 0 || ps.index >= session.totalChunks) {
					throw new ApiError(meta.errors.invalidChunkIndex);
				}

				const stats = await fsp.stat(file.path);
				const actualChunkSize = stats.size;
				const expectedChunkSize = Math.min(chunkSize, session.size - (ps.index * chunkSize));

				if (actualChunkSize > chunkSize || actualChunkSize !== expectedChunkSize) {
					throw new ApiError(meta.errors.invalidChunkSize);
				}

				await pipeline(
					fs.createReadStream(file.path),
					fs.createWriteStream(session.tempFilePath, {
						flags: 'r+',
						start: ps.index * chunkSize,
					}),
				);

				const uploadedResult = await this.redisClient.multi()
					.sadd(getChunksKey(ps.sessionId), String(ps.index))
					.scard(getChunksKey(ps.sessionId))
					.expire(getSessionKey(ps.sessionId), sessionTtl)
					.expire(getChunksKey(ps.sessionId), sessionTtl)
					.exec();

				const uploaded = Number(uploadedResult?.[1]?.[1] ?? 0);

				return {
					uploaded,
				};
			} finally {
				cleanup?.();
			}
		});
	}
}
