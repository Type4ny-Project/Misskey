/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChannel } from './Channel.js';

@Entity('event')
export class MiEvent {
	@PrimaryColumn(id())
	public id: string;

	@Column('varchar', {
		length: 128,
		comment: 'The title of the Event.',
	})
	public title: string;

	@Index()
	@Column('timestamp with time zone', {
		comment: 'The start time of the Event.',
	})
	public startAt: Date;

	@Column('timestamp with time zone', {
		nullable: true,
		comment: 'The end time of the Event.',
	})
	public endAt: Date | null;

	@Column('varchar', {
		length: 2048,
		nullable: true,
		comment: 'The description of the Event.',
	})
	public description: string | null;

	@Column('varchar', {
		length: 512,
		nullable: true,
		comment: 'The URL of the Event.',
	})
	public url: string | null;

	@Column('varchar', {
		length: 7,
		nullable: true,
		comment: 'The display color of the Event.',
	})
	public color: string | null;

	@Column('varchar', {
		array: true,
		length: 128,
		default: '{}',
		comment: 'Tags for the Event.',
	})
	public tags: string[];

	@Index()
	@Column({
		...id(),
		comment: 'The creator user ID.',
	})
	public createdById: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'createdById' })
	public createdBy: MiUser | null;

	@Index()
	@Column('varchar', {
		length: 16,
		default: 'pending',
		comment: 'The approval status: pending, approved, rejected.',
	})
	public status: 'pending' | 'approved' | 'rejected';

	@Column({
		...id(),
		nullable: true,
		comment: 'The approver/rejector user ID.',
	})
	public approvedById: MiUser['id'] | null;

	@ManyToOne(() => MiUser, {
		onDelete: 'SET NULL',
	})
	@JoinColumn({ name: 'approvedById' })
	public approvedBy: MiUser | null;

	@Index()
	@Column({
		...id(),
		nullable: true,
		comment: 'The linked channel ID.',
	})
	public channelId: MiChannel['id'] | null;

	@ManyToOne(() => MiChannel, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public channel: MiChannel | null;

	@Column('timestamp with time zone', {
		comment: 'The created date of the Event.',
	})
	public createdAt: Date;

	@Column('timestamp with time zone', {
		comment: 'The updated date of the Event.',
	})
	public updatedAt: Date;
}
