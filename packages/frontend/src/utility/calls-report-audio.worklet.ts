/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// AudioWorklet globals are not included in TypeScript's DOM library.
declare class AudioWorkletProcessor {
	readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class CallsReportAudioProcessor extends AudioWorkletProcessor {
	private samples = new Uint8Array(1200);
	private offset = 0;

	public process(inputs: Float32Array[][]): boolean {
		const channels = inputs[0];
		// The output remains silent; this node only captures the mixed input.
		for (let index = 0; index < 128; index++) {
			const sample = channels.length === 0 ? 0 : channels.reduce((sum, channel) => sum + channel[index], 0) / channels.length;
			this.samples[this.offset++] = Math.round((Math.max(-1, Math.min(1, sample)) + 1) * 127.5);
			if (this.offset === this.samples.length) {
				this.port.postMessage(this.samples, [this.samples.buffer]);
				this.samples = new Uint8Array(1200);
				this.offset = 0;
			}
		}
		return true;
	}
}

registerProcessor('calls-report-audio', CallsReportAudioProcessor);
