import { describe, expect, test } from 'vitest';
import { CallsEventSequenceTracker, negotiateCallsCompatibility, preferCallsOpus } from '../src/calls.js';

const capabilities = { protocolVersion: '1.0', mediaKinds: ['audio'], codecs: ['opus'], roles: ['host', 'speaker', 'listener'], turnAvailable: true, guestParticipation: false, extensions: ['websocket-room-events'] };

describe('Calls public helpers', () => {
	test('negotiates the provider-neutral protocol', () => {
		expect(negotiateCallsCompatibility(capabilities, { requiredExtensions: ['websocket-room-events'] })).toEqual({ compatible: true, negotiatedMajor: 1 });
		expect(negotiateCallsCompatibility({ ...capabilities, protocolVersion: '2.0' })).toEqual({ compatible: false, reason: 'version-mismatch' });
		expect(negotiateCallsCompatibility({ ...capabilities, enabled: false })).toEqual({ compatible: false, reason: 'feature-disabled' });
	});

	test('detects sequence gaps and duplicates', () => {
		const tracker = new CallsEventSequenceTracker();
		expect(tracker.accept(10)).toBe('accepted');
		expect(tracker.accept(10)).toBe('duplicate');
		expect(tracker.accept(12)).toBe('gap');
		expect(tracker.accept(13)).toBe('accepted');
		expect(tracker.accept(1, 2)).toBe('gap');
		expect(tracker.accept(1, 2)).toBe('duplicate');
	});

	test('keeps auxiliary codecs while preferring Opus', () => {
		const codecs = [{ mimeType: 'audio/red' }, { mimeType: 'audio/opus' }, { mimeType: 'audio/PCMU' }];
		expect(preferCallsOpus(codecs).map(codec => codec.mimeType)).toEqual(['audio/opus', 'audio/red', 'audio/PCMU']);
	});
});
