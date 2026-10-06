/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { MiCallsParticipant, MiCallsRoom, MiUser } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';

@Injectable()
export class CallsEntityService {
	constructor(private userEntityService: UserEntityService) {}

	public packRoom(room: MiCallsRoom): Packed<'CallsRoom'> {
		return {
			id: room.id,
			attachment: room.attachmentType === 'personal' ? {
				type: 'personal', ownerUserId: room.ownerUserId,
			} : {
				type: 'chatRoom', ownerUserId: room.ownerUserId, chatRoomId: room.chatRoomId!,
			},
			title: room.title,
			description: room.description,
			moderatorUserIds: room.moderatorUserIds,
			mode: room.mode,
			visibility: room.visibility,
			state: room.state,
			scheduledAt: room.scheduledAt?.toISOString() ?? null,
			startedAt: room.startedAt?.toISOString() ?? null,
			endedAt: room.endedAt?.toISOString() ?? null,
			revision: room.revision,
			createdAt: room.createdAt.toISOString(),
			updatedAt: room.updatedAt.toISOString(),
		};
	}

	public packParticipant(participant: MiCallsParticipant): Packed<'CallsParticipant'> {
		return {
			id: participant.id,
			roomId: participant.roomId,
			userId: participant.userId,
			role: participant.role,
			state: participant.state,
			isMuted: participant.isMuted,
			joinedAt: participant.joinedAt.toISOString(),
			leftAt: participant.leftAt?.toISOString() ?? null,
			speakerRequestedAt: participant.speakerRequestedAt?.toISOString() ?? null,
		};
	}

	public async packParticipants(participants: MiCallsParticipant[], me: MiUser) {
		const userIds = participants.map(participant => participant.userId);
		const [users, relations] = userIds.length > 0
			? await Promise.all([
				this.userEntityService.packMany(userIds, me, { schema: 'UserLite' }),
				this.userEntityService.getRelations(me.id, userIds),
			])
			: [[], new Map()] as const;
		const usersById = new Map(users.map(user => [user.id, user]));

		return participants.map(participant => {
			const user = usersById.get(participant.userId);
			return {
				...this.packParticipant(participant),
				user: user == null ? null : {
					...user,
					isFollowing: relations.get(user.id)?.isFollowing ?? false,
					isFollowed: relations.get(user.id)?.isFollowed ?? false,
				},
			};
		});
	}
}
