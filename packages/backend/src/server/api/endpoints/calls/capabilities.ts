/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
export const meta = { tags: ['calls'], stability: 'experimental', requireCredential: false, allowGet: true, cacheSec: 300, res: { type: 'object', optional: false, nullable: false, properties: {
	protocolVersion: { type: 'string', optional: false, nullable: false },
	mediaKinds: { type: 'array', optional: false, nullable: false, items: { type: 'string', enum: ['audio'] } },
	codecs: { type: 'array', optional: false, nullable: false, items: { type: 'string', enum: ['opus', 'pcma', 'pcmu'] } },
	roles: { type: 'array', optional: false, nullable: false, items: { type: 'string', enum: ['host', 'speaker', 'listener'] } },
	limits: { type: 'object', optional: false, nullable: false, properties: { speakers: { type: 'integer', optional: false, nullable: false }, listeners: { type: 'integer', optional: false, nullable: false }, tracksPerOperation: { type: 'integer', optional: false, nullable: false } } },
	turnAvailable: { type: 'boolean', optional: false, nullable: false },
	guestParticipation: { type: 'boolean', optional: false, nullable: false },
	extensions: { type: 'array', optional: false, nullable: false, items: { type: 'string' } },
} } } as const;
export const paramDef = { type: 'object', properties: {} } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(@Inject(DI.config) config: Config) {
		super(meta, paramDef, async () => ({
			protocolVersion: '1.0', mediaKinds: ['audio'] as const, codecs: ['opus', 'pcma', 'pcmu'] as const,
			roles: ['host', 'speaker', 'listener'] as const, limits: { speakers: 8, listeners: 100, tracksPerOperation: 64 },
			turnAvailable: config.cloudflareRealtime?.turn != null, guestParticipation: false, extensions: ['speaker-request', 'websocket-room-events'],
		}));
	}
}
