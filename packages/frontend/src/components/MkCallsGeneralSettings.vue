<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.body">
	<section :class="$style.section">
		<h2>{{ i18n.ts._calls.audioSection }}</h2>
		<div :class="$style.audioGrid">
			<div v-for="kind in audioDeviceKinds" :key="kind" class="_gaps_m">
				<label :class="$style.field">
					<span><i :class="kind === 'microphone' ? 'ti ti-microphone' : 'ti ti-headphones'" aria-hidden="true"></i> {{ deviceLabel(kind) }}</span>
					<select :value="deviceId(kind)" :class="$style.select" :disabled="state.busy || (kind === 'output' && !state.supportsOutputDevice)" @change="setDevice(kind, ($event.target as HTMLSelectElement).value)">
						<option value="">{{ i18n.ts._calls.systemDefaultDevice }}</option>
						<option v-for="(device, index) in devices(kind)" :key="device.deviceId" :value="device.deviceId">{{ device.label || `${deviceLabel(kind)} ${index + 1}` }}</option>
					</select>
				</label>
				<label :class="$style.field">
					<span>{{ kind === 'microphone' ? i18n.ts._calls.inputVolume : i18n.ts._calls.outputVolume }} <strong>{{ kind === 'microphone' ? state.inputVolume : state.outputVolume }}%</strong></span>
					<input type="range" min="0" :max="kind === 'microphone' ? 200 : 100" step="1" :value="kind === 'microphone' ? state.inputVolume : state.outputVolume" :disabled="state.busy" @input="kind === 'microphone' ? setInputVolume(Number(($event.target as HTMLInputElement).value)) : setOutputVolume(Number(($event.target as HTMLInputElement).value))">
				</label>
			</div>
		</div>
		<p v-if="!state.supportsOutputDevice" :class="$style.description">{{ i18n.ts._calls.outputDeviceUnsupported }}</p>
		<MkCallsMicrophoneTest :getSettings="getSettings"/>
		<button class="_button" :class="$style.refresh" :disabled="state.busy" @click="refreshDevices">{{ i18n.ts._calls.refreshDevices }}</button>
	</section>
	<section :class="$style.section">
		<label :class="$style.field">
			<span>{{ i18n.ts._calls.noiseSuppressionMode }}</span>
			<select :value="state.noiseSuppression" :class="$style.select" :disabled="state.busy" @change="setNoiseSuppression(($event.target as HTMLSelectElement).value as CallsNoiseSuppressionMode)">
				<option v-for="mode in modes" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
			</select>
		</label>
		<p :class="$style.description">{{ i18n.ts._calls.noiseSuppressionDescription }}</p>
		<label :class="$style.field">
			<span>{{ i18n.ts._calls.inputSensitivity }} <strong>{{ state.inputSensitivity <= -100 ? i18n.ts._calls.inputGateDisabled : `${state.inputSensitivity} dBFS` }}</strong></span>
			<input type="range" min="-100" max="0" step="1" :value="state.inputSensitivity" :disabled="state.busy" @input="setInputSensitivity(Number(($event.target as HTMLInputElement).value))">
		</label>
		<p :class="$style.description">{{ i18n.ts._calls.inputSensitivityDescription }}</p>
	</section>
	<section :class="$style.section">
		<h2>{{ i18n.ts._calls.camera }}</h2>
		<label :class="$style.field">
			<span>{{ i18n.ts._calls.selectCamera }}</span>
			<select :value="state.cameraId" :class="$style.select" :disabled="state.busy" @change="setDevice('camera', ($event.target as HTMLSelectElement).value)">
				<option value="">{{ i18n.ts._calls.systemDefaultDevice }}</option>
				<option v-for="(device, index) in state.cameras" :key="device.deviceId" :value="device.deviceId">{{ device.label || `${i18n.ts._calls.camera} ${index + 1}` }}</option>
			</select>
		</label>
		<MkCallsCameraPreview :deviceId="state.cameraId"/>
	</section>
</div>
</template>

<script lang="ts">
import type { CallsNoiseSuppressionMode } from '@/utility/calls-noise-suppression.js';

export type CallsGeneralSettingsProps = {
	getSettings: () => { noiseSuppression: CallsNoiseSuppressionMode; inputSensitivity: number; inputLevel: number; transmitting: boolean; busy: boolean; microphones: MediaDeviceInfo[]; cameras: MediaDeviceInfo[]; outputDevices: MediaDeviceInfo[]; microphoneId: string; cameraId: string; outputDeviceId: string; inputVolume: number; outputVolume: number; supportsOutputDevice: boolean };
	setNoiseSuppression: (mode: CallsNoiseSuppressionMode) => Promise<void>;
	setInputSensitivity: (threshold: number) => void;
	setInputVolume: (volume: number) => void;
	setOutputVolume: (volume: number) => void;
	setDevice: (kind: 'microphone' | 'camera' | 'output', deviceId: string) => Promise<void>;
	refreshDevices: () => Promise<void>;
};
</script>

<script setup lang="ts">
import { computed } from 'vue';
import MkCallsMicrophoneTest from '@/components/MkCallsMicrophoneTest.vue';
import MkCallsCameraPreview from '@/components/MkCallsCameraPreview.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<CallsGeneralSettingsProps>();
const state = computed(() => props.getSettings());
const audioDeviceKinds = ['microphone', 'output'] as const;
const modes = [
	{ value: 'rnnoise' as const, label: i18n.ts._calls.rnnoiseMode },
	{ value: 'webrtc' as const, label: i18n.ts._calls.webrtcMode },
	{ value: 'none' as const, label: i18n.ts._calls.noNoiseSuppression },
];

function deviceLabel(kind: typeof audioDeviceKinds[number]): string { return kind === 'microphone' ? i18n.ts._calls.microphone : i18n.ts._calls.outputDevice; }

function deviceId(kind: typeof audioDeviceKinds[number]): string { return kind === 'microphone' ? state.value.microphoneId : state.value.outputDeviceId; }

function devices(kind: typeof audioDeviceKinds[number]): MediaDeviceInfo[] { return kind === 'microphone' ? state.value.microphones : state.value.outputDevices; }
</script>

<style lang="scss" module>
.body { padding: 24px; container-type: inline-size; }
.section { display: flex; flex-direction: column; gap: 24px; }
.section + .section { margin-top: 32px; padding-top: 32px; border-top: 1px solid var(--MI_THEME-divider); }
.section h2 { font-size: 1.1em; margin: 0; }
.audioGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
@container (max-width: 440px) { .audioGrid { grid-template-columns: minmax(0, 1fr); } }
.refresh { align-self: flex-start; color: var(--MI_THEME-accent); font-size: 0.85em; text-align: left; }
.field { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.field > span { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.field > span:has(> i) { justify-content: flex-start; }
.field strong { font-size: 0.85em; font-variant-numeric: tabular-nums; }
.field input { width: 100%; margin: 0; accent-color: var(--MI_THEME-accent); }
.select { width: 100%; min-width: 0; padding: 10px; border: 1px solid var(--MI_THEME-divider); border-radius: 8px; background: var(--MI_THEME-panel); color: var(--MI_THEME-fg); font: inherit; text-overflow: ellipsis; }
.description { margin: -12px 0 0; font-size: 0.85em; line-height: 1.5; opacity: 0.7; }
</style>
