/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export type EmojiRequestStatus = 'pending' | 'approved' | 'rejected';

@Entity('emoji_request')
export class MiEmojiRequest {
	@PrimaryColumn(id())
	public id: string;

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

	@Index()
	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Index()
	@Column('varchar', {
		length: 128,
	})
	public name: string;

	@Column('varchar', {
		length: 128, nullable: true,
	})
	public category: string | null;

	@Column('varchar', {
		length: 512,
	})
	public originalUrl: string;

	@Column('varchar', {
		length: 512, nullable: true,
	})
	public publicUrl: string | null;

	@Column('varchar', {
		length: 128, array: true, default: '{}',
	})
	public aliases: string[];

	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public license: string | null;

	@Column('varchar', {
		length: 2048, default: '',
	})
	public comment: string;

	@Index()
	@Column('varchar', {
		length: 32, default: 'pending',
	})
	public status: EmojiRequestStatus;

	@Column('text', {
		nullable: true,
	})
	public rejectionReason: string | null;
}
