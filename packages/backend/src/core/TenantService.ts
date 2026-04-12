/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { TenantHostMappingsRepository, TenantMetasRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';

export type TenantContext = {
	tenantHost: string;
	tenantUrl: string;
	tenantId?: string;
	isPrimary: boolean;
};

@Injectable()
export class TenantService implements OnModuleInit {
	private managedHosts = new Set<string>();
	private tenantIdsByHost = new Map<string, string>();
	private primaryTenantId?: string;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.tenantHostMappingsRepository)
		private tenantHostMappingsRepository: TenantHostMappingsRepository,

		@Inject(DI.tenantMetasRepository)
		private tenantMetasRepository: TenantMetasRepository,
	) {
	}

	@bindThis
	public async onModuleInit(): Promise<void> {
		await this.reloadManagedHosts();
	}

	@bindThis
	public normalizeHost(host: string | null | undefined): string | null {
		if (host == null) return null;
		const trimmed = host.trim().toLowerCase();
		if (trimmed.length === 0) return null;
		const hostname = trimmed.replace(/:\d+$/, '');
		return domainToASCII(hostname);
	}

	@bindThis
	public async reloadManagedHosts(): Promise<void> {
		const mappings = await this.tenantHostMappingsRepository.find();
		this.managedHosts = new Set([this.tenantHostFor(this.config.host)]);
		this.tenantIdsByHost = new Map();

		for (const mapping of mappings) {
			const normalized = this.normalizeHost(mapping.host);
			if (normalized == null) continue;
			this.managedHosts.add(normalized);
			this.tenantIdsByHost.set(normalized, mapping.tenantId);
			if (mapping.isPrimary) {
				this.primaryTenantId = mapping.tenantId;
			}
		}

		this.tenantIdsByHost.set(this.tenantHostFor(this.config.host), this.primaryTenantId ?? this.tenantHostFor(this.config.host));
	}

	@bindThis
	public tenantHostFor(host: string | null | undefined): string {
		return this.normalizeHost(host) ?? this.normalizeHost(this.config.host)!;
	}

	@bindThis
	public tenantUrlFor(host: string | null | undefined): string {
		const tenantHost = this.tenantHostFor(host);
		const base = new URL(this.config.url);
		base.host = tenantHost;
		return base.origin;
	}

	@bindThis
	public isManagedHost(host: string | null | undefined): boolean {
		const normalized = this.normalizeHost(host);
		if (normalized == null) return true;
		return this.managedHosts.has(normalized);
	}

	@bindThis
	public isSameTenant(host: string | null | undefined, tenantHost: string): boolean {
		return this.tenantHostFor(host) === this.tenantHostFor(tenantHost);
	}

	@bindThis
	public isLocalToTenant(host: string | null | undefined, tenantHost: string): boolean {
		return this.tenantHostFor(host) === this.normalizeHost(tenantHost);
	}

	@bindThis
	public getPrimaryTenantContext(): TenantContext {
		const tenantHost = this.tenantHostFor(this.config.host);
		return {
			tenantHost,
			tenantUrl: this.tenantUrlFor(tenantHost),
			tenantId: this.tenantIdsByHost.get(tenantHost),
			isPrimary: true,
		};
	}

	@bindThis
	public async resolve(host: string | null | undefined): Promise<TenantContext> {
		const normalized = this.normalizeHost(host);
		if (normalized == null) return this.getPrimaryTenantContext();

		if (!this.managedHosts.has(normalized)) {
			const mapping = await this.tenantHostMappingsRepository.findOneBy({ host: normalized });
			if (mapping) {
				return {
					tenantHost: normalized,
					tenantUrl: this.tenantUrlFor(normalized),
					tenantId: mapping.tenantId,
					isPrimary: mapping.isPrimary,
				};
			}
		}

		const primary = this.getPrimaryTenantContext();
		if (!this.managedHosts.has(normalized)) {
			return primary;
		}

		return {
			tenantHost: normalized,
			tenantUrl: this.tenantUrlFor(normalized),
			tenantId: this.tenantIdsByHost.get(normalized),
			isPrimary: normalized === primary.tenantHost,
		};
	}

	@bindThis
	public async ensurePrimaryTenantMetadata(): Promise<void> {
		const primary = this.getPrimaryTenantContext();
		const exists = await this.tenantMetasRepository.exists({ where: { host: primary.tenantHost } });
		if (exists) return;

		await this.tenantMetasRepository.insert({
			id: this.primaryTenantId ?? primary.tenantHost,
			host: primary.tenantHost,
			disableRegistration: false,
		});
	}
}
