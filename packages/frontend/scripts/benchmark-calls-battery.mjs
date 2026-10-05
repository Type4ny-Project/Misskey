/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { copyFile, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const frontendRoot = resolve(repoRoot, 'packages/frontend');
const baselineRoot = '/tmp/calls-battery-baseline';
const defaultOutput = resolve(repoRoot, 'docs/calls-performance-results.json');
const rnnoisePackageRoot = dirname(fileURLToPath(import.meta.resolve('@sapphi-red/web-noise-suppressor')));
let baselineRuntimeRoot = null;
const benchmarkSourceFiles = ['calls-noise-suppression.ts', 'calls-report-recording.ts', 'calls-report-audio.worklet.ts'];

const defaults = {
	variant: 'both',
	baselineDir: baselineRoot,
	scenario: 'muted',
	microphoneWav: null,
	runs: 3,
	warmupSeconds: 4,
	durationSeconds: 15,
	controlSeconds: 2,
	output: defaultOutput,
};

function parseArgs(argv) {
	const options = { ...defaults };
	for (const argument of argv) {
		if (!argument.startsWith('--')) continue;
		const separator = argument.indexOf('=');
		const name = separator === -1 ? argument.slice(2) : argument.slice(2, separator);
		const value = separator === -1 ? true : argument.slice(separator + 1);
		if (name === 'variant') options.variant = value;
		if (name === 'baseline-dir') options.baselineDir = resolve(value);
		if (name === 'scenario') options.scenario = value;
		if (name === 'microphone-wav') options.microphoneWav = resolve(value);
		if (name === 'runs') options.runs = Number(value);
		if (name === 'warmup') options.warmupSeconds = Number(value);
		if (name === 'duration') options.durationSeconds = Number(value);
		if (name === 'control') options.controlSeconds = Number(value);
		if (name === 'output') options.output = resolve(value);
		if (name === 'help') options.help = true;
	}
	return options;
}

function printHelp() {
	console.log(`Usage: node packages/frontend/scripts/benchmark-calls-battery.mjs [options]

Options:
  --variant=both|baseline|current  Source to measure (default: both)
  --baseline-dir=path             Pre-change audio source snapshot directory
  --scenario=muted|speaking|speaking-bypass  Audio scenario (default: muted)
  --microphone-wav=path           Human-voice WAV for speaking scenarios
  --runs=3                         Repetitions per source (default: 3)
  --warmup=4                       Warmup seconds (default: 4)
  --duration=15                    Muted measurement seconds (default: 15)
  --control=2                      Unmuted control seconds (default: 2)
  --output=path                    Raw JSON output path
`);
}

function assertOptions(options) {
	if (!['both', 'baseline', 'current'].includes(options.variant)) throw new Error(`Invalid --variant: ${options.variant}`);
	if (!['muted', 'speaking', 'speaking-bypass'].includes(options.scenario)) throw new Error(`Invalid --scenario: ${options.scenario}`);
	if (options.scenario !== 'muted' && options.microphoneWav == null) throw new Error(`--microphone-wav is required for --scenario=${options.scenario}`);
	for (const name of ['runs', 'warmupSeconds', 'durationSeconds', 'controlSeconds']) {
		if (!Number.isFinite(options[name]) || options[name] <= 0) throw new Error(`Invalid --${name}: ${options[name]}`);
	}
}

function makeFakeMicrophoneWav(seconds = 30, sampleRate = 48_000) {
	const samples = Math.floor(seconds * sampleRate);
	const dataLength = samples * 2;
	const buffer = Buffer.alloc(44 + dataLength);
	buffer.write('RIFF', 0, 'ascii');
	buffer.writeUInt32LE(36 + dataLength, 4);
	buffer.write('WAVE', 8, 'ascii');
	buffer.write('fmt ', 12, 'ascii');
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(sampleRate, 24);
	buffer.writeUInt32LE(sampleRate * 2, 28);
	buffer.writeUInt16LE(2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write('data', 36, 'ascii');
	buffer.writeUInt32LE(dataLength, 40);
	for (let index = 0; index < samples; index++) {
		const tone = Math.sin((2 * Math.PI * 440 * index) / sampleRate);
		buffer.writeInt16LE(Math.round(tone * 0x2800), 44 + index * 2);
	}
	return buffer;
}

function sourceRootForVariant(variant) {
	return variant === 'baseline' ? baselineRuntimeRoot ?? baselineRoot : resolve(frontendRoot, 'src/utility');
}

async function sourceFileExists(sourceRoot, file) {
	try {
		await readFile(join(sourceRoot, file));
		return true;
	} catch {
		return false;
	}
}

async function fileExists(file) {
	try {
		await readFile(file);
		return true;
	} catch {
		return false;
	}
}

async function availableSourceFiles(sourceRoot) {
	const entries = await Promise.all(benchmarkSourceFiles.map(async file => [file, await sourceFileExists(sourceRoot, file)]));
	return entries.filter(([, available]) => available).map(([file]) => file);
}

function makeEntrySource(variant, scenario, hasReportRecorder) {
	const sourceRoot = sourceRootForVariant(variant);
	const sourceUrlRoot = `/${relative(frontendRoot, sourceRoot).split('/').join('/')}`;
	const noisePath = `${sourceUrlRoot}/calls-noise-suppression.ts`;
	const reportPath = `${sourceUrlRoot}/calls-report-recording.ts`;
	const reportImport = hasReportRecorder
		? `import { CallsReportRecorder } from ${JSON.stringify(reportPath)};`
		: 'const CallsReportRecorder = null;';
	return `
import { createCallsNoiseSuppression } from ${JSON.stringify(noisePath)};
${reportImport}

const benchmarkScenario = ${JSON.stringify(scenario)};

const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

function waitForIceGathering(peer) {
	if (peer.iceGatheringState === 'complete') return Promise.resolve();
	return new Promise(resolve => {
		const timeout = setTimeout(finish, 5000);
		peer.addEventListener('icegatheringstatechange', handleChange);
		function handleChange() {
			if (peer.iceGatheringState === 'complete') finish();
		}
		function finish() {
			clearTimeout(timeout);
			peer.removeEventListener('icegatheringstatechange', handleChange);
			resolve();
		}
	});
}

function waitForConnected(peers) {
	if (peers.every(peer => peer.connectionState === 'connected')) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => finish(new Error('WebRTC peers did not connect')), 10_000);
		for (const peer of peers) peer.addEventListener('connectionstatechange', handleChange);
		function handleChange() {
			if (peers.some(peer => peer.connectionState === 'failed')) finish(new Error('WebRTC peer connection failed'));
			else if (peers.every(peer => peer.connectionState === 'connected')) finish();
		}
		function finish(error) {
			clearTimeout(timeout);
			for (const peer of peers) peer.removeEventListener('connectionstatechange', handleChange);
			if (error) reject(error); else resolve();
		}
	});
}

function rms(analyser, samples) {
	if (analyser == null) return 0;
	analyser.getFloatTimeDomainData(samples);
	let energy = 0;
	for (const sample of samples) energy += sample * sample;
	return Math.sqrt(energy / samples.length);
}

async function collectAudioStats(peer) {
	const report = await peer.getStats();
	const result = { packetsReceived: 0, bytesReceived: 0, packetsSent: 0, bytesSent: 0 };
	const optionalFields = ['totalEncodeTime', 'framesEncoded', 'totalPacketSendDelay', 'jitterBufferDelay', 'jitterBufferEmittedCount', 'concealedSamples'];
	for (const value of report.values()) {
		if (value.type === 'inbound-rtp' && value.kind === 'audio') {
			result.packetsReceived += value.packetsReceived ?? 0;
			result.bytesReceived += value.bytesReceived ?? 0;
		}
		if (value.type === 'outbound-rtp' && value.kind === 'audio') {
			result.packetsSent += value.packetsSent ?? 0;
			result.bytesSent += value.bytesSent ?? 0;
		}
		if (!['inbound-rtp', 'outbound-rtp'].includes(value.type) || value.kind !== 'audio') continue;
		for (const field of optionalFields) {
			if (typeof value[field] === 'number') result[field] = (result[field] ?? 0) + value[field];
		}
	}
	return result;
}

function deltaStats(before, after) {
	const delta = Object.fromEntries(Object.keys(after).map(key => [key, after[key] - (before[key] ?? 0)]));
	if (typeof delta.totalEncodeTime === 'number' && typeof delta.framesEncoded === 'number' && delta.framesEncoded > 0) {
		delta.encodeTimePerFrameMs = delta.totalEncodeTime / delta.framesEncoded * 1000;
	}
	if (typeof delta.totalPacketSendDelay === 'number' && typeof delta.packetsSent === 'number' && delta.packetsSent > 0) {
		delta.packetSendDelayPerPacketMs = delta.totalPacketSendDelay / delta.packetsSent * 1000;
	}
	return delta;
}

async function setupBenchmark(warmupMs) {
	if (globalThis.__callsBatteryState != null) throw new Error('Benchmark is already set up');
	const reportRecorder = CallsReportRecorder == null ? null : new CallsReportRecorder();
	if (reportRecorder != null) {
		await reportRecorder.start();
		for (let index = 0; index < 100 && !reportRecorder.available; index++) await sleep(10);
		if (!reportRecorder.available) throw new Error('Calls report recorder did not start');
	}

	const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: { ideal: 1 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
	const microphoneTrack = microphoneStream.getAudioTracks()[0];
	if (microphoneTrack == null) throw new Error('Fake microphone did not provide an audio track');
	// Observe the production graph's clock without exposing its context in the application API.
	const NativeAudioContext = globalThis.AudioContext;
	let noiseContext;
	globalThis.AudioContext = class extends NativeAudioContext {
		constructor(options) { super(options); noiseContext = this; }
	};
	let processing;
	try {
		processing = await createCallsNoiseSuppression(microphoneStream, error => console.error('[benchmark] RNNoise error', error), new AbortController().signal);
	} finally {
		globalThis.AudioContext = NativeAudioContext;
	}
	processing.setEnabled(true);

	const remoteSourceContext = new AudioContext({ sampleRate: 48_000 });
	await remoteSourceContext.resume();
	const oscillator = remoteSourceContext.createOscillator();
	oscillator.frequency.value = 440;
	const gain = remoteSourceContext.createGain();
	gain.gain.value = 0.1;
	const remoteDestination = remoteSourceContext.createMediaStreamDestination();
	oscillator.connect(gain).connect(remoteDestination);
	oscillator.start();

	const caller = new RTCPeerConnection({ iceServers: [] });
	const callee = new RTCPeerConnection({ iceServers: [] });
	const callerAudio = caller.addTransceiver('audio', { direction: 'sendrecv' });
	await callerAudio.sender.replaceTrack(processing.track);

	const remoteStream = new MediaStream();
	const processedRemoteStream = new MediaStream();
	const remoteAudio = document.createElement('audio');
	remoteAudio.autoplay = true;
	remoteAudio.muted = false;
	remoteAudio.volume = 1;
	remoteAudio.style.display = 'none';
	document.body.append(remoteAudio);
	let remoteTrackResolve;
	const remoteTrackPromise = new Promise(resolve => { remoteTrackResolve = resolve; });
	const attachRemoteTrack = track => {
		if (track == null || track.kind !== 'audio' || remoteStream.getTracks().includes(track)) return;
		remoteStream.addTrack(track);
		remoteAudio.srcObject = remoteStream;
		void remoteAudio.play().catch(() => undefined);
		reportRecorder?.setTrack('remote', track);
		remoteTrackResolve(track);
	};
	caller.addEventListener('track', event => attachRemoteTrack(event.track));
	const attachProcessedRemoteTrack = track => {
		if (track == null || track.kind !== 'audio' || processedRemoteStream.getTracks().includes(track)) return;
		processedRemoteStream.addTrack(track);
	};
	callee.addEventListener('track', event => attachProcessedRemoteTrack(event.track));
	const offer = await caller.createOffer();
	await caller.setLocalDescription(offer);
	await waitForIceGathering(caller);
	await callee.setRemoteDescription(caller.localDescription);
	const calleeAudio = callee.getTransceivers()[0];
	calleeAudio.direction = 'sendrecv';
	await calleeAudio.sender.replaceTrack(remoteDestination.stream.getAudioTracks()[0]);
	const answer = await callee.createAnswer();
	await callee.setLocalDescription(answer);
	await waitForIceGathering(callee);
	await caller.setRemoteDescription(callee.localDescription);
	await waitForConnected([caller, callee]);
	attachRemoteTrack(caller.getReceivers().find(receiver => receiver.track.kind === 'audio')?.track);
	attachProcessedRemoteTrack(callee.getReceivers().find(receiver => receiver.track.kind === 'audio')?.track);
	await Promise.race([remoteTrackPromise, sleep(5000).then(() => {
		throw new Error('No remote audio track received (caller=' + caller.connectionState + '/' + caller.iceConnectionState + ', callee=' + callee.connectionState + '/' + callee.iceConnectionState + ', callerRecv=' + caller.getReceivers().length + ', calleeRecv=' + callee.getReceivers().length + ')');
	})]);

	const remoteMonitorContext = new AudioContext({ sampleRate: 48_000 });
	await remoteMonitorContext.resume();
	const remoteSource = remoteMonitorContext.createMediaStreamSource(remoteStream);
	const remoteAnalyser = remoteMonitorContext.createAnalyser();
	remoteAnalyser.fftSize = 1024;
	remoteSource.connect(remoteAnalyser);
	let processedMonitorContext = null;
	let processedAnalyser = null;
	let processedRemoteAnalyser = null;
	if (benchmarkScenario !== 'muted') {
		processedMonitorContext = new AudioContext({ sampleRate: 48_000 });
		await processedMonitorContext.resume();
		const processedSource = processedMonitorContext.createMediaStreamSource(new MediaStream([processing.track]));
		processedAnalyser = processedMonitorContext.createAnalyser();
		processedAnalyser.fftSize = 1024;
		processedSource.connect(processedAnalyser);
		const processedRemoteSource = processedMonitorContext.createMediaStreamSource(processedRemoteStream);
		processedRemoteAnalyser = processedMonitorContext.createAnalyser();
		processedRemoteAnalyser.fftSize = 1024;
		processedRemoteSource.connect(processedRemoteAnalyser);
	}

	// This is the same mute boundary used by CallsMediaController: both capture
	// tracks are disabled, while the RNNoise graph remains enabled when the
	// implementation has no explicit mute hook.
	const setMuted = muted => {
		microphoneTrack.enabled = !muted;
		processing.track.enabled = !muted;
		if (typeof processing.setMuted === 'function') processing.setMuted(muted);
	};
	const speaking = benchmarkScenario !== 'muted';
	if (speaking) {
		setMuted(false);
		processing.setEnabled(benchmarkScenario !== 'speaking-bypass');
	} else {
		setMuted(true);
		processing.setEnabled(true);
	}
	if (reportRecorder != null) reportRecorder.setTrack('local', processing.track);

	await sleep(warmupMs);
	globalThis.__callsBatteryState = {
		microphoneStream,
		microphoneTrack,
		processing,
		noiseContext,
		remoteSourceContext,
		oscillator,
		caller,
		callee,
		remoteStream,
		processedRemoteStream,
		remoteAudio,
		reportRecorder,
		remoteMonitorContext,
		remoteAnalyser,
		processedMonitorContext,
		processedAnalyser,
		processedRemoteAnalyser,
		setMuted,
	};
	return {
		remoteTrackReady: remoteStream.getAudioTracks().length > 0,
		reportRecorderAvailable: reportRecorder?.available ?? false,
		scenario: benchmarkScenario,
		processingMuteHook: typeof processing.setMuted === 'function',
		microphoneTrackEnabled: microphoneTrack.enabled,
		processedTrackEnabled: processing.track.enabled,
	};
}

function summarizeRms(samples) {
	if (samples.length === 0) return null;
	const summarize = key => {
		const values = samples.map(sample => sample[key]);
		return { max: Math.max(...values), mean: values.reduce((sum, value) => sum + value, 0) / values.length };
	};
	return { samples: samples.length, sender: summarize('sender'), remote: summarize('remote') };
}

async function measureScenario(durationMs) {
	const state = globalThis.__callsBatteryState;
	if (state == null) throw new Error('Benchmark is not set up');
	const beforeStats = await collectAudioStats(state.caller);
	const beforeProcessedRemoteStats = await collectAudioStats(state.callee);
	const noiseGraphStartedAt = state.noiseContext.currentTime;
	const rmsSamples = [];
	if (benchmarkScenario === 'muted') {
		await sleep(durationMs);
	} else {
		const deadline = performance.now() + durationMs;
		while (performance.now() < deadline) {
			if (state.processedAnalyser != null && state.processedRemoteAnalyser != null) {
				const senderSamples = new Float32Array(state.processedAnalyser.fftSize);
				const remoteSamples = new Float32Array(state.processedRemoteAnalyser.fftSize);
				rmsSamples.push({ sender: rms(state.processedAnalyser, senderSamples), remote: rms(state.processedRemoteAnalyser, remoteSamples) });
			}
			await sleep(Math.min(100, Math.max(1, deadline - performance.now())));
		}
	}
	const afterStats = await collectAudioStats(state.caller);
	const afterProcessedRemoteStats = await collectAudioStats(state.callee);
	return {
		scenario: benchmarkScenario,
		mutedMs: benchmarkScenario === 'muted' ? durationMs : 0,
		activeMs: benchmarkScenario === 'muted' ? 0 : durationMs,
		noiseGraphActiveSeconds: state.noiseContext.currentTime - noiseGraphStartedAt,
		noiseGraphState: state.noiseContext.state,
		playbackActive: !state.remoteAudio.paused,
		processedAudioRms: summarizeRms(rmsSamples),
		audioStats: { before: beforeStats, after: afterStats, delta: deltaStats(beforeStats, afterStats) },
		processedRemoteAudioStats: { before: beforeProcessedRemoteStats, after: afterProcessedRemoteStats, delta: deltaStats(beforeProcessedRemoteStats, afterProcessedRemoteStats) },
	};
}

async function runControl(controlMs) {
	const state = globalThis.__callsBatteryState;
	if (state == null) throw new Error('Benchmark is not set up');
	state.setMuted(false);
	// A synthetic sine is intentionally suppressed by RNNoise. Verify the same
	// output track resumes through the supported bypass, without changing tracks.
	state.processing.setEnabled(false);
	const inputContext = new AudioContext({ sampleRate: 48_000 });
	await inputContext.resume();
	const inputSource = inputContext.createMediaStreamSource(new MediaStream([state.processing.track]));
	const inputAnalyser = inputContext.createAnalyser();
	inputAnalyser.fftSize = 1024;
	inputSource.connect(inputAnalyser);
	const inputSamples = new Float32Array(inputAnalyser.fftSize);
	const remoteSamples = new Float32Array(state.remoteAnalyser.fftSize);
	const beforeStats = await collectAudioStats(state.caller);
	const rmsSamples = [];
	const deadline = performance.now() + controlMs;
	while (performance.now() < deadline) {
		rmsSamples.push({ input: rms(inputAnalyser, inputSamples), remote: rms(state.remoteAnalyser, remoteSamples) });
		await sleep(100);
	}
	const afterStats = await collectAudioStats(state.caller);
	const capture = state.reportRecorder?.capture() ?? null;
	let wav = null;
	if (capture != null) {
		// Ending a recording uses the public close path to encode the available history.
		state.reportRecorder.close();
		wav = await capture.recording;
	}
	await inputContext.close();
	state.processing.setEnabled(true);
	const maxInputRms = Math.max(0, ...rmsSamples.map(sample => sample.input));
	const maxRemoteRms = Math.max(0, ...rmsSamples.map(sample => sample.remote));
	return {
		controlMs,
		processingResumed: state.noiseContext.state === 'running',
		audioStats: { before: beforeStats, after: afterStats, delta: deltaStats(beforeStats, afterStats) },
		liveSamples: { count: rmsSamples.length, maxInputRms, maxRemoteRms, inputDetected: maxInputRms > 0.001, remoteDetected: maxRemoteRms > 0.001 },
		wav: { required: state.reportRecorder != null, valid: wav == null ? null : new TextDecoder().decode(new Uint8Array(await wav.slice(0, 4).arrayBuffer())) === 'RIFF' && wav.size > 44, bytes: wav?.size ?? 0 },
	};
}

async function cleanupBenchmark() {
	const state = globalThis.__callsBatteryState;
	if (state == null) return;
	delete globalThis.__callsBatteryState;
	state.setMuted(true);
	state.reportRecorder?.close();
	state.remoteAudio.remove();
	state.remoteStream.getTracks().forEach(track => track.stop());
	state.processedRemoteStream.getTracks().forEach(track => track.stop());
	state.microphoneStream.getTracks().forEach(track => track.stop());
	state.processing.close();
	state.oscillator.stop();
	await Promise.allSettled([state.remoteSourceContext.close(), state.remoteMonitorContext.close(), state.processedMonitorContext?.close()]);
	state.caller.close();
	state.callee.close();
}

globalThis.__callsBattery = { setup: setupBenchmark, measureScenario, runControl, cleanup: cleanupBenchmark };
`;
}

async function startServer(variant, scenario) {
	const sourceRoot = sourceRootForVariant(variant);
	const hasReportRecorder = await sourceFileExists(sourceRoot, 'calls-report-recording.ts');
	const entry = makeEntrySource(variant, scenario, hasReportRecorder);
	const server = await createServer({
		root: frontendRoot,
		configFile: false,
		logLevel: 'error',
		server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { strict: true, allow: [repoRoot, baselineRoot, rnnoisePackageRoot] } },
		plugins: [{
			name: 'calls-battery-benchmark-html',
			configureServer(server) {
				server.middlewares.use((request, response, next) => {
					if (request.url !== '/' && request.url !== '/calls-battery-benchmark.html') return next();
					response.statusCode = 200;
					response.setHeader('content-type', 'text/html; charset=utf-8');
					response.end(`<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Calls battery benchmark</title></head><body><script type="module">${entry}</script></body></html>`);
				});
			},
		}],
	});
	await server.listen();
	const address = server.httpServer.address();
	if (address == null || typeof address === 'string') throw new Error('Vite did not expose a TCP address');
	return { server, url: `http://127.0.0.1:${address.port}/`, hasReportRecorder };
}

async function getProcessInfo(cdp) {
	const result = await cdp.send('SystemInfo.getProcessInfo');
	return result.processInfo.map(process => ({ id: process.id, type: process.type, cpuTime: process.cpuTime, cpuTimeSeconds: process.cpuTime }));
}

function rendererCpuSnapshot(processes) {
	const renderer = processes.filter(process => process.type === 'renderer');
	return {
		processCount: renderer.length,
		cpuTimeSeconds: renderer.reduce((sum, process) => sum + process.cpuTimeSeconds, 0),
		processes: renderer,
	};
}

function rendererCpuDelta(before, after) {
	const beforeById = new Map(before.processes.map(process => [process.id, process.cpuTimeSeconds]));
	const deltaProcesses = after.processes.map(process => ({ ...process, deltaSeconds: process.cpuTimeSeconds - (beforeById.get(process.id) ?? 0) }));
	return {
		cpuTimeSeconds: deltaProcesses.reduce((sum, process) => sum + process.deltaSeconds, 0),
		processes: deltaProcesses,
	};
}

async function runOne(variant, repetition, options, microphoneWavPath) {
	const harness = await startServer(variant, options.scenario);
	const executablePath = process.env.CALLS_BENCHMARK_CHROMIUM || chromium.executablePath();
	const browser = await chromium.launch({
		headless: true,
		executablePath,
		args: [
			'--use-fake-device-for-media-stream',
			'--use-fake-ui-for-media-stream',
			`--use-file-for-fake-audio-capture=${microphoneWavPath}`,
			'--autoplay-policy=no-user-gesture-required',
			'--disable-background-timer-throttling',
			'--disable-renderer-backgrounding',
			'--disable-backgrounding-occluded-windows',
		],
	});
	const browserCdp = await browser.newBrowserCDPSession();
	const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
	const page = await context.newPage();
	const consoleErrors = [];
	page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
	page.on('pageerror', error => { consoleErrors.push(`pageerror: ${error.message}`); });
	page.on('response', response => { if (response.status() >= 400) consoleErrors.push(`http ${response.status()} ${response.url()}`); });
	try {
		await page.goto(harness.url, { waitUntil: 'load' });
		let setup;
		try {
			setup = await page.evaluate(async warmupMs => globalThis.__callsBattery.setup(warmupMs), options.warmupSeconds * 1000);
		} catch (error) {
			throw new Error(`${error instanceof Error ? error.message : String(error)}; browser errors: ${consoleErrors.join(' | ')}`);
		}
		const beforeProcesses = await getProcessInfo(browserCdp);
		const before = rendererCpuSnapshot(beforeProcesses);
		const scenarioResult = await page.evaluate(async durationMs => globalThis.__callsBattery.measureScenario(durationMs), options.durationSeconds * 1000);
		const afterProcesses = await getProcessInfo(browserCdp);
		const after = rendererCpuSnapshot(afterProcesses);
		const cpu = rendererCpuDelta(before, after);
		const control = await page.evaluate(async controlMs => globalThis.__callsBattery.runControl(controlMs), options.controlSeconds * 1000);
		const result = {
			variant,
			repetition,
			scenario: options.scenario,
			setup,
			measurement: {
				wallTimeSeconds: options.durationSeconds,
				before,
				after,
				cpu,
				cpuPercentOfWall: cpu.cpuTimeSeconds / options.durationSeconds * 100,
			},
			scenarioResult,
			control,
			consoleErrors,
			chromium: executablePath,
		};
		if (options.scenario === 'muted') result.muted = scenarioResult;
		return result;
	} finally {
		await page.evaluate(async () => globalThis.__callsBattery?.cleanup()).catch(() => undefined);
		await context.close().catch(() => undefined);
		await browser.close().catch(() => undefined);
		await harness.server.close().catch(() => undefined);
	}
}

function median(values) {
	const sorted = [...values].sort((left, right) => left - right);
	if (sorted.length === 0) return null;
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function summarize(results) {
	const summary = {};
	const scenarioResult = result => result.scenarioResult ?? result.muted;
	const medianOptional = values => values.length === 0 ? undefined : median(values);
	for (const variant of ['baseline', 'current']) {
		const variantResults = results.filter(result => result.variant === variant);
		const values = variantResults.map(result => result.measurement.cpu.cpuTimeSeconds);
		if (values.length === 0) continue;
		const scenarioValues = variantResults.map(scenarioResult);
		const item = {
			rendererCpuSecondsPerRun: median(values),
			rendererCpuPercentOfWall: median(variantResults.map(result => result.measurement.cpuPercentOfWall)),
			noiseGraphActiveSecondsPerRun: median(scenarioValues.map(result => result.noiseGraphActiveSeconds)),
			rtpPacketsSentPerRun: median(scenarioValues.map(result => result.audioStats.delta.packetsSent)),
			rtpBytesSentPerRun: median(scenarioValues.map(result => result.audioStats.delta.bytesSent)),
			rtpPacketsReceivedPerRun: median(scenarioValues.map(result => result.audioStats.delta.packetsReceived)),
			processedAudioSenderRms: medianOptional(scenarioValues.map(result => result.processedAudioRms?.sender?.mean).filter(value => typeof value === 'number')),
			processedAudioRemoteRms: medianOptional(scenarioValues.map(result => result.processedAudioRms?.remote?.mean).filter(value => typeof value === 'number')),
			values,
		};
		const encodeTimePerFrame = medianOptional(scenarioValues.map(result => result.audioStats.delta.encodeTimePerFrameMs).filter(value => typeof value === 'number'));
		if (encodeTimePerFrame !== undefined) item.encodeTimePerFrameMs = encodeTimePerFrame;
		summary[variant] = item;
	}
	if (summary.baseline != null && summary.current != null) {
		summary.ratio = summary.current.rendererCpuSecondsPerRun / summary.baseline.rendererCpuSecondsPerRun;
		summary.targetHalfOrLess = results[0]?.scenario === 'muted' ? summary.ratio <= 0.5 : null;
		summary.targetWithinBaseline110 = summary.ratio <= 1.1;
		summary.noiseGraphActiveTimeRatio = summary.current.noiseGraphActiveSecondsPerRun / summary.baseline.noiseGraphActiveSecondsPerRun;
		summary.rtpPacketsSentRatio = summary.baseline.rtpPacketsSentPerRun === 0 ? null : summary.current.rtpPacketsSentPerRun / summary.baseline.rtpPacketsSentPerRun;
	}
	return summary;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) return printHelp();
	assertOptions(options);
	if (options.scenario !== 'muted' && options.output === defaultOutput) options.output = resolve(repoRoot, `docs/calls-performance-results-${options.scenario}.json`);
	const variants = options.variant === 'both' ? ['baseline', 'current'] : [options.variant];
	const fakeWavPath = join(tmpdir(), `calls-battery-fake-mic-${process.pid}.wav`);
	if (variants.includes('baseline')) {
		baselineRuntimeRoot = await mkdtemp(join(frontendRoot, 'calls-battery-baseline-'));
		for (const file of await availableSourceFiles(options.baselineDir)) await copyFile(join(options.baselineDir, file), join(baselineRuntimeRoot, file));
	}
	const microphoneWavPath = options.microphoneWav ?? fakeWavPath;
	if (options.microphoneWav == null) await writeFile(fakeWavPath, makeFakeMicrophoneWav());
	else if (!(await fileExists(options.microphoneWav))) throw new Error(`Microphone WAV does not exist: ${options.microphoneWav}`);
	const microphoneWavSha256 = createHash('sha256').update(await readFile(microphoneWavPath)).digest('hex');
	const results = [];
	try {
		for (let repetition = 1; repetition <= options.runs; repetition++) {
			for (const variant of variants) {
				console.log(`Running ${variant}/${options.scenario} repetition ${repetition}/${options.runs}...`);
				const result = await runOne(variant, repetition, options, microphoneWavPath);
				results.push(result);
				console.log(`  renderer CPU: ${result.measurement.cpu.cpuTimeSeconds.toFixed(3)} s (${result.measurement.cpuPercentOfWall.toFixed(1)}% of wall), processed RMS: ${result.scenarioResult.processedAudioRms?.sender?.mean?.toFixed(4) ?? 'n/a'}`);
			}
		}
	} finally {
		await unlink(fakeWavPath).catch(() => undefined);
		if (baselineRuntimeRoot != null) await rm(baselineRuntimeRoot, { recursive: true, force: true }).catch(() => undefined);
	}
	const report = {
		schemaVersion: 1,
		measuredAt: new Date().toISOString(),
		command: process.argv.slice(1).join(' '),
		environment: {
			node: process.version,
			platform: process.platform,
			arch: process.arch,
			cpu: cpus()[0]?.model,
			chromium: results[0]?.chromium ?? null,
			viewport: '390x844, deviceScaleFactor=1, isMobile=true',
		},
		options,
		microphoneWav: { path: options.microphoneWav ?? 'generated-440hz-sine.wav', sha256: microphoneWavSha256 },
		sourceHashes: Object.fromEntries(await Promise.all(variants.map(async variant => {
			const sourceRoot = variant === 'baseline' ? options.baselineDir : resolve(frontendRoot, 'src/utility');
			return [variant, Object.fromEntries(await Promise.all((await availableSourceFiles(sourceRoot)).map(async file => [file, createHash('sha256').update(await readFile(join(sourceRoot, file))).digest('hex')])) )];
		}))),
		results,
		summary: summarize(results),
	};
	await mkdir(dirname(options.output), { recursive: true });
	await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`Raw report: ${options.output}`);
	console.log(JSON.stringify(report.summary, null, 2));
	if (new Set(results.map(result => result.setup.reportRecorderAvailable)).size > 1) {
		throw new Error('Recorder availability differs between variants; use the same source set for both CPU measurements. See the raw report.');
	}
	if (results.some(result => result.consoleErrors.length > 0 || (result.setup.reportRecorderAvailable && !result.control.wav.valid) || !result.control.processingResumed || !result.control.liveSamples.inputDetected || !result.control.liveSamples.remoteDetected || !result.scenarioResult.playbackActive || result.scenarioResult.audioStats.delta.packetsReceived <= 0 || result.control.audioStats.delta.packetsSent <= 0 || (result.scenario !== 'muted' && ((result.scenarioResult.processedAudioRms?.sender?.max ?? 0) <= 0.001 || (result.scenarioResult.processedAudioRms?.remote?.max ?? 0) <= 0.001)))) {
		throw new Error('Audio controls failed; the CPU comparison is invalid. See the raw report.');
	}
	if (options.scenario === 'muted' && report.summary.targetHalfOrLess === false) process.exitCode = 1;
}

await main();
