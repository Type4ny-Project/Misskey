/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import JSON5 from 'json5';
import type { Packed } from '@/misc/json-schema.js';
import type { MiMeta } from '@/models/Meta.js';
import type { AdsRepository, TenantMetasRepository } from '@/models/_.js';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { bindThis } from '@/decorators.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { DEFAULT_POLICIES } from '@/core/RoleService.js';
import { TenantService } from '@/core/TenantService.js';

@Injectable()
export class MetaEntityService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.adsRepository)
		private adsRepository: AdsRepository,

		@Inject(DI.tenantMetasRepository)
		private tenantMetasRepository: TenantMetasRepository,

		private systemAccountService: SystemAccountService,
		private tenantService: TenantService,
	) { }

	@bindThis
	private async getTenantMeta(tenantHost?: string) {
		if (!tenantHost) return null;
		return await this.tenantMetasRepository.findOneBy({ host: tenantHost });
	}

	@bindThis
	private applyTenantMeta<T extends Packed<'MetaLite'> | Packed<'MetaDetailed'>>(packed: T, tenantMeta: Awaited<ReturnType<typeof this.getTenantMeta>>, tenantUrl?: string): T {
		return {
			...packed,
			uri: tenantUrl ?? packed.uri,
			name: tenantMeta?.name ?? packed.name,
			shortName: tenantMeta?.shortName ?? packed.shortName,
			description: tenantMeta?.description ?? packed.description,
			themeColor: tenantMeta?.themeColor ?? packed.themeColor,
			disableRegistration: tenantMeta?.disableRegistration ?? packed.disableRegistration,
			tosUrl: tenantMeta?.tosUrl ?? packed.tosUrl,
			privacyPolicyUrl: tenantMeta?.privacyPolicyUrl ?? packed.privacyPolicyUrl,
			iconUrl: tenantMeta?.iconUrl ?? packed.iconUrl,
			bannerUrl: tenantMeta?.bannerUrl ?? packed.bannerUrl,
		};
	}

	@bindThis
	public async pack(meta?: MiMeta, options?: { tenantHost?: string; tenantUrl?: string; }): Promise<Packed<'MetaLite'>> {
		let instance = meta;

		if (!instance) {
			instance = this.meta;
		}

		const ads = await this.adsRepository.createQueryBuilder('ads')
			.where('ads.expiresAt > :now', { now: new Date() })
			.andWhere('ads.startsAt <= :now', { now: new Date() })
			.andWhere(new Brackets(qb => {
				// 曜日のビットフラグを確認する
				qb.where('ads.dayOfWeek & :dayOfWeek > 0', { dayOfWeek: 1 << new Date().getDay() })
					.orWhere('ads.dayOfWeek = 0');
			}))
			.getMany();

		// クライアントの手間を減らすためあらかじめJSONに変換しておく
		let defaultLightTheme = null;
		let defaultDarkTheme = null;
		if (instance.defaultLightTheme) {
			try {
				defaultLightTheme = JSON.stringify(JSON5.parse(instance.defaultLightTheme));
			} catch (_) {
			}
		}
		if (instance.defaultDarkTheme) {
			try {
				defaultDarkTheme = JSON.stringify(JSON5.parse(instance.defaultDarkTheme));
			} catch (_) {
			}
		}

		const packed: Packed<'MetaLite'> = {
			maintainerName: instance.maintainerName,
			maintainerEmail: instance.maintainerEmail,

			version: this.config.version,
			providesTarball: this.config.publishTarballInsteadOfProvideRepositoryUrl,

			name: instance.name,
			shortName: instance.shortName,
			pointName: instance.pointName,
			uri: this.config.url,
			description: instance.description,
			langs: instance.langs,
			tosUrl: instance.termsOfServiceUrl,
			repositoryUrl: instance.repositoryUrl,
			feedbackUrl: instance.feedbackUrl,
			impressumUrl: instance.impressumUrl,
			privacyPolicyUrl: instance.privacyPolicyUrl,
			inquiryUrl: instance.inquiryUrl,
			disableRegistration: instance.disableRegistration,
			emailRequiredForSignup: instance.emailRequiredForSignup,
			enableHcaptcha: instance.enableHcaptcha,
			hcaptchaSiteKey: instance.hcaptchaSiteKey,
			enableMcaptcha: instance.enableMcaptcha,
			mcaptchaSiteKey: instance.mcaptchaSitekey,
			mcaptchaInstanceUrl: instance.mcaptchaInstanceUrl,
			enableRecaptcha: instance.enableRecaptcha,
			recaptchaSiteKey: instance.recaptchaSiteKey,
			enableTurnstile: instance.enableTurnstile,
			turnstileSiteKey: instance.turnstileSiteKey,
			enableTestcaptcha: instance.enableTestcaptcha,
			googleAnalyticsMeasurementId: instance.googleAnalyticsMeasurementId,
			swPublickey: instance.swPublicKey,
			themeColor: instance.themeColor,
			mascotImageUrl: instance.mascotImageUrl ?? '/assets/ai.png',
			bannerUrl: instance.bannerUrl,
			infoImageUrl: instance.infoImageUrl,
			serverErrorImageUrl: instance.serverErrorImageUrl,
			notFoundImageUrl: instance.notFoundImageUrl,
			iconUrl: instance.iconUrl,
			backgroundImageUrl: instance.backgroundImageUrl,
			backgroundImageUrls: instance.backgroundImageUrls,
			logoImageUrl: instance.logoImageUrl,
			maxNoteTextLength: MAX_NOTE_TEXT_LENGTH,
			defaultLightTheme,
			defaultDarkTheme,
			clientOptions: instance.clientOptions,
			ads: ads.map(ad => ({
				id: ad.id,
				url: ad.url,
				place: ad.place,
				ratio: ad.ratio,
				imageUrl: ad.imageUrl,
				dayOfWeek: ad.dayOfWeek,
				isSensitive: ad.isSensitive ? true : undefined,
			})),
			notesPerOneAd: instance.notesPerOneAd,
			enableEmail: instance.enableEmail,
			enableServiceWorker: instance.enableServiceWorker,

			translatorAvailable: instance.deeplAuthKey != null,

			serverRules: instance.serverRules,

			policies: { ...DEFAULT_POLICIES, ...instance.policies },

			sentryForFrontend: this.config.sentryForFrontend ?? null,
			mediaProxy: this.config.mediaProxy,
			enableUrlPreview: instance.urlPreviewEnabled,
			noteSearchableScope: (this.config.meilisearch == null || this.config.meilisearch.scope !== 'local') ? 'global' : 'local',
			maxFileSize: this.config.maxFileSize,
			federation: this.meta.federation,
		};

		const tenantHost = options?.tenantHost;
		const tenantUrl = options?.tenantUrl ?? (tenantHost ? this.tenantService.tenantUrlFor(tenantHost) : undefined);
		const tenantMeta = await this.getTenantMeta(tenantHost);
		return this.applyTenantMeta(packed, tenantMeta, tenantUrl);
	}

	@bindThis
	public async packDetailed(meta?: MiMeta, options?: { tenantHost?: string; tenantUrl?: string; }): Promise<Packed<'MetaDetailed'>> {
		let instance = meta;

		if (!instance) {
			instance = this.meta;
		}

		const packed = await this.pack(instance, options);

		const proxyAccount = await this.systemAccountService.fetch('proxy');

		const packDetailed: Packed<'MetaDetailed'> = {
			...packed,
			cacheRemoteFiles: instance.cacheRemoteFiles,
			cacheRemoteSensitiveFiles: instance.cacheRemoteSensitiveFiles,
			requireSetup: this.meta.rootUserId == null,
			proxyAccountName: proxyAccount.username,
			features: {
				localTimeline: instance.policies.ltlAvailable,
				globalTimeline: instance.policies.gtlAvailable,
				registration: !instance.disableRegistration,
				emailRequiredForSignup: instance.emailRequiredForSignup,
				hcaptcha: instance.enableHcaptcha,
				recaptcha: instance.enableRecaptcha,
				turnstile: instance.enableTurnstile,
				objectStorage: instance.useObjectStorage,
				serviceWorker: instance.enableServiceWorker,
				miauth: true,
			},
		};

		return packDetailed;
	}
}
