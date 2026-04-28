/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DB_MAX_IMAGE_COMMENT_LENGTH } from '@/const.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { DI } from '@/di-symbols.js';
import { createTempDir } from '@/misc/create-temp.js';
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

async function cleanupTempDir(tempDir: string): Promise<void> {
	await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
}

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:drive',

	description: 'Initialize a chunked drive file upload session.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			sessionId: { type: 'string' },
			chunkSize: { type: 'number' },
		},
		required: ['sessionId', 'chunkSize'],
	},

	errors: {
		invalidFileName: {
			message: 'Invalid file name.',
			code: 'INVALID_FILE_NAME',
			id: '7f458555-7f3d-4a53-8e3f-76c8876e0f8f',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string' },
		size: { type: 'number', minimum: 0 },
		folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		comment: { type: 'string', nullable: true, maxLength: DB_MAX_IMAGE_COMMENT_LENGTH, default: null },
		isSensitive: { type: 'boolean', default: false },
		force: { type: 'boolean', default: false },
	},
	required: ['name', 'size'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const name = ps.name.trim();
			if (name.length === 0 || name === 'blob' || !this.driveFileEntityService.validateFileName(name)) {
				throw new ApiError(meta.errors.invalidFileName);
			}

			const sessionId = randomUUID();
			const totalChunks = Math.ceil(ps.size / chunkSize);
			const [tempDir, cleanupTempDirCallback] = await createTempDir();
			const tempFilePath = path.join(tempDir, 'upload.bin');

			try {
				const tempFile = await fs.open(tempFilePath, 'w');
				try {
					await tempFile.truncate(ps.size);
				} finally {
					await tempFile.close();
				}

				const session: UploadSession = {
					sessionId,
					userId: me.id,
					name,
					size: ps.size,
					folderId: ps.folderId,
					isSensitive: ps.isSensitive,
					comment: ps.comment,
					force: ps.force,
					totalChunks,
					tempDir,
					tempFilePath,
				};

				await this.redisClient.multi()
					.set(getSessionKey(sessionId), JSON.stringify(session), 'EX', sessionTtl)
					.del(getChunksKey(sessionId))
					.exec();

				return {
					sessionId,
					chunkSize,
				};
			} catch (err) {
				cleanupTempDirCallback();
				await cleanupTempDir(tempDir);
				throw err;
			}
		});
	}
}
