/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createCallsNoiseSuppression } from '@/utility/calls-noise-suppression.js';

const fixture = vi.hoisted(() => ({
	load: vi.fn(),
	processor: { connect: vi.fn(), disconnect: vi.fn(), destroy: vi.fn(), onprocessorerror: null as (() => void) | null },
}));
vi.mock('@sapphi-red/web-noise-suppressor', () => ({
	loadRnnoise: fixture.load,
	RnnoiseWorkletNode: class { constructor() { return fixture.processor; } },
}));

const gate = { connect: vi.fn(), disconnect: vi.fn(), port: { onmessage: null }, parameters: new Map([['threshold', { value: -100 }], ['inputGain', { value: 1 }]]) };
const source = { connect: vi.fn(), disconnect: vi.fn() };
const track = { stop: vi.fn(), contentHint: '' } as unknown as MediaStreamTrack;
const destination = { channelCount: 2, stream: { getAudioTracks: () => [track] } };
const context = {
	state: 'running',
	audioWorklet: { addModule: vi.fn() },
	resume: vi.fn(),
	suspend: vi.fn(),
	close: vi.fn(),
	createMediaStreamSource: vi.fn(() => source),
	createMediaStreamDestination: vi.fn(() => destination),
};
const input = {} as MediaStream;

beforeEach(() => {
	vi.clearAllMocks();
	fixture.load.mockReset().mockResolvedValue(new ArrayBuffer(0));
	fixture.processor.onprocessorerror = null;
	context.state = 'running';
	context.audioWorklet.addModule.mockReset().mockResolvedValue(undefined);
	context.resume.mockResolvedValue(undefined);
	context.suspend.mockResolvedValue(undefined);
	context.close.mockImplementation(async () => { context.state = 'closed'; });
	vi.stubGlobal('AudioContext', vi.fn(class {
		constructor() { return context; }
	}));
	vi.stubGlobal('AudioWorkletNode', class { constructor() { return gate; } });
});

afterEach(() => vi.unstubAllGlobals());

describe('Calls RNNoise audio graph', () => {
	test('routes processed and bypass audio to the same mono output track and releases its resources', async () => {
		const abort = new AbortController();
		const processing = await createCallsNoiseSuppression(input, vi.fn(), abort.signal);
		expect(AudioContext).toHaveBeenCalledWith({ sampleRate: 48_000 });
		expect(fixture.load).toHaveBeenCalledWith({ url: expect.stringContaining('rnnoise.wasm'), simdUrl: expect.stringContaining('rnnoise_simd.wasm') }, { signal: abort.signal });
		expect(context.audioWorklet.addModule).toHaveBeenCalledWith(expect.stringContaining('workletProcessor.js'));
		expect(context.resume).toHaveBeenCalledOnce();
		expect(fixture.processor.connect).toHaveBeenCalledWith(gate);
		expect(gate.connect).toHaveBeenCalledWith(destination);
		expect(destination.channelCount).toBe(1);
		await processing.setEnabled(true);
		expect(source.connect).toHaveBeenLastCalledWith(fixture.processor);
		await processing.setEnabled(false);
		expect(source.connect).toHaveBeenLastCalledWith(gate);
		await processing.setEnabled(true);
		expect(processing.track).toBe(track);
		expect(track.stop).not.toHaveBeenCalled();
		expect(fixture.processor.connect).toHaveBeenCalledTimes(2);
		processing.setMuted(true);
		expect(context.suspend).toHaveBeenCalledOnce();
		processing.setMuted(true);
		expect(context.suspend).toHaveBeenCalledOnce();
		processing.setMuted(false);
		expect(context.resume).toHaveBeenCalledTimes(2);
		processing.close();
		processing.close();
		expect(track.stop).toHaveBeenCalledOnce();
		expect(fixture.processor.destroy).toHaveBeenCalledOnce();
		expect(fixture.processor.disconnect).toHaveBeenCalledTimes(2);
		expect(context.close).toHaveBeenCalledOnce();
	});

	test.each([true, false])('retries the same mute state %s after its context transition fails', async nextMuted => {
		const onError = vi.fn();
		const processing = await createCallsNoiseSuppression(input, onError, new AbortController().signal);
		processing.setMuted(!nextMuted);
		const transition = nextMuted ? context.suspend : context.resume;
		const previousCalls = transition.mock.calls.length;
		const error = new Error('Audio device transition failed');
		transition.mockRejectedValueOnce(error);
		processing.setMuted(nextMuted);
		await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
		processing.setMuted(nextMuted);
		expect(transition).toHaveBeenCalledTimes(previousCalls + 2);
		expect(processing.track).toBe(track);
		processing.close();
	});

	test('a processor error bypasses RNNoise without replacing the output or interrupting the call', async () => {
		const onError = vi.fn();
		const processing = await createCallsNoiseSuppression(input, onError, new AbortController().signal);
		await processing.setEnabled(true);
		fixture.processor.onprocessorerror?.();
		expect(onError).toHaveBeenCalledWith(expect.any(Error));
		expect(source.connect).toHaveBeenLastCalledWith(gate);
		expect(processing.track).toBe(track);
		expect(track.stop).not.toHaveBeenCalled();
		await expect(processing.setEnabled(true)).rejects.toThrow('RNNoise processor is unavailable');
		processing.close();
	});

	test('bypass mode loads RNNoise only when enabled and adjusts the gate in place', async () => {
		const processing = await createCallsNoiseSuppression(input, vi.fn(), new AbortController().signal, { rnnoise: false, inputSensitivity: -45 });
		expect(fixture.load).not.toHaveBeenCalled();
		processing.setInputSensitivity(-35);
		expect(gate.parameters.get('threshold')?.value).toBe(-35);
		await processing.setEnabled(true);
		expect(fixture.load).toHaveBeenCalledOnce();
		expect(processing.track).toBe(track);
		processing.close();
	});

	test('WASM load failure closes the AudioContext', async () => {
		fixture.load.mockRejectedValueOnce(new Error('Download failed'));
		await expect(createCallsNoiseSuppression(input, vi.fn(), new AbortController().signal)).rejects.toThrow('Download failed');
		expect(context.close).toHaveBeenCalledOnce();
	});

	test('cancelling initialization closes the context before the worklet finishes loading', async () => {
		let finishLoading!: () => void;
		context.audioWorklet.addModule.mockImplementationOnce(() => new Promise<void>(resolve => { finishLoading = resolve; }));
		const abort = new AbortController();
		const loading = createCallsNoiseSuppression(input, vi.fn(), abort.signal);
		await vi.waitFor(() => expect(finishLoading).toBeTypeOf('function'));
		abort.abort();
		expect(context.close).toHaveBeenCalledOnce();
		finishLoading();
		await expect(loading).rejects.toThrow();
		expect(context.createMediaStreamDestination).not.toHaveBeenCalled();
		expect(context.close).toHaveBeenCalledOnce();
	});
});
