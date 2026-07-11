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
