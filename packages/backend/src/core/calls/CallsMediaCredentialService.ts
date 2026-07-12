/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';

export type CallsMediaCredentialClaims = {
	v: 1;
	iss: string;
	userId: string;
	applicationId: string;
	roomId: string;
	participantId: string;
	connectionId: string;
	generation: number;
	mediaKinds: ['audio'];
	canPublish: boolean;
	exp: number;
	nonce: string;
};

export class InvalidCallsMediaCredentialError extends Error {}

@Injectable()
export class CallsMediaCredentialService {
	private static readonly lifetimeSeconds = 300;

	constructor(@Inject(DI.config) private config: Config) {}

	public issue(input: Omit<CallsMediaCredentialClaims, 'v' | 'iss' | 'mediaKinds' | 'exp' | 'nonce'>): { credential: string; expiresAt: string } {
		const exp = Math.floor(Date.now() / 1000) + CallsMediaCredentialService.lifetimeSeconds;
		const claims: CallsMediaCredentialClaims = {
			...input, v: 1, iss: this.config.url, mediaKinds: ['audio'], exp, nonce: crypto.randomUUID(),
		};
		const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
		const signature = this.sign(payload);
		return { credential: `${payload}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() };
	}

	public verify(credential: string, expected: Pick<CallsMediaCredentialClaims, 'userId' | 'applicationId' | 'roomId' | 'participantId' | 'connectionId' | 'generation'> & { publish?: boolean }): CallsMediaCredentialClaims {
		const [payload, signature, extra] = credential.split('.');
		if (payload == null || signature == null || extra != null) throw new InvalidCallsMediaCredentialError();
		const expectedSignature = this.sign(payload);
		const actualBuffer = Buffer.from(signature);
		const expectedBuffer = Buffer.from(expectedSignature);
		if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) throw new InvalidCallsMediaCredentialError();
		let claims: CallsMediaCredentialClaims;
		try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as CallsMediaCredentialClaims; } catch { throw new InvalidCallsMediaCredentialError(); }
		if (claims.v !== 1 || claims.iss !== this.config.url || claims.exp <= Math.floor(Date.now() / 1000) ||
			claims.userId !== expected.userId || claims.applicationId !== expected.applicationId || claims.roomId !== expected.roomId ||
			claims.participantId !== expected.participantId || claims.connectionId !== expected.connectionId || claims.generation !== expected.generation ||
			(expected.publish === true && !claims.canPublish)) throw new InvalidCallsMediaCredentialError();
		return claims;
	}

	private sign(payload: string): string {
		const secret = this.config.cloudflareRealtime?.appSecret;
		if (secret == null) throw new InvalidCallsMediaCredentialError();
		return createHmac('sha256', secret).update(payload).digest('base64url');
	}
}
