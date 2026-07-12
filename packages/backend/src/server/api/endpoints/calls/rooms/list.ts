/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CallsRoomService } from '@/core/calls/CallsRoomService.js';
import { CallsEntityService } from '@/core/entities/CallsEntityService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
export const meta = { tags: ['calls'], stability: 'experimental', requireCredential: true, kind: 'read:calls', res: { type: 'array', optional: false, nullable: false, items: { type: 'object', optional: false, nullable: false, ref: 'CallsRoom' } } } as const;
export const paramDef = { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, chatRoomId: { type: 'string', format: 'misskey:id' }, states: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 2, items: { type: 'string', enum: ['scheduled', 'open'] } } } } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(service: CallsRoomService, entity: CallsEntityService) { super(meta, paramDef, async (ps, me) => (await service.listDiscoverable(me, ps.limit, ps.chatRoomId, ps.states)).map(entity.packRoom)); }
}
