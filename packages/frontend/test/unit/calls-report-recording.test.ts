/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CallsReportRecorder, callsRecordingToBase64 } from '@/utility/calls-report-recording.js';

let port: { onmessage: ((event: { data: Uint8Array }) => void) | null };
let recorder: CallsReportRecorder;
const disconnect = vi.fn();
const contextClose = vi.fn().mockResolvedValue(undefined);

function append(seconds: number, value: number): void {
	for (let i = 0; i < seconds * 10; i++) port.onmessage?.({ data: new Uint8Array(1200).fill(value) });
}

beforeEach(async () => {
	vi.useFakeTimers();
	vi.stubGlobal('AudioContext', class {
		public state = 'running';
		public destination = {};
		public audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
		public resume = vi.fn().mockResolvedValue(undefined);
		public close = contextClose;
		public createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect }));
	});
	vi.stubGlobal('AudioWorkletNode', class {
		public port = { onmessage: null };
		public connect = vi.fn();
		public disconnect = vi.fn();
		constructor() { port = this.port; }
	});
	recorder = new CallsReportRecorder();
	await recorder.start();
});

afterEach(() => {
	recorder.close();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('Calls report recording', () => {
	test('keeps only 30 seconds before the report and includes 30 seconds after it in a playable WAV', async () => {
		append(10, 10);
		append(30, 80);
		const capture = recorder.capture()!;
		append(30, 160);
		const blob = (await capture.recording)!;
		const wav = new Uint8Array(await blob.arrayBuffer());
		const header = new DataView(wav.buffer);
		expect(blob.type).toBe('audio/wav');
		expect(wav.length).toBe(720044);
		expect(header.getUint32(24, true)).toBe(12000);
		expect([...wav.slice(44, 48)]).toEqual([80, 80, 80, 80]);
		expect([...wav.slice(360044, 360048)]).toEqual([160, 160, 160, 160]);
		expect((await callsRecordingToBase64(blob)).length).toBeLessThan(1024 * 1024 - 4096);
	});

	test('finishes with the audio available when the call ends', async () => {
		append(5, 80);
		const capture = recorder.capture()!;
		append(2, 160);
		recorder.close();
		expect((await capture.recording)?.size).toBe(44 + 7 * 12000);
		expect(recorder.capture()).toBeNull();
	});

	test('finishes after 30 seconds even when audio processing is suspended', async () => {
		append(3, 80);
		const capture = recorder.capture()!;
		await vi.advanceTimersByTimeAsync(30_000);
		expect((await capture.recording)?.size).toBe(44 + 3 * 12000);
	});

	test('discards a cancelled capture without cancelling a later report', async () => {
		append(1, 80);
		const first = recorder.capture()!;
		first.cancel();
		expect(await first.recording).toBeNull();
		const second = recorder.capture()!;
		first.cancel();
		append(1, 160);
		recorder.close();
		expect((await second.recording)?.size).toBe(44 + 2 * 12000);
	});
});
