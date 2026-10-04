/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import workletUrl from './calls-report-audio.worklet.ts?worker&url';

const sampleRate = 12000;
const windowSamples = sampleRate * 30;

export type CallsReportCapture = {
	recording: Promise<Blob | null>;
	cancel: () => void;
};

function encodeWav(chunks: Uint8Array[]): Blob | null {
	const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	if (length === 0) return null;
	const header = new ArrayBuffer(44);
	const view = new DataView(header);
	for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVEfmt '], [36, 'data']] as const) {
		for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
	}
	view.setUint32(4, 36 + length, true);
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate, true);
	view.setUint16(32, 1, true);
	view.setUint16(34, 8, true);
	view.setUint32(40, length, true);
	return new Blob([header, ...chunks.map(chunk => chunk.slice().buffer)], { type: 'audio/wav' });
}

/** Keeps only the last 30 seconds in memory. A report freezes that history and captures 30 more. */
export class CallsReportRecorder {
	private history: Uint8Array[] = [];
	private historyLength = 0;
	private sources = new Map<string, MediaStreamAudioSourceNode>();
	private context: AudioContext | null = null;
	private node: AudioWorkletNode | null = null;
	private pending: { chunks: Uint8Array[]; remaining: number; resolve: (blob: Blob | null) => void; timer: number } | null = null;
	private closed = false;

	public async start(): Promise<void> {
		const context = new AudioContext({ sampleRate });
		this.context = context;
		await context.audioWorklet.addModule(workletUrl);
		if (this.closed) return;
		const node = new AudioWorkletNode(context, 'calls-report-audio', { channelCount: 1, channelCountMode: 'explicit' });
		this.node = node;
		node.port.onmessage = (event: MessageEvent<Uint8Array>) => this.append(event.data);
		node.connect(context.destination);
		void context.resume().catch(error => console.error('[Calls] Report audio resume failed', error));
	}

	public get available(): boolean { return !this.closed && this.context?.state === 'running' && this.node != null; }

	public setTrack(id: string, track: MediaStreamTrack | null): void {
		this.sources.get(id)?.disconnect();
		this.sources.delete(id);
		if (track == null || this.context == null || this.node == null || this.closed) return;
		const source = this.context.createMediaStreamSource(new MediaStream([track]));
		source.connect(this.node);
		this.sources.set(id, source);
	}

	private append(samples: Uint8Array): void {
		if (this.closed) return;
		if (this.pending != null) {
			const chunk = samples.slice(0, this.pending.remaining);
			this.pending.chunks.push(chunk);
			this.pending.remaining -= chunk.length;
			if (this.pending.remaining === 0) this.finish();
		}
		this.history.push(samples);
		this.historyLength += samples.length;
		while (this.historyLength > windowSamples) {
			const first = this.history[0];
			const excess = this.historyLength - windowSamples;
			if (first.length <= excess) { this.history.shift(); this.historyLength -= first.length; } else { this.history[0] = first.slice(excess); this.historyLength -= excess; }
		}
	}

	public capture(): CallsReportCapture | null {
		if (!this.available || this.pending != null) return null;
		const recording = new Promise<Blob | null>(resolve => {
			this.pending = { chunks: [...this.history], remaining: windowSamples, resolve, timer: window.setTimeout(() => this.finish(), 30_000) };
		});
		const pending = this.pending;
		return { recording, cancel: () => { if (this.pending === pending) this.finish(true); } };
	}

	private finish(cancel = false): void {
		const pending = this.pending;
		if (pending == null) return;
		this.pending = null;
		window.clearTimeout(pending.timer);
		pending.resolve(cancel ? null : encodeWav(pending.chunks));
	}

	public resume(): Promise<void> { return this.context?.resume() ?? Promise.resolve(); }

	public close(): void {
		this.closed = true;
		this.finish();
		this.history = [];
		this.historyLength = 0;
		for (const source of this.sources.values()) source.disconnect();
		this.sources.clear();
		if (this.node != null) { this.node.port.onmessage = null; this.node.disconnect(); }
		void this.context?.close();
		this.context = null;
		this.node = null;
	}
}

export async function callsRecordingToBase64(recording: Blob): Promise<string> {
	const bytes = new Uint8Array(await recording.arrayBuffer());
	let binary = '';
	for (let offset = 0; offset < bytes.length; offset += 8192) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
	}
	return btoa(binary);
}
