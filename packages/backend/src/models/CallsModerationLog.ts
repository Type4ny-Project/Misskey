/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { MiCallsParticipant, type CallsParticipantRole } from './CallsParticipant.js';
import { MiCallsRoom } from './CallsRoom.js';
import { MiUser } from './User.js';
import { id } from './util/id.js';

export const callsModerationActions = ['promote', 'demote', 'mute', 'unmute', 'remove', 'speakerRequest', 'speakerRequestCancel'] as const;
export type CallsModerationAction = typeof callsModerationActions[number];

@Entity('calls_moderation_log')
@Check('CHK_calls_moderation_action', `"action" IN ('promote', 'demote', 'mute', 'unmute', 'remove', 'speakerRequest', 'speakerRequestCancel')`)
@Check('CHK_calls_moderation_revision', '"roomRevision" > 0')
export class MiCallsModerationLog {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column(id())
	public roomId: MiCallsRoom['id'];

	@ManyToOne(() => MiCallsRoom, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'roomId' })
	public room: MiCallsRoom | null;

	@Index()
	@Column({ ...id(), nullable: true })
	public actorUserId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'actorUserId' })
	public actorUser: MiUser | null;

	@Index()
	@Column({ ...id(), nullable: true })
	public targetParticipantId: MiCallsParticipant['id'] | null;

	@ManyToOne(() => MiCallsParticipant, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'targetParticipantId' })
	public targetParticipant: MiCallsParticipant | null;

	@Column('varchar', { length: 32 })
	public action: CallsModerationAction;

	@Column('varchar', { length: 16, nullable: true })
	public previousRole: CallsParticipantRole | null;

	@Column('varchar', { length: 16, nullable: true })
	public nextRole: CallsParticipantRole | null;

	@Column('varchar', { length: 512, nullable: true })
	public reason: string | null;

	@Column('integer')
	public roomRevision: number;

	@Column('timestamp with time zone')
	public createdAt: Date;
}
