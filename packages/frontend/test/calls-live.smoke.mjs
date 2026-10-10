/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// CALLS_TEST_ACCOUNTS points to a private JSON file with accounts: [{ ...iResponse, token }, ...].
// Use two dedicated test accounts; this creates and ends their private test room.
// CALLS_TEST_RECOVERY=1 blocks RNNoise downloads and restores unavailable device settings.
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.CALLS_TEST_URL ?? 'http://127.0.0.1:4068';
const credentials = JSON.parse(await fs.readFile(process.env.CALLS_TEST_ACCOUNTS, 'utf8'));
const outputDir = process.env.CALLS_TEST_OUTPUT ?? '/tmp/typeany-calls-runtime';
await fs.mkdir(outputDir, { recursive: true });
const browsers = [];
const pages = [];
const results = { startedAt: new Date().toISOString(), baseUrl, roomId: null, checks: [], apiErrors: [], blockedNoiseDownloads: 0, recoveryScenario: process.env.CALLS_TEST_RECOVERY === '1' };

function tone(frequency) {
	const count = 48000 * 10;
	const data = Buffer.alloc(44 + count * 2);
	data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
	data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(48000, 24); data.writeUInt32LE(96000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(count * 2, 40);
	for (let i = 0; i < count; i++) data.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * frequency * i / 48000)), 44 + i * 2);
	return data;
}
async function sample(page) {
	return page.evaluate(async () => {
		const peers = [];
		for (const peer of window.testPeers) {
			const report = await peer.getStats();
			const rows = [];
			report.forEach(stat => {
				if (['inbound-rtp', 'outbound-rtp'].includes(stat.type)) rows.push({ type: stat.type, kind: stat.kind, packetsReceived: stat.packetsReceived, packetsSent: stat.packetsSent, bytesReceived: stat.bytesReceived, bytesSent: stat.bytesSent, totalAudioEnergy: stat.totalAudioEnergy, totalSamplesReceived: stat.totalSamplesReceived, concealedSamples: stat.concealedSamples, silentConcealedSamples: stat.silentConcealedSamples, codecId: stat.codecId, audioLevel: stat.audioLevel });
			});
			peers.push({ state: peer.connectionState, rows, transceivers: peer.getTransceivers().map(t => ({ mid: t.mid, direction: t.currentDirection, received: { enabled: t.receiver.track.enabled, muted: t.receiver.track.muted, state: t.receiver.track.readyState }, sent: t.sender.track && { enabled: t.sender.track.enabled, muted: t.sender.track.muted, state: t.sender.track.readyState } })) });
		}
		let waveform = null;
		const stream = document.querySelector('audio')?.srcObject;
		if (stream != null) {
			const context = new AudioContext();
			await context.resume();
			const source = context.createMediaStreamSource(stream);
			const analyser = context.createAnalyser(); analyser.fftSize = 4096; analyser.smoothingTimeConstant = 0; source.connect(analyser);
			const sink = context.createGain(); sink.gain.value = 0; analyser.connect(sink); sink.connect(context.destination);
			await new Promise(resolve => setTimeout(resolve, 1000));
			const time = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(time);
			const spectrum = new Float32Array(analyser.frequencyBinCount); analyser.getFloatFrequencyData(spectrum);
			const level = frequency => { const bin = Math.round(frequency * analyser.fftSize / context.sampleRate); return Math.max(...spectrum.slice(bin - 2, bin + 3)); };
			waveform = { contextState: context.state, currentTime: context.currentTime, rms: Math.sqrt(time.reduce((sum, value) => sum + value * value, 0) / time.length), hz440: level(440), hz880: level(880) };
			source.disconnect(); await context.close();
		}
		return { waveform, peers, audio: [...document.querySelectorAll('audio')].map(a => ({ paused: a.paused, hasStream: a.srcObject != null })), errors: window.testErrors };
	});
}
const api = async (endpoint, body) => {
		const response = await fetch(`${baseUrl}/api/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ i: credentials.accounts[0].token, ...body }) });
		const value = response.status === 204 ? null : await response.json();
		if (!response.ok) throw new Error(`${endpoint}: ${value?.error?.code ?? response.status}`);
		return value;
	};
let room;
try {
	for (const account of credentials.accounts.slice(0, 2)) await api('i/registry/set', { i: account.token, scope: ['client', 'base'], key: 'accountSetupWizard', value: -1 });
	for (const previous of await api('calls/rooms/list', { states: ['open', 'scheduled'] })) {
		if (previous.title === 'Codex isolated SFU verification' && previous.attachment?.ownerUserId === credentials.accounts[0].id) await api('calls/rooms/end', { roomId: previous.id, expectedRevision: previous.revision });
	}
	room = await api('calls/rooms/create', { attachmentType: 'personal', title: 'Codex isolated SFU verification', mode: 'open', visibility: 'specified', visibleUserIds: credentials.accounts.slice(1).map(account => account.id) });
	room = await api('calls/rooms/open', { roomId: room.id, expectedRevision: room.revision });
	credentials.room = room; results.roomId = room.id;
	for (let index = 0; index < 2; index++) {
		const wav = `${outputDir}/tone-${index}.wav`;
		await fs.writeFile(wav, tone(index === 0 ? 440 : 880));
		const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--mute-audio'], args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'] });
		browsers.push(browser);
		const context = await browser.newContext({ locale: 'ja-JP', permissions: ['microphone', 'camera'], viewport: { width: 1280, height: 960 } });
		const account = credentials.accounts[index];
		const recovery = results.recoveryScenario && index === 0;
		if (recovery) await context.route('**/*.wasm', route => { results.blockedNoiseDownloads++; return route.abort(); });
		await context.addInitScript(({ account, recovery }) => {
			localStorage.setItem('account', JSON.stringify(account));
			localStorage.setItem('lang', 'ja-JP');
			localStorage.setItem('preferences', JSON.stringify({ id: 'calls-verify', version: '2026.10.0', type: 'main', modifiedAt: Date.now(), name: 'Verification', preferences: { callsNoiseSuppression: [[{}, recovery ? 'rnnoise' : 'none', {}]], callsAutoGainControl: [[{}, false, {}]], ...(recovery ? { callsMicrophone: [[{}, 'unavailable-test-microphone', {}]], callsOutputDevice: [[{}, 'unavailable-test-output', {}]], callsInputSensitivity: [[{}, -45, {}]], callsInputVolume: [[{}, 50, {}]] } : {}) } }));
			window.testPeers = []; window.testErrors = [];
			const NativePeer = window.RTCPeerConnection;
			window.RTCPeerConnection = class extends NativePeer { constructor(...args) { super(...args); window.testPeers.push(this); } };
			window.addEventListener('error', event => window.testErrors.push(event.message));
			window.addEventListener('unhandledrejection', event => window.testErrors.push(String(event.reason?.code ?? event.reason?.message ?? event.reason)));
		}, { account, recovery });
		const page = await context.newPage(); pages.push(page);
		page.on('response', async response => {
			if (response.status() >= 400 && response.url().includes('/api/calls/')) {
				const error = await response.json().catch(() => null);
				results.apiErrors.push({ index, endpoint: new URL(response.url()).pathname, status: response.status(), code: error?.error?.code });
			}
		});
		await page.goto(`${baseUrl}/calls/${credentials.room.id}`);
		const confirm = page.getByRole('button', { name: 'OK', exact: true }).last();
		await confirm.waitFor({ timeout: 10000 }).catch(() => {});
		if (await confirm.isVisible()) await confirm.click();
		else await page.getByRole('button', { name: 'ルームに参加', exact: true }).click();
		await page.waitForFunction(() => window.testPeers.some(peer => peer.connectionState === 'connected'), { timeout: 30000 });
		const unmute = page.getByRole('button', { name: 'ミュート解除', exact: true });
		if (await unmute.count()) await unmute.last().click();
		console.log(JSON.stringify({ phase: 'joined', index }));
	}
	await new Promise(resolve => setTimeout(resolve, 3000));
	for (let index = 0; index < pages.length; index++) {
		const value = await sample(pages[index]);
		results.checks.push({ name: `bidirectional-${index}`, ...value });
		await pages[index].screenshot({ path: `${outputDir}/connected-${index}.png` });
		if (!(value.waveform?.rms > 0.001)) throw new Error(`No audible waveform for browser ${index}`);
		if (!value.peers.some(peer => peer.state === 'connected' && peer.rows.some(row => row.type === 'inbound-rtp' && row.kind === 'audio' && row.bytesReceived > 0) && peer.rows.some(row => row.type === 'outbound-rtp' && row.kind === 'audio' && row.bytesSent > 0))) throw new Error(`No bidirectional audio for browser ${index}`);
	}
	await pages[0].getByRole('button', { name: 'ミュート', exact: true }).last().click();
	await new Promise(resolve => setTimeout(resolve, 1500));
	const muted = await sample(pages[1]); results.checks.push({ name: 'mute', ...muted });
	if (!(muted.waveform?.rms < 0.001)) throw new Error('Mute did not silence remote audio');
	await pages[0].getByRole('button', { name: 'ミュート解除', exact: true }).last().click();
	await new Promise(resolve => setTimeout(resolve, 1500));
	const resumed = await sample(pages[1]); results.checks.push({ name: 'unmute', ...resumed });
	if (!(resumed.waveform?.rms > 0.001)) throw new Error('Unmute did not restore remote audio');
	const left = pages[1].waitForResponse(response => response.url().endsWith('/api/calls/rooms/leave'), { timeout: 30000 });
	await pages[1].getByRole('button', { name: '退出', exact: true }).last().click();
	const leaveConfirm = pages[1].getByRole('button', { name: 'OK', exact: true }).last();
	await leaveConfirm.waitFor({ timeout: 2000 }).catch(() => {});
	if (await leaveConfirm.isVisible()) await leaveConfirm.click();
	const leaveResponse = await left;
	if (!leaveResponse.ok()) throw new Error(`Leave failed: HTTP ${leaveResponse.status()}`);
	await pages[1].goto(`${baseUrl}/calls/${credentials.room.id}`);
	await pages[1].getByRole('button', { name: 'OK', exact: true }).last().click();
	await pages[1].waitForFunction(() => window.testPeers.some(peer => peer.connectionState === 'connected'));
	const rejoinUnmute = pages[1].getByRole('button', { name: 'ミュート解除', exact: true }).last();
	if (await rejoinUnmute.count()) await rejoinUnmute.click();
	await new Promise(resolve => setTimeout(resolve, 2000));
	for (let index = 0; index < 2; index++) {
		const value = await sample(pages[index]); results.checks.push({ name: `rejoin-${index}`, ...value });
		if (!(value.waveform?.rms > 0.001)) throw new Error(`Rejoin did not restore audio for browser ${index}`);
	}
	if (results.recoveryScenario && results.blockedNoiseDownloads === 0) throw new Error('RNNoise failure scenario was not exercised');
	results.status = 'PASS';
	console.log(JSON.stringify(results));
} catch (error) {
	results.status = 'FAIL'; results.failure = error.message;
	for (let index = 0; index < pages.length; index++) {
		await pages[index].screenshot({ path: `${outputDir}/failed-${index}.png` }).catch(() => {});
		console.log(JSON.stringify({ phase: 'failure', index, body: (await pages[index].locator('body').innerText()).slice(-2400), stats: await sample(pages[index]) }));
	}
	console.error(error.message); process.exitCode = 1;
} finally {
	await fs.writeFile(`${outputDir}/result.json`, JSON.stringify(results, null, 2));
	for (const browser of browsers) await browser.close();
	if (room) {
		const current = await api('calls/rooms/show', { roomId: room.id }).catch(() => null);
		if (current && current.state !== 'ended') await api('calls/rooms/end', { roomId: current.id, expectedRevision: current.revision }).catch(() => {});
	}
}
