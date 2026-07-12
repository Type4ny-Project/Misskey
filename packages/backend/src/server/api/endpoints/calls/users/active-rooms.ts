/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type { MiUser } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { CallsRoomService } from '@/core/calls/CallsRoomService.js';

export const meta = {
	tags: ['calls'], stability: 'experimental', requireCredential: true, kind: 'read:calls',
	res: { type: 'array', optional: false, nullable: false, items: { type: 'object', optional: false, nullable: false, properties: {
		userId: { type: 'string', format: 'id', optional: false, nullable: false },
		roomId: { type: 'string', format: 'id', optional: false, nullable: false },
	} } },
} as const;

export const paramDef = {
	type: 'object', properties: { userIds: { type: 'array', minItems: 1, maxItems: 100, uniqueItems: true, items: { type: 'string', format: 'misskey:id' } } }, required: ['userIds'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsRoomService) {
		super(meta, paramDef, async (ps, me) => service.listActiveRoomsForUsers(me, ps.userIds));
	}
}
