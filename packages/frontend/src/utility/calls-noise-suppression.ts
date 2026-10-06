/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import simdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import type { RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';

export type CallsNoiseSuppression = {
	track: MediaStreamTrack;
	setEnabled: (enabled: boolean) => void;
	setMuted: (muted: boolean) => void;
	close: () => void;
};

export async function createCallsNoiseSuppression(stream: MediaStream, onError: (error: unknown) => void, signal: AbortSignal): Promise<CallsNoiseSuppression> {
	signal.throwIfAborted();
	if (typeof AudioWorkletNode !== 'function') throw new DOMException('AudioWorklet is unavailable', 'NotSupportedError');
	// RNNoise processes 480-sample frames at 48 kHz, regardless of the microphone's sample rate.
	const context = new AudioContext({ sampleRate: 48_000 });
	const abort = () => { void context.close().catch(error => console.error('[Calls] Audio context close failed', error)); };
	signal.addEventListener('abort', abort, { once: true });
	let node: RnnoiseWorkletNode | null = null;
	try {
		const { loadRnnoise, RnnoiseWorkletNode } = await import('@sapphi-red/web-noise-suppressor');
		const [wasmBinary] = await Promise.all([
			loadRnnoise({ url: wasmUrl, simdUrl: simdWasmUrl }, { signal }),
			context.audioWorklet.addModule(workletUrl),
			context.resume(),
		]);
		signal.throwIfAborted();
		node = new RnnoiseWorkletNode(context, { wasmBinary, maxChannels: 1 });
		node.channelCount = 1;
		node.channelCountMode = 'explicit';
		const processor = node;
		const source = context.createMediaStreamSource(stream);
		const destination = context.createMediaStreamDestination();
		destination.channelCount = 1;
		const track = destination.stream.getAudioTracks()[0];
		track.contentHint = 'speech';
		let failed = false;
		let closed = false;
		let muted: boolean | null = false;
		let processorConnected = true;
		processor.connect(destination);
		source.connect(destination);
		const setEnabled = (enabled: boolean) => {
			if (closed) return;
			if (enabled && failed) throw new Error('RNNoise processor is unavailable');
			// Keep the destination track stable: toggling needs neither capture nor replaceTrack.
			source.disconnect();
			if (enabled) {
				if (!processorConnected) {
					processor.connect(destination);
					processorConnected = true;
				}
				source.connect(processor);
			} else {
				if (processorConnected) {
					processor.disconnect();
					processorConnected = false;
				}
				source.connect(destination);
			}
		};
		processor.onprocessorerror = () => {
			if (closed) return;
			failed = true;
			setEnabled(false);
			onError(new Error('RNNoise audio processing failed'));
		};
		const setMuted = (nextMuted: boolean) => {
			if (closed || muted === nextMuted) return;
			muted = nextMuted;
			void (nextMuted ? context.suspend() : context.resume()).catch(error => {
				if (closed) return;
				// A failed transition must not suppress a retry of the same request.
				if (muted === nextMuted) muted = null;
				onError(error);
			});
		};
		return {
			track,
			setEnabled,
			setMuted,
			close() {
				if (closed) return;
				closed = true;
				signal.removeEventListener('abort', abort);
				processor.onprocessorerror = null;
				source.disconnect();
				processor.destroy();
				if (processorConnected) processor.disconnect();
				track.stop();
				void context.close().catch(error => console.error('[Calls] Audio context close failed', error));
			},
		};
	} catch (error) {
		signal.removeEventListener('abort', abort);
		node?.destroy();
		node?.disconnect();
		if (context.state !== 'closed') await context.close();
		throw error;
	}
}
