/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiChannel } from './Channel.js';
import { MiUser } from './User.js';

@Entity('channel_follow_request')
@Index(['followerId', 'channelId'], { unique: true })
export class MiChannelFollowRequest {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
		comment: 'The channel ID.',
	})
	public channelId: MiChannel['id'];

	@ManyToOne(() => MiChannel, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public channel: MiChannel | null;

	@Index()
	@Column({
		...id(),
		comment: 'The follower user ID.',
	})
	public followerId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public follower: MiUser | null;
}
