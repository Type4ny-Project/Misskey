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
	vi.stubGlobal('AudioWorkletNode', class {});
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
		expect(fixture.processor.connect).toHaveBeenCalledWith(destination);
		expect(destination.channelCount).toBe(1);
		processing.setEnabled(true);
		expect(source.connect).toHaveBeenLastCalledWith(fixture.processor);
		processing.setEnabled(false);
		expect(source.connect).toHaveBeenLastCalledWith(destination);
		processing.setEnabled(true);
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

	test('a processor error bypasses RNNoise without replacing the output or interrupting the call', async () => {
		const onError = vi.fn();
		const processing = await createCallsNoiseSuppression(input, onError, new AbortController().signal);
		processing.setEnabled(true);
		fixture.processor.onprocessorerror?.();
		expect(onError).toHaveBeenCalledWith(expect.any(Error));
		expect(source.connect).toHaveBeenLastCalledWith(destination);
		expect(processing.track).toBe(track);
		expect(track.stop).not.toHaveBeenCalled();
		expect(() => processing.setEnabled(true)).toThrow('RNNoise processor is unavailable');
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
