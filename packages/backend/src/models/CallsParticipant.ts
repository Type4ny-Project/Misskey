/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { MiCallsRoom } from './CallsRoom.js';
import { MiUser } from './User.js';
import { id } from './util/id.js';

export const callsParticipantRoles = ['host', 'speaker', 'listener'] as const;
export type CallsParticipantRole = typeof callsParticipantRoles[number];

export const callsParticipantStates = ['active', 'left', 'removed'] as const;
export type CallsParticipantState = typeof callsParticipantStates[number];

@Entity('calls_participant')
@Index(['roomId', 'userId'], { unique: true })
@Index('IDX_calls_participant_one_host', ['roomId'], { unique: true, where: `"role" = 'host'` })
@Check('CHK_calls_participant_role', `"role" IN ('host', 'speaker', 'listener')`)
@Check('CHK_calls_participant_state', `"state" IN ('active', 'left', 'removed')`)
@Check('CHK_calls_participant_lifecycle', `("state" = 'active' AND "leftAt" IS NULL) OR ("state" IN ('left', 'removed') AND "leftAt" IS NOT NULL)`)
export class MiCallsParticipant {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column(id())
	public roomId: MiCallsRoom['id'];

	@ManyToOne(() => MiCallsRoom, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'roomId' })
	public room: MiCallsRoom | null;

	@Index()
	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	public user: MiUser | null;

	@Column('varchar', { length: 16 })
	public role: CallsParticipantRole;

	@Column('varchar', { length: 16, default: 'active' })
	public state: CallsParticipantState;

	@Column('boolean', { default: false })
	public isMuted: boolean;

	@Column('timestamp with time zone')
	public joinedAt: Date;

	@Column('timestamp with time zone', { nullable: true })
	public leftAt: Date | null;

	@Column('timestamp with time zone', { nullable: true })
	public speakerRequestedAt: Date | null;

	@Column('timestamp with time zone')
	public updatedAt: Date;
}
