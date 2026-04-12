/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiDriveFile, DriveFilesRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { TenantService } from '@/core/TenantService.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

@Injectable()
export class CleanRemoteFilesProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private driveService: DriveService,
		private tenantService: TenantService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean-remote-files');
	}

	@bindThis
	public async process(job: Bull.Job<Record<string, unknown>>): Promise<void> {
		this.logger.info('Deleting cached remote files...');

		let deletedCount = 0;
		let cursor: MiDriveFile['id'] | null = null;

		const total = await this.driveFilesRepository.createQueryBuilder('file')
			.where('file.isLink = FALSE')
			.andWhere('file.userHost IS NOT NULL')
			.andWhere('NOT EXISTS (SELECT 1 FROM tenant_host_mapping thm WHERE thm.host = file."userHost")')
			.getCount();

		while (true) {
			const query = this.driveFilesRepository.createQueryBuilder('file')
				.where('file.isLink = FALSE')
				.andWhere('file.userHost IS NOT NULL')
				.andWhere('NOT EXISTS (SELECT 1 FROM tenant_host_mapping thm WHERE thm.host = file."userHost")')
				.orderBy('file.id', 'ASC')
				.take(8);

			if (cursor) {
				query.andWhere('file.id > :cursor', { cursor });
			}

			const files: MiDriveFile[] = await query.getMany();

			if (files.length === 0) {
				job.updateProgress(100);
				break;
			}

			cursor = files.at(-1)?.id ?? null;

			await Promise.all(files.map(file => this.driveService.deleteFileSync(file, true)));

			deletedCount += files.length;

			job.updateProgress(total === 0 ? 100 : deletedCount * 100 / total);
		}

		this.logger.succ('All cached remote files has been deleted.');
	}
}
