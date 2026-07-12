export type CallsCapabilityDocument = {
	protocolVersion: string;
	enabled?: boolean;
	mediaKinds: readonly string[];
	codecs: readonly string[];
	roles: readonly string[];
	turnAvailable: boolean;
	guestParticipation: boolean;
	extensions: readonly string[];
};

export type CallsCompatibility = { compatible: true; negotiatedMajor: number } | { compatible: false; reason: 'feature-disabled' | 'version-mismatch' | 'audio-unsupported' | 'opus-unsupported' | 'missing-extension' };

export function negotiateCallsCompatibility(capabilities: CallsCapabilityDocument, options: { supportedMajor?: number; requiredExtensions?: readonly string[] } = {}): CallsCompatibility {
	const supportedMajor = options.supportedMajor ?? 1;
	if (capabilities.enabled === false) return { compatible: false, reason: 'feature-disabled' };
	const serverMajor = Number.parseInt(capabilities.protocolVersion.split('.')[0] ?? '', 10);
	if (serverMajor !== supportedMajor) return { compatible: false, reason: 'version-mismatch' };
	if (!capabilities.mediaKinds.includes('audio')) return { compatible: false, reason: 'audio-unsupported' };
	if (!capabilities.codecs.includes('opus')) return { compatible: false, reason: 'opus-unsupported' };
	if ((options.requiredExtensions ?? []).some(extension => !capabilities.extensions.includes(extension))) return { compatible: false, reason: 'missing-extension' };
	return { compatible: true, negotiatedMajor: serverMajor };
}

export class CallsEventSequenceTracker {
	private lastSequence = 0;
	private lastRevision = 0;

	public accept(sequence: number, roomRevision = this.lastRevision): 'accepted' | 'duplicate' | 'gap' {
		if (sequence <= this.lastSequence) {
			if (roomRevision <= this.lastRevision) return 'duplicate';
			this.lastSequence = sequence;
			this.lastRevision = roomRevision;
			return 'gap';
		}
		if (this.lastSequence !== 0 && sequence !== this.lastSequence + 1) {
			this.lastSequence = sequence;
			this.lastRevision = Math.max(this.lastRevision, roomRevision);
			return 'gap';
		}
		this.lastSequence = sequence;
		this.lastRevision = Math.max(this.lastRevision, roomRevision);
		return 'accepted';
	}

	public reset(sequence = 0, roomRevision = 0): void { this.lastSequence = sequence; this.lastRevision = roomRevision; }
}

export function preferCallsOpus<T extends { mimeType: string }>(codecs: readonly T[]): T[] {
	return [...codecs].sort((left, right) => Number(right.mimeType.toLowerCase() === 'audio/opus') - Number(left.mimeType.toLowerCase() === 'audio/opus'));
}
