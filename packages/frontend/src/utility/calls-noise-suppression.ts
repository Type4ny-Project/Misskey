/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import gateUrl from './calls-input-gate.worklet.js?url';
import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import simdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import type { RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';

export type CallsNoiseSuppressionMode = 'rnnoise' | 'webrtc' | 'none';

export type CallsNoiseSuppression = {
	track: MediaStreamTrack;
	setEnabled: (enabled: boolean) => Promise<void>;
	setInputSensitivity: (threshold: number) => void;
	setMuted: (muted: boolean) => void;
	close: () => void;
};

export async function createCallsNoiseSuppression(stream: MediaStream, onError: (error: unknown) => void, signal: AbortSignal, options: { rnnoise: boolean; inputSensitivity: number; onLevel?: (level: number, transmitting: boolean) => void } = { rnnoise: true, inputSensitivity: -100 }): Promise<CallsNoiseSuppression> {
	signal.throwIfAborted();
	if (typeof AudioWorkletNode !== 'function') throw new DOMException('AudioWorklet is unavailable', 'NotSupportedError');
	// RNNoise processes 480-sample frames at 48 kHz, regardless of the microphone's sample rate.
	const context = new AudioContext({ sampleRate: 48_000 });
	const abort = () => { void context.close().catch(error => console.error('[Calls] Audio context close failed', error)); };
	signal.addEventListener('abort', abort, { once: true });
	let node: RnnoiseWorkletNode | null = null;
	let outputTrack: MediaStreamTrack | null = null;
	try {
		await Promise.all([context.audioWorklet.addModule(gateUrl), context.resume()]);
		signal.throwIfAborted();
		const source = context.createMediaStreamSource(stream);
		const destination = context.createMediaStreamDestination();
		destination.channelCount = 1;
		const track = destination.stream.getAudioTracks()[0];
		outputTrack = track;
		track.contentHint = 'speech';
		const gate = new AudioWorkletNode(context, 'calls-input-gate', { channelCount: 1, outputChannelCount: [1], parameterData: { threshold: options.inputSensitivity } });
		gate.port.onmessage = event => options.onLevel?.(event.data.level, event.data.open);
		gate.connect(destination);
		source.connect(gate);
		let failed = false;
		let closed = false;
		let muted: boolean | null = false;
		let processorConnected = false;
		const setEnabled = async (enabled: boolean) => {
			if (closed) return;
			if (enabled && failed) throw new Error('RNNoise processor is unavailable');
			if (enabled && node == null) {
				const { loadRnnoise, RnnoiseWorkletNode } = await import('@sapphi-red/web-noise-suppressor');
				const [wasmBinary] = await Promise.all([
					loadRnnoise({ url: wasmUrl, simdUrl: simdWasmUrl }, { signal }),
					context.audioWorklet.addModule(workletUrl),
				]);
				signal.throwIfAborted();
				if (closed) return;
				node = new RnnoiseWorkletNode(context, { wasmBinary, maxChannels: 1 });
				node.channelCount = 1;
				node.channelCountMode = 'explicit';
				node.onprocessorerror = () => {
					if (closed) return;
					failed = true;
					void setEnabled(false);
					onError(new Error('RNNoise audio processing failed'));
				};
			}
			source.disconnect();
			if (enabled && node != null) {
				if (!processorConnected) { node.connect(gate); processorConnected = true; }
				source.connect(node);
			} else {
				if (processorConnected) { node?.disconnect(); processorConnected = false; }
				source.connect(gate);
			}
		};
		await setEnabled(options.rnnoise);
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
			setInputSensitivity(threshold) { gate.parameters.get('threshold')!.value = threshold; },
			close() {
				if (closed) return;
				closed = true;
				signal.removeEventListener('abort', abort);
				if (node != null) node.onprocessorerror = null;
				gate.port.onmessage = null;
				gate.disconnect();
				source.disconnect();
				node?.destroy();
				if (processorConnected) node?.disconnect();
				track.stop();
				void context.close().catch(error => console.error('[Calls] Audio context close failed', error));
			},
		};
	} catch (error) {
		signal.removeEventListener('abort', abort);
		const processor = node as RnnoiseWorkletNode | null;
		processor?.destroy();
		processor?.disconnect();
		outputTrack?.stop();
		if (context.state !== 'closed') await context.close();
		throw error;
	}
}
