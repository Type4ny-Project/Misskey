/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { ChannelsRepository, UsersRepository } from '@/models/_.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class ChannelService {
	constructor(
		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
	) {
	}

	@bindThis
	public async canEditChannel(
		channel: MiChannel,
		user: Pick<MiUser, 'id'>,
		isModerator: boolean,
	): Promise<boolean> {
		if (channel.userId === user.id) {
			return true;
		}
		if (isModerator) {
			return true;
		}
		if (channel.collaboratorIds && channel.collaboratorIds.includes(user.id)) {
			return true;
		}
		return false;
	}

	@bindThis
	public async canTransferChannel(
		channel: MiChannel,
		user: MiUser,
	): Promise<boolean> {
		return channel.userId === user.id;
	}

	@bindThis
	public async addCollaborator(
		channel: MiChannel,
		userId: MiUser['id'],
	): Promise<void> {
		const collaboratorIds = channel.collaboratorIds ?? [];
		if (!collaboratorIds.includes(userId)) {
			await this.channelsRepository.update(channel.id, {
				collaboratorIds: [...collaboratorIds, userId],
			});
		}
	}

	@bindThis
	public async removeCollaborator(
		channel: MiChannel,
		userId: MiUser['id'],
	): Promise<void> {
		const collaboratorIds = channel.collaboratorIds ?? [];
		await this.channelsRepository.update(channel.id, {
			collaboratorIds: collaboratorIds.filter(id => id !== userId),
		});
	}

	@bindThis
	public async setCollaborators(
		channel: MiChannel,
		userIds: MiUser['id'][],
	): Promise<void> {
		await this.channelsRepository.update(channel.id, {
			collaboratorIds: userIds,
		});
	}

	@bindThis
	public async transferOwnership(
		channel: MiChannel,
		newOwnerId: MiUser['id'],
	): Promise<void> {
		const collaboratorIds = channel.collaboratorIds ?? [];
		const newCollaboratorIds = collaboratorIds.filter(id => id !== newOwnerId);
		if (channel.userId && !newCollaboratorIds.includes(channel.userId)) {
			newCollaboratorIds.push(channel.userId);
		}

		await this.channelsRepository.update(channel.id, {
			userId: newOwnerId,
			collaboratorIds: newCollaboratorIds,
		});
	}
}
