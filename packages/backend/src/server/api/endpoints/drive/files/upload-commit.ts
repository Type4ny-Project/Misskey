/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs/promises';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { FastifyRequest } from 'fastify';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { DriveService } from '@/core/DriveService.js';
import { MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../../error.js';

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

async function cleanupUpload(redisClient: Redis.Redis, session: UploadSession): Promise<void> {
	await redisClient.del(getSessionKey(session.sessionId), getChunksKey(session.sessionId));
	await fs.rm(session.tempDir, { recursive: true, force: true }).catch(() => {});
}

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:drive',

	description: 'Commit a chunked drive file upload session.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'DriveFile',
	},

	errors: {
		sessionNotFound: {
			message: 'Upload session not found.',
			code: 'SESSION_NOT_FOUND',
			id: '4df76536-4f72-4c80-a4f8-4be45d09d5f7',
		},

		missingChunks: {
			message: 'Some chunks are missing.',
			code: 'MISSING_CHUNKS',
			id: '15c5a42d-b790-4e7c-b4b6-6a0bf8713910',
		},

		inappropriate: {
			message: 'Cannot upload the file because it has been determined that it possibly contains inappropriate content.',
			code: 'INAPPROPRIATE',
			id: 'bec5bd69-fba3-43c9-b4fb-2894b66ad5d2',
		},

		noFreeSpace: {
			message: 'Cannot upload the file because you have no free space of drive.',
			code: 'NO_FREE_SPACE',
			id: 'd08dbc37-a6a9-463a-8c47-96c32ab5f064',
		},

		maxFileSizeExceeded: {
			message: 'Cannot upload the file because it exceeds the maximum file size.',
			code: 'MAX_FILE_SIZE_EXCEEDED',
			id: 'b9d8c348-33f0-4673-b9a9-5d4da058977a',
			httpStatusCode: 413,
		},

		unallowedFileType: {
			message: 'Cannot upload the file because it is an unallowed file type.',
			code: 'UNALLOWED_FILE_TYPE',
			id: '4becd248-7f2c-48c4-a9f0-75edc4f9a1ea',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string' },
	},
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private driveFileEntityService: DriveFileEntityService,
		private driveService: DriveService,
	) {
		super(meta, paramDef, async (ps, me, _, _1, _2, ip, headers, request) => {
			const rawRequest = request?.raw as FastifyRequest['raw'] | undefined;
			let requestAborted = rawRequest?.aborted ?? false;
			const onRequestAborted = () => {
				requestAborted = true;
			};
			rawRequest?.once('aborted', onRequestAborted);

			let committedFile: Awaited<ReturnType<DriveService['addFile']>> | null = null;
			const rollbackCommittedFile = async () => {
				if (committedFile == null) return;
				const file = committedFile;
				committedFile = null;
				await this.driveService.deleteFileSync(file, false, me);
			};

			const sessionJson = await this.redisClient.get(getSessionKey(ps.sessionId));
			if (sessionJson == null) {
				rawRequest?.off('aborted', onRequestAborted);
				throw new ApiError(meta.errors.sessionNotFound);
			}

			const session = JSON.parse(sessionJson) as UploadSession;
			if (session.userId !== me.id) {
				rawRequest?.off('aborted', onRequestAborted);
				throw new ApiError(meta.errors.sessionNotFound);
			}

			const uploadedChunks = new Set(await this.redisClient.smembers(getChunksKey(ps.sessionId)));
			for (let index = 0; index < session.totalChunks; index++) {
				if (!uploadedChunks.has(String(index))) {
					throw new ApiError(meta.errors.missingChunks);
				}
			}

			const stats = await fs.stat(session.tempFilePath);
			if (stats.size !== session.size) {
				rawRequest?.off('aborted', onRequestAborted);
				throw new ApiError(meta.errors.missingChunks);
			}

			try {
				committedFile = await this.driveService.addFile({
					user: me,
					path: session.tempFilePath,
					name: session.name,
					comment: session.comment,
					folderId: session.folderId,
					force: session.force,
					sensitive: session.isSensitive,
					requestIp: this.serverSettings.enableIpLogging ? ip : null,
					requestHeaders: this.serverSettings.enableIpLogging ? headers : null,
				});

				if (requestAborted) {
					await rollbackCommittedFile();
					throw new Error('Chunk upload commit request aborted after file persistence.');
				}

				await cleanupUpload(this.redisClient, session);

				const packedDriveFile = await this.driveFileEntityService.pack(committedFile, { self: true });

				if (requestAborted) {
					await rollbackCommittedFile();
					throw new Error('Chunk upload commit request aborted before response completion.');
				}

				committedFile = null;
				return packedDriveFile;
			} catch (err) {
				await cleanupUpload(this.redisClient, session);
				await rollbackCommittedFile().catch(rollbackError => {
					console.error(rollbackError);
				});
				if (err instanceof Error || typeof err === 'string') {
					console.error(err);
				}
				if (err instanceof IdentifiableError) {
					if (err.id === '282f77bf-5816-4f72-9264-aa14d8261a21') throw new ApiError(meta.errors.inappropriate);
					if (err.id === 'c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6') throw new ApiError(meta.errors.noFreeSpace);
					if (err.id === 'f9e4e5f3-4df4-40b5-b400-f236945f7073') throw new ApiError(meta.errors.maxFileSizeExceeded);
					if (err.id === 'bd71c601-f9b0-4808-9137-a330647ced9b') throw new ApiError(meta.errors.unallowedFileType);
				}
				throw new ApiError();
			} finally {
				rawRequest?.off('aborted', onRequestAborted);
			}
		});
	}
}
