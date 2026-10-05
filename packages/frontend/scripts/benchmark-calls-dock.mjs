/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/* global console, document, process */

import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const currentFile = resolve(repoRoot, 'packages/frontend/src/ui/_common_/CallsDock.vue');
const defaults = {
	baselineFile: '/tmp/calls-dock-baseline/CallsDock.vue',
	output: resolve(repoRoot, 'docs/calls-dock-performance-results.json'),
	runs: 3,
	duration: 5,
};

function parseArgs(argv) {
	const options = { ...defaults };
	for (const argument of argv) {
		if (!argument.startsWith('--')) continue;
		const [name, value] = argument.slice(2).split('=', 2);
		if (name === 'baseline-file') options.baselineFile = resolve(value);
		if (name === 'output') options.output = resolve(value);
		if (name === 'runs') options.runs = Number(value);
		if (name === 'duration') options.duration = Number(value);
	}
	return options;
}

function extractStyle(source, file) {
	const match = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
	if (match == null) throw new Error(`No style block found in ${file}`);
	return match[1].trim();
}

function hash(value) { return createHash('sha256').update(value).digest('hex'); }

function fixture(css, speaking) {
	return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root { --MI-minBottomSpacing: 0px; --MI-margin: 10px; --MI-radius: 12px;
--MI_THEME-bg: rgb(20 24 30); --MI_THEME-panel: rgb(34 40 50); --MI_THEME-accent: rgb(92 180 255);
--MI_THEME-fg: rgb(240 244 250); --MI_THEME-error: rgb(255 110 110); --MI_THEME-warn: rgb(255 190 90);
--MI_THEME-accentedBg: rgb(40 68 92); }
html, body { margin: 0; min-height: 100%; background: var(--MI_THEME-bg); color: var(--MI_THEME-fg); }
${css}
</style>
<div class="root" id="dock"><div class="summaryRow">
<button class="_button _panel main compactMain" type="button"><i class="ti ti-volume compactIcon"></i><div class="avatarRing avatarRingActive${speaking ? ' avatarRingLive' : ''}"><div class="avatar"></div></div>
<div class="body"><div class="titleRow"><strong>Calls</strong></div><small>2 users</small></div><i class="expandIcon"></i></button>
<div class="actions"><button class="action" type="button">×</button></div>
</div></div>`;
}

async function tracePage(browser, css, speaking, duration, viewport) {
	const context = await browser.newContext({ viewport, reducedMotion: 'no-preference' });
	const page = await context.newPage();
	await page.setContent(fixture(css, speaking));
	await page.waitForTimeout(300);
	const client = await context.newCDPSession(page);
	const events = [];
	const onData = event => events.push(...event.value);
	client.on('Tracing.dataCollected', onData);
	await client.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', options: 'record-as-much-as-possible' });
	await page.waitForTimeout(duration * 1000);
	const completed = new Promise(resolveTrace => client.once('Tracing.tracingComplete', resolveTrace));
	await client.send('Tracing.end');
	await completed;
	const state = await page.evaluate(() => ({
		classes: document.querySelector('.avatarRing')?.className ?? '',
		activeAnimations: document.getAnimations().filter(animation => animation.playState === 'running').length,
	}));
	await context.close();
	return {
		...state,
		viewport,
		paintCount: events.filter(event => event.name === 'Paint').length,
		animationFrameCount: events.filter(event => event.name === 'AnimationFrame').length,
	};
}

function median(values) {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)];
}

function summarize(results, variant, mode) {
	const values = results.filter(result => result.variant === variant && result.mode === mode);
	return {
		activeAnimations: median(values.map(result => result.activeAnimations)),
		paintCount: median(values.map(result => result.paintCount)),
		animationFrameCount: median(values.map(result => result.animationFrameCount)),
	};
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (!Number.isInteger(options.runs) || options.runs < 1 || options.duration <= 0) throw new Error('runs and duration must be positive');
	const [baselineSource, currentSource] = await Promise.all([readFile(options.baselineFile, 'utf8'), readFile(currentFile, 'utf8')]);
	const sources = { baseline: extractStyle(baselineSource, options.baselineFile), current: extractStyle(currentSource, currentFile) };
	const browser = await chromium.launch({ headless: true, executablePath: process.env.CALLS_BENCHMARK_CHROMIUM || chromium.executablePath() });
	const results = [];
	try {
		const modes = [
			{ name: 'landscapeIdle', speaking: false, viewport: { width: 844, height: 390 } },
			{ name: 'landscapeSpeaking', speaking: true, viewport: { width: 844, height: 390 } },
			{ name: 'portraitIdle', speaking: false, viewport: { width: 390, height: 844 } },
		];
		for (const variant of ['baseline', 'current']) for (let repetition = 1; repetition <= options.runs; repetition++) {
			for (const mode of modes) results.push({ variant, repetition, mode: mode.name, ...(await tracePage(browser, sources[variant], mode.speaking, options.duration, mode.viewport)) });
		}
	} finally {
		await browser.close();
	}
	const baselineIdle = summarize(results, 'baseline', 'landscapeIdle');
	const currentIdle = summarize(results, 'current', 'landscapeIdle');
	const baselineSpeaking = summarize(results, 'baseline', 'landscapeSpeaking');
	const currentSpeaking = summarize(results, 'current', 'landscapeSpeaking');
	const baselinePortrait = summarize(results, 'baseline', 'portraitIdle');
	const currentPortrait = summarize(results, 'current', 'portraitIdle');
	const ratio = (current, baseline) => baseline === 0 ? null : current / baseline;
	const output = {
		schemaVersion: 1,
		measuredAt: new Date().toISOString(),
		command: process.argv.join(' '),
		options,
		viewports: { landscape: { width: 844, height: 390 }, portrait: { width: 390, height: 844 } },
		sourceHashes: { baseline: hash(baselineSource), current: hash(currentSource) },
		results,
		summary: {
			landscapeIdle: { baseline: baselineIdle, current: currentIdle, paintRatio: ratio(currentIdle.paintCount, baselineIdle.paintCount), animationRatio: ratio(currentIdle.activeAnimations, baselineIdle.activeAnimations) },
			landscapeSpeakingControl: { baseline: baselineSpeaking, current: currentSpeaking, paintRatio: ratio(currentSpeaking.paintCount, baselineSpeaking.paintCount), currentKeepsAnimation: currentSpeaking.activeAnimations > 0 && currentSpeaking.activeAnimations === baselineSpeaking.activeAnimations },
			portraitIdleControl: { baseline: baselinePortrait, current: currentPortrait },
		},
	};
	output.summary.landscapeIdle.targetHalfOrLess = output.summary.landscapeIdle.paintRatio != null && output.summary.landscapeIdle.animationRatio != null && output.summary.landscapeIdle.paintRatio <= 0.5 && output.summary.landscapeIdle.animationRatio <= 0.5;
	output.summary.landscapeSpeakingControl.targetHalfOrLess = output.summary.landscapeSpeakingControl.paintRatio != null && output.summary.landscapeSpeakingControl.paintRatio <= 0.5;
	output.summary.portraitIdleControl.unchanged = baselinePortrait.activeAnimations === 0 && currentPortrait.activeAnimations === 0 && baselinePortrait.paintCount === 0 && currentPortrait.paintCount === 0;
	await writeFile(options.output, `${JSON.stringify(output, null, 2)}\n`);
	console.log(JSON.stringify(output.summary, null, 2));
	if (!output.summary.landscapeIdle.targetHalfOrLess || !output.summary.landscapeSpeakingControl.targetHalfOrLess || !output.summary.landscapeSpeakingControl.currentKeepsAnimation || !output.summary.portraitIdleControl.unchanged) process.exitCode = 1;
}

await main();
