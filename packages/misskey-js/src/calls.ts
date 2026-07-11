export type CallsCapabilityDocument = {
	protocolVersion: string;
	mediaKinds: readonly string[];
	codecs: readonly string[];
	roles: readonly string[];
	turnAvailable: boolean;
	guestParticipation: boolean;
	extensions: readonly string[];
};

export type CallsCompatibility = { compatible: true; negotiatedMajor: number } | { compatible: false; reason: 'version-mismatch' | 'audio-unsupported' | 'opus-unsupported' | 'missing-extension' };

export function negotiateCallsCompatibility(capabilities: CallsCapabilityDocument, options: { supportedMajor?: number; requiredExtensions?: readonly string[] } = {}): CallsCompatibility {
	const supportedMajor = options.supportedMajor ?? 1;
	const serverMajor = Number.parseInt(capabilities.protocolVersion.split('.')[0] ?? '', 10);
	if (serverMajor !== supportedMajor) return { compatible: false, reason: 'version-mismatch' };
	if (!capabilities.mediaKinds.includes('audio')) return { compatible: false, reason: 'audio-unsupported' };
	if (!capabilities.codecs.includes('opus')) return { compatible: false, reason: 'opus-unsupported' };
	if ((options.requiredExtensions ?? []).some(extension => !capabilities.extensions.includes(extension))) return { compatible: false, reason: 'missing-extension' };
	return { compatible: true, negotiatedMajor: serverMajor };
}

export class CallsEventSequenceTracker {
	private lastSequence = 0;

	public accept(sequence: number): 'accepted' | 'duplicate' | 'gap' {
		if (sequence <= this.lastSequence) return 'duplicate';
		if (this.lastSequence !== 0 && sequence !== this.lastSequence + 1) {
			this.lastSequence = sequence;
			return 'gap';
		}
		this.lastSequence = sequence;
		return 'accepted';
	}

	public reset(sequence = 0): void { this.lastSequence = sequence; }
}

export function preferCallsOpus<T extends { mimeType: string }>(codecs: readonly T[]): T[] {
	return [...codecs].sort((left, right) => Number(right.mimeType.toLowerCase() === 'audio/opus') - Number(left.mimeType.toLowerCase() === 'audio/opus'));
}
