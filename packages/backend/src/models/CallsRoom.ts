/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { MiChatRoom } from './ChatRoom.js';
import { MiUser } from './User.js';
import { id } from './util/id.js';

export const callsRoomAttachmentTypes = ['personal', 'chatRoom'] as const;
export type CallsRoomAttachmentType = typeof callsRoomAttachmentTypes[number];

export const callsRoomVisibilities = ['public', 'followers', 'specified'] as const;
export type CallsRoomVisibility = typeof callsRoomVisibilities[number];

export const callsRoomStates = ['scheduled', 'open', 'ended', 'cancelled'] as const;
export type CallsRoomState = typeof callsRoomStates[number];

@Entity('calls_room')
@Check('CHK_calls_room_attachment', `("attachmentType" = 'personal' AND "chatRoomId" IS NULL) OR ("attachmentType" = 'chatRoom' AND "chatRoomId" IS NOT NULL)`)
@Check('CHK_calls_room_attachment_type', `"attachmentType" IN ('personal', 'chatRoom')`)
@Check('CHK_calls_room_visibility', `"visibility" IN ('public', 'followers', 'specified')`)
@Check('CHK_calls_room_state', `"state" IN ('scheduled', 'open', 'ended', 'cancelled')`)
@Check('CHK_calls_room_revision', '"revision" >= 0')
@Check('CHK_calls_room_lifecycle', `("state" = 'scheduled' AND "startedAt" IS NULL AND "endedAt" IS NULL) OR ("state" = 'open' AND "startedAt" IS NOT NULL AND "endedAt" IS NULL) OR ("state" IN ('ended', 'cancelled') AND "endedAt" IS NOT NULL)`)
export class MiCallsRoom {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column('varchar', { length: 16 })
	public attachmentType: CallsRoomAttachmentType;

	@Index()
	@Column(id())
	public ownerUserId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'ownerUserId' })
	public ownerUser: MiUser | null;

	@Index()
	@Column({ ...id(), nullable: true })
	public chatRoomId: MiChatRoom['id'] | null;

	@ManyToOne(() => MiChatRoom, { onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'chatRoomId' })
	public chatRoom: MiChatRoom | null;

	@Column('varchar', { length: 256 })
	public title: string;

	@Column('varchar', { length: 2048, default: '' })
	public description: string;

	@Column('varchar', { length: 16, default: 'specified' })
	public visibility: CallsRoomVisibility;

	@Index()
	@Column('varchar', { length: 16, default: 'scheduled' })
	public state: CallsRoomState;

	@Column('timestamp with time zone', { nullable: true })
	public scheduledAt: Date | null;

	@Column('timestamp with time zone', { nullable: true })
	public startedAt: Date | null;

	@Column('timestamp with time zone', { nullable: true })
	public endedAt: Date | null;

	@Column('integer', { default: 0 })
	public revision: number;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone')
	public updatedAt: Date;
}
