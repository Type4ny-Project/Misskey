/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';

@Injectable()
export class CallsTelemetryService {
	private logger: Logger;

	constructor(loggerService: LoggerService) {
		this.logger = loggerService.getLogger('calls');
	}

	public providerOperation(data: { operation: string; status: number; durationMs: number; outcome: 'success' | 'failure'; category?: string; retryable?: boolean }): void {
		this.logger.info('provider-operation', data);
	}

	public lifecycle(data: { action: string; roomId: string; participantId?: string; generation?: number; applicationId?: string; reason?: string }): void {
		this.logger.info('lifecycle', data);
	}
}
