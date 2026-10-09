/*
	* SPDX-FileCopyrightText: syuilo and misskey-project
	* SPDX-License-Identifier: AGPL-3.0-only
	*/

import { chromium } from 'playwright';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

(async () => {
	const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/utility/calls-audio-output.ts', import.meta.url))], bundle: true, format: 'iife', globalName: 'CallsOutput', write: false });
	const browser = await chromium.launch({headless: true, executablePath: process.env.CALLS_CHROMIUM_EXECUTABLE});
	try {
		const page = await browser.newPage();
		await page.setContent('<button id="start">Start audio</button>');
		await page.addScriptTag({content: bundle.outputFiles[0].text});
		await page.evaluate(() => {
			window.errors = [];
			window.addEventListener('unhandledrejection', e => window.errors.push(String(e.reason)));
			document.querySelector('button').onclick = async () => {
				window.output = new CallsOutput.CallsAudioOutput(value => window.suspended = value);
				window.input = new AudioContext();
				window.input.resume();
				window.addTone = (id, frequency) => {
					const oscillator = input.createOscillator();
					oscillator.frequency.value = frequency;
					const destination = input.createMediaStreamDestination();
					oscillator.connect(destination); oscillator.start();
					output.add(id, destination.stream.getAudioTracks()[0]);
				};
				addTone('first',440);
				window.audio = document.querySelector('audio');
				window.stream = audio.srcObject;
				window.probe = input.createAnalyser(); probe.fftSize = 4096; probe.smoothingTimeConstant = 0;
				input.createMediaStreamSource(stream).connect(probe);
				await output.play(); window.started = true;
			};
		});
		await page.click('#start');
		await page.waitForFunction(() => window.started);
		const sample = async () => {
			await page.waitForTimeout(250);
			return page.evaluate(() => {
				const data = new Float32Array(probe.frequencyBinCount); probe.getFloatFrequencyData(data);
				const level = frequency => {
					const index = Math.round(frequency * probe.fftSize / input.sampleRate);
					return Math.max(...data.slice(index-2,index+3));
				};
				return { hz440: level(440), hz880: level(880), hz1320: level(1320), elements: document.querySelectorAll('audio').length, sameStream: audio.srcObject === stream, paused: audio.paused, suspended, errors };
			});
		};
		const first = await sample();
		await page.evaluate(() => addTone('second',880));
		const both = await sample();
		if (!(both.hz440 > -30 && both.hz880 > -30 && both.sameStream && both.elements === 1 && !both.paused)) throw new Error('Mixing failed: '+JSON.stringify(both));
		await page.evaluate(() => { output.setVolume('first',0); });
		const muted = await sample();
		if (!(muted.hz440 < -65 && muted.hz880 > -30)) throw new Error('Independent gain failed: '+JSON.stringify(muted));
		await page.evaluate(() => { output.remove('first'); output.remove('second'); });
		const empty = await sample();
		await page.evaluate(() => addTone('third',1320));
		const returned = await sample();
		if (!(returned.hz1320 > -30 && returned.sameStream && !returned.paused && !returned.suspended && returned.errors.length === 0)) throw new Error('Return after empty failed: '+JSON.stringify(returned));
		await page.evaluate(async () => { await output.close(); await input.close(); });
		const elementsAfterClose = await page.locator('audio').count();
		if (elementsAfterClose !== 0) throw new Error('Cleanup failed');
		const result = { browser: browser.version(), first, both, muted, empty, returned, elementsAfterClose };
		console.log(JSON.stringify(result,null,2));
	} finally { await browser.close(); }
})().catch(e=>{ console.error(e); process.exitCode=1; });
