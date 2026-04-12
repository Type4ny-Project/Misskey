/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';

@Entity('tenant_host_mapping')
@Index(['host'], { unique: true })
export class MiTenantHostMapping {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column('varchar', {
		length: 32,
	})
	public tenantId: string;

	@Column('varchar', {
		length: 255,
	})
	public host: string;

	@Column('boolean', {
		default: false,
	})
	public isPrimary: boolean;

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
