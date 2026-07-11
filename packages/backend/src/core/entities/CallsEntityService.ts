/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type { MiCallsParticipant, MiCallsRoom } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';

@Injectable()
export class CallsEntityService {
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
}
