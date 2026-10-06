/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* global AudioWorkletProcessor, sampleRate, registerProcessor */

class CallsInputGate extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [{ name: 'threshold', defaultValue: -100, minValue: -100, maxValue: 0, automationRate: 'k-rate' }, { name: 'inputGain', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' }];
	}

	constructor() {
		super();
		this.hold = 0;
		this.gain = 0;
		this.reportFrames = 0;
	}

	process(inputs, outputs, parameters) {
		const input = inputs[0]?.[0];
		const output = outputs[0]?.[0];
		if (input == null || output == null) return true;
		let power = 0;
		for (const sample of input) power += sample * sample;
		const inputGain = parameters.inputGain[0];
		const rms = Math.sqrt(power / input.length) * inputGain;
		const threshold = parameters.threshold[0];
		if (threshold <= -100 || rms >= Math.pow(10, threshold / 20)) this.hold = sampleRate * 0.2;
		else this.hold = Math.max(0, this.hold - input.length);
		const open = this.hold > 0 && inputGain > 0;
		// Keep word endings audible and ramp the gain to avoid clicks at the gate boundary.
		for (let index = 0; index < output.length; index++) {
			this.gain += ((open ? 1 : 0) - this.gain) * 0.01;
			output[index] = input[index] * inputGain * this.gain;
		}
		this.reportFrames += input.length;
		if (this.reportFrames >= sampleRate / 10) {
			this.reportFrames = 0;
			this.port.postMessage({ level: Math.max(-100, 20 * Math.log10(rms || 0.00001)), open });
		}
		return true;
	}
}

registerProcessor('calls-input-gate', CallsInputGate);
