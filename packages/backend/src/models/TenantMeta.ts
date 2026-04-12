/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';

@Entity('tenant_meta')
@Index(['host'], { unique: true })
export class MiTenantMeta {
	@PrimaryColumn(id())
	public id: string;

	@Column('varchar', {
		length: 255,
	})
	public host: string;

	@Column('varchar', {
		length: 512,
		nullable: true,
	})
	public name: string | null;

	@Column('varchar', {
		length: 512,
		nullable: true,
	})
	public shortName: string | null;

	@Column('text', {
		nullable: true,
	})
	public description: string | null;

	@Column('varchar', {
		length: 64,
		nullable: true,
	})
	public themeColor: string | null;

	@Column('varchar', {
		length: 512,
		nullable: true,
	})
	public maintainerName: string | null;

	@Column('boolean', {
		default: false,
	})
	public disableRegistration: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public tosUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public privacyPolicyUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public iconUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public bannerUrl: string | null;

	@Column('jsonb', {
		nullable: true,
	})
	public manifest: Record<string, unknown> | null;

	@Index()
	@Column('timestamp with time zone', {
		default: () => 'CURRENT_TIMESTAMP',
	})
	public createdAt: Date;

	@Index()
	@Column('timestamp with time zone', {
		nullable: true,
	})
	public updatedAt: Date | null;
}
