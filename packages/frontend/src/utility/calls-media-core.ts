/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { CallsMediaFailure } from './calls-media.js';

export function detectCallsMediaCapabilities() {
	return {
		secureContext: window.isSecureContext,
		getUserMedia: typeof navigator.mediaDevices?.getUserMedia === 'function',
		peerConnection: typeof window.RTCPeerConnection === 'function',
		transceiver: typeof window.RTCPeerConnection === 'function' && 'addTransceiver' in RTCPeerConnection.prototype,
		replaceTrack: typeof window.RTCRtpSender === 'function' && 'replaceTrack' in RTCRtpSender.prototype,
	};
}

export function normalizeCallsMediaError(error: unknown): CallsMediaFailure {
	if (!(error instanceof DOMException)) return 'hardware-failure';
	if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'permission-denied';
	if (error.name === 'NotFoundError') return 'device-not-found';
	if (error.name === 'OverconstrainedError') return 'constraint-mismatch';
	if (error.name === 'TimeoutError') return 'permission-pending';
	if (error.name === 'AbortError' || error.name === 'NotReadableError') return 'hardware-failure';
	return 'hardware-failure';
}

export function preferOpus<T extends { mimeType: string }>(codecs: T[]): T[] {
	return [...codecs].sort((left, right) => {
		const leftOpus = left.mimeType.toLowerCase() === 'audio/opus' ? 1 : 0;
		const rightOpus = right.mimeType.toLowerCase() === 'audio/opus' ? 1 : 0;
		return rightOpus - leftOpus;
	});
}

export type CallsNormalizedStats = {
	codec: string | null;
	candidateType: string | null;
	protocol: string | null;
	bitrate: number | null;
	packetsLost: number | null;
	jitter: number | null;
	roundTripTime: number | null;
	audioLevel: number | null;
	reconnectReason: 'failed' | 'disconnected' | 'stale-generation' | null;
	recoveryTimeMs: number | null;
};

export function normalizeCallsStats(
	report: { forEach(callback: (value: Record<string, unknown>) => void): void },
	previousBytes = 0,
	elapsedSeconds = 1,
	reconnect?: { reason: CallsNormalizedStats['reconnectReason']; recoveryTimeMs: number | null },
): CallsNormalizedStats {
	const stats: CallsNormalizedStats = { codec: null, candidateType: null, protocol: null, bitrate: null, packetsLost: null, jitter: null, roundTripTime: null, audioLevel: null, reconnectReason: reconnect?.reason ?? null, recoveryTimeMs: reconnect?.recoveryTimeMs ?? null };
	let bytes = 0;
	report.forEach(value => {
		if (value.type === 'codec' && typeof value.mimeType === 'string') stats.codec = value.mimeType;
		if (value.type === 'local-candidate' && typeof value.candidateType === 'string') {
			stats.candidateType = value.candidateType;
			stats.protocol = typeof value.protocol === 'string' ? value.protocol : null;
		}
		if (value.type === 'inbound-rtp' || value.type === 'outbound-rtp') {
			if (typeof value.bytesReceived === 'number') bytes += value.bytesReceived;
			if (typeof value.bytesSent === 'number') bytes += value.bytesSent;
			if (typeof value.packetsLost === 'number') stats.packetsLost = value.packetsLost;
			if (typeof value.jitter === 'number') stats.jitter = value.jitter;
			if (typeof value.roundTripTime === 'number') stats.roundTripTime = value.roundTripTime;
			if (typeof value.audioLevel === 'number') stats.audioLevel = value.audioLevel;
		}
		if ((value.type === 'media-source' || value.type === 'track') && typeof value.audioLevel === 'number') stats.audioLevel = value.audioLevel;
		if (value.type === 'remote-inbound-rtp' && typeof value.roundTripTime === 'number') stats.roundTripTime = value.roundTripTime;
	});
	if (elapsedSeconds > 0 && bytes >= previousBytes) stats.bitrate = ((bytes - previousBytes) * 8) / elapsedSeconds;
	return stats;
}
