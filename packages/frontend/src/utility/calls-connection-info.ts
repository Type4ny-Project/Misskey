/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type CallsConnectionInfo = {
	state: RTCPeerConnectionState;
	turnServers: { host: string; udp: string[]; tcp: string[]; tls: string[] }[];
	relay: boolean | null;
	protocol: string | null;
	roundTripTime: number | null;
	sendLoss: number | null;
	receiveLoss: number | null;
};

export function getCallsConnectionInfo(report: RTCStatsReport, state: RTCPeerConnectionState, servers: RTCIceServer[]): CallsConnectionInfo {
	const values: {
		id: string; type: string; selectedCandidatePairId?: string; localCandidateId?: string; remoteCandidateId?: string;
		state?: string; selected?: boolean; nominated?: boolean; candidateType?: string; protocol?: string; relayProtocol?: string;
		currentRoundTripTime?: number; packetsLost?: number; packetsReceived?: number; packetsSent?: number; localId?: string;
	}[] = [];
	report.forEach(value => values.push(value));
	const pairId = values.find(value => value.type === 'transport' && value.selectedCandidatePairId)?.selectedCandidatePairId;
	const pair = values.find(value => value.id === pairId) ?? values.find(value => value.type === 'candidate-pair' && value.state === 'succeeded' && (value.selected || value.nominated));
	const local = values.find(value => value.id === pair?.localCandidateId);
	const remote = values.find(value => value.id === pair?.remoteCandidateId);
	const relay = local == null || remote == null ? null : local.candidateType === 'relay' || remote.candidateType === 'relay';
	const turnServers: CallsConnectionInfo['turnServers'] = [];
	for (const server of servers) {
		for (const url of typeof server.urls === 'string' ? [server.urls] : server.urls) {
			const match = /^(turns?):(\[[^\]]+\]|[^:?]+)(?::(\d+))?(?:\?transport=(udp|tcp))?$/.exec(url);
			if (match == null) continue;
			const [, scheme, host, port, transport] = match;
			let entry = turnServers.find(value => value.host === host);
			if (entry == null) { entry = { host, udp: [], tcp: [], tls: [] }; turnServers.push(entry); }
			const ports = entry[scheme === 'turns' ? 'tls' : transport === 'tcp' ? 'tcp' : 'udp'];
			const resolvedPort = port ?? (scheme === 'turns' ? '5349' : '3478');
			if (!ports.includes(resolvedPort)) ports.push(resolvedPort);
		}
	}

	function loss(type: string): number | null {
		let lost = 0;
		let total = 0;
		for (const value of values.filter(value => value.type === type && typeof value.packetsLost === 'number')) {
			const sent = values.find(outbound => outbound.id === value.localId)?.packetsSent;
			const count = type === 'inbound-rtp' ? (value.packetsReceived ?? NaN) + Math.max(0, value.packetsLost!) : sent;
			if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue;
			lost += Math.max(0, value.packetsLost!);
			total += count;
		}
		return total > 0 ? Math.min(100, lost / total * 100) : null;
	}

	return {
		state, turnServers, relay,
		protocol: local?.candidateType === 'relay' ? local.relayProtocol ?? local.protocol ?? null : local?.protocol ?? null,
		roundTripTime: typeof pair?.currentRoundTripTime === 'number' ? pair.currentRoundTripTime : null,
		sendLoss: loss('remote-inbound-rtp'), receiveLoss: loss('inbound-rtp'),
	};
}
