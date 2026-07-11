/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
	request: vi.fn(),
	handlers: new Map<string, (payload: Record<string, unknown>) => void>(),
	send: vi.fn(),
	dispose: vi.fn(),
	compatibility: { compatible: true, negotiatedMajor: 1 } as Record<string, unknown>,
}));

vi.mock('misskey-js', () => ({
	api: { APIClient: class { public request = fixture.request; } },
	Stream: class {
		public useChannel() {
			return {
				on: (event: string, handler: (payload: Record<string, unknown>) => void) => fixture.handlers.set(event, handler),
				send: fixture.send,
				dispose: fixture.dispose,
			};
		}
	},
	calls: {
		negotiateCallsCompatibility: () => fixture.compatibility,
		preferCallsOpus: <T>(codecs: T[]) => codecs,
		CallsEventSequenceTracker: class {
			private last = 0;
			public accept(sequence: number) {
				if (sequence <= this.last) return 'duplicate';
				const result = this.last !== 0 && sequence !== this.last + 1 ? 'gap' : 'accepted';
				this.last = sequence;
				return result;
			}
		},
	},
}));

import { CallsReferenceClient } from '../src/index.js';

class FakePeerConnection {
	public static instances: FakePeerConnection[] = [];
	public closed = false;
	constructor() { FakePeerConnection.instances.push(this); }
	public addTransceiver() { return { mid: '0', sender: { replaceTrack: vi.fn() }, setCodecPreferences: vi.fn() }; }
	public close() { this.closed = true; }
	public async createOffer() { return { type: 'offer' as const, sdp: 'offer' }; }
	public async createAnswer() { return { type: 'answer' as const, sdp: 'answer' }; }
	public async setLocalDescription() {}
	public async setRemoteDescription() {}
}

describe('third-party Calls protocol conformance', () => {
	beforeEach(() => {
		fixture.request.mockReset();
		fixture.handlers.clear();
		fixture.send.mockReset();
		fixture.dispose.mockReset();
		fixture.compatibility = { compatible: true, negotiatedMajor: 1 };
		FakePeerConnection.instances = [];
		vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
		vi.stubGlobal('RTCRtpReceiver', { getCapabilities: () => ({ codecs: [] }) });
		fixture.request.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'calls/capabilities') return { enabled: true, protocolVersion: '1.0' };
			if (endpoint === 'calls/rooms/join') return {};
			if (endpoint === 'calls/media/turn-credentials') return { iceServers: [], expiresAt: new Date(Date.now() + 60_000).toISOString() };
			if (endpoint === 'calls/media/session/create') return { participantId: 'participant-a', generation: 1, mediaCredential: 'credential' };
			if (endpoint === 'calls/media/reconcile') return { roomRevision: 1, publications: [] };
			if (endpoint === 'calls/rooms/show') return { room: {}, participants: [] };
			if (endpoint === 'calls/rooms/leave') return {};
			throw new Error(`unexpected endpoint: ${endpoint}`);
		});
	});

	test('negotiates capability, joins, creates media, heartbeats, reconciles a sequence gap, and honors revoke', async () => {
		const client = new CallsReferenceClient('https://misskey.example', 'token');
		await client.join('room-a');

		expect(fixture.request.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
			'calls/capabilities', 'calls/rooms/join', 'calls/media/session/create', 'calls/media/reconcile',
		]));
		fixture.handlers.get('lifecycle')?.({ sequence: 1, roomRevision: 1 });
		fixture.handlers.get('participant')?.({ sequence: 3, roomRevision: 2 });
		await vi.waitFor(() => expect(fixture.request).toHaveBeenCalledWith('calls/rooms/show', { roomId: 'room-a' }));

		fixture.handlers.get('revoked')?.({ sequence: 4, roomRevision: 3, reason: 'access' });
		expect(FakePeerConnection.instances.at(-1)?.closed).toBe(true);
		await client.close('room-a');
	});

	test('rejects an incompatible protocol before joining the room', async () => {
		fixture.compatibility = { compatible: false, reason: 'version-mismatch' };
		const client = new CallsReferenceClient('https://misskey.example', 'token');
		await expect(client.join('room-a')).rejects.toThrow('version-mismatch');
		expect(fixture.request).not.toHaveBeenCalledWith('calls/rooms/join', expect.anything());
	});

	test('rebuilds a fresh media generation after live-state loss', async () => {
		const client = new CallsReferenceClient('https://misskey.example', 'token');
		await client.join('room-a');
		fixture.handlers.get('revoked')?.({ sequence: 1, roomRevision: 1, participantId: 'participant-a', reason: 'stale-generation' });
		await vi.waitFor(() => expect(fixture.request.mock.calls.filter(call => call[0] === 'calls/media/session/create')).toHaveLength(2));
		await client.close('room-a');
	});
});
