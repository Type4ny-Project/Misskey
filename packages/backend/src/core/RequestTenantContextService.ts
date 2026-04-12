/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@/core/TenantService.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class RequestTenantContextService {
	private readonly storage = new AsyncLocalStorage<TenantContext>();

	@bindThis
	public enter(tenantContext: TenantContext): void {
		this.storage.enterWith(tenantContext);
	}

	@bindThis
	public run<T>(tenantContext: TenantContext, fn: () => T): T {
		return this.storage.run(tenantContext, fn);
	}

	@bindThis
	public get(): TenantContext | undefined {
		return this.storage.getStore();
	}

	@bindThis
	public getTenantHost(): string | undefined {
		return this.storage.getStore()?.tenantHost;
	}
}
