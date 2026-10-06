/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { runInNewContext } from 'node:vm';
import { expect, test, vi } from 'vitest';
import gateSource from '@/utility/calls-input-gate.worklet.js?raw';

function createGate() {
	const messages = vi.fn();
	let Processor!: new () => { process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: { threshold: Float32Array; inputGain: Float32Array }): boolean };
	runInNewContext(gateSource, {
		AudioWorkletProcessor: class { port = { postMessage: messages }; },
		sampleRate: 48_000,
		registerProcessor(_name: string, processor: typeof Processor) { Processor = processor; },
	});
	const gate = new Processor();
	return {
		messages,
		process(amplitude: number, threshold: number, frames = 128, inputGain = 1) {
			const output = new Float32Array(frames);
			gate.process([[new Float32Array(frames).fill(amplitude)]], [[output]], { threshold: new Float32Array([threshold]), inputGain: new Float32Array([inputGain]) });
			return output;
		},
	};
}

test('blocks quiet input, transmits voice, and keeps word endings for 200 ms', () => {
	const gate = createGate();
	expect(gate.process(0.001, -40).every(sample => sample === 0)).toBe(true);
	expect(gate.process(0.1, -40).at(-1)).toBeGreaterThan(0.05);
	expect(gate.process(0.001, -40).at(-1)).toBeGreaterThan(0.0005);
	for (let index = 0; index < 120; index++) gate.process(0.001, -40);
	expect(gate.process(0.001, -40).at(-1)).toBeLessThan(0.000001);
	expect(gate.messages).toHaveBeenCalledWith(expect.objectContaining({ level: expect.closeTo(-60), open: false }));
});

test('changes the threshold live and bypasses the gate at its disabled setting', () => {
	const gate = createGate();
	expect(gate.process(0.01, -30).every(sample => sample === 0)).toBe(true);
	expect(gate.process(0.01, -50).at(-1)).toBeGreaterThan(0.005);
	expect(gate.process(0.001, -100, 4800).at(-1)).toBeCloseTo(0.001);
});

test('applies microphone gain independently of the gate and reports its adjusted level', () => {
	const gate = createGate();
	expect(gate.process(0.1, -100, 4800, 0.5).at(-1)).toBeCloseTo(0.05);
	expect(gate.process(0.1, -100, 4800, 2).at(-1)).toBeCloseTo(0.2);
	expect(gate.process(0.1, -100, 4800, 0).every(value => value === 0)).toBe(true);
	expect(gate.messages).toHaveBeenLastCalledWith({ level: -100, open: false });
});
