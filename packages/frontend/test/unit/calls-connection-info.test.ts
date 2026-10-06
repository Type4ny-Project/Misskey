/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { getCallsConnectionInfo } from '@/utility/calls-connection-info.js';

function report(values: Record<string, unknown>[]): RTCStatsReport {
	return new Map(values.map(value => [value.id, value])) as RTCStatsReport;
}

describe('Calls connection information', () => {
	test('uses the selected pair and aggregates send and receive loss', () => {
		const stats = report([
			{ id: 'transport', type: 'transport', selectedCandidatePairId: 'selected' },
			{ id: 'selected', type: 'candidate-pair', localCandidateId: 'local', remoteCandidateId: 'remote', currentRoundTripTime: 0.021 },
			{ id: 'local', type: 'local-candidate', candidateType: 'srflx', protocol: 'udp' },
			{ id: 'remote', type: 'remote-candidate', candidateType: 'host' },
			{ id: 'unused', type: 'local-candidate', candidateType: 'relay', protocol: 'tcp' },
			{ id: 'audio-out', type: 'outbound-rtp', packetsSent: 1000 },
			{ id: 'remote-audio', type: 'remote-inbound-rtp', localId: 'audio-out', packetsLost: 1 },
			{ id: 'audio-in', type: 'inbound-rtp', packetsReceived: 990, packetsLost: 10 },
			{ id: 'video-in', type: 'inbound-rtp', packetsReceived: 1000, packetsLost: 0 },
		]);
		expect(getCallsConnectionInfo(stats, 'connected', [])).toMatchObject({ relay: false, protocol: 'udp', roundTripTime: 0.021, sendLoss: 0.1, receiveLoss: 0.5 });
	});

	test('shows TURN ports without credentials and identifies the relay transport', () => {
		const stats = report([
			{ id: 'pair', type: 'candidate-pair', state: 'succeeded', nominated: true, localCandidateId: 'local', remoteCandidateId: 'remote' },
			{ id: 'local', type: 'local-candidate', candidateType: 'relay', protocol: 'udp', relayProtocol: 'tls' },
			{ id: 'remote', type: 'remote-candidate', candidateType: 'host' },
		]);
		const info = getCallsConnectionInfo(stats, 'connected', [{ username: 'secret-user', credential: 'secret-password', urls: ['stun:stun.cloudflare.com:3478', 'turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:443?transport=udp', 'turn:turn.cloudflare.com:80?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp'] }]);
		expect(info).toMatchObject({ relay: true, protocol: 'tls', turnServers: [{ host: 'turn.cloudflare.com', udp: ['3478', '443'], tcp: ['80'], tls: ['443'] }] });
		expect(JSON.stringify(info)).not.toContain('secret');
	});

	test('leaves measurements unavailable before media traffic starts', () => {
		expect(getCallsConnectionInfo(report([]), 'new', [])).toMatchObject({ relay: null, protocol: null, roundTripTime: null, sendLoss: null, receiveLoss: null });
	});
});
