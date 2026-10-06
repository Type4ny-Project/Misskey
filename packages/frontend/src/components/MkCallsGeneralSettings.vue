<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.body">
	<h2>{{ i18n.ts._calls.generalSettings }}</h2>
	<div :class="$style.devices">
		<label v-for="kind in deviceKinds" :key="kind" :class="$style.field">
			<span>{{ deviceLabel(kind) }}</span>
			<select :value="deviceId(kind)" :class="$style.select" :disabled="state.busy || (kind === 'output' && !state.supportsOutputDevice)" @change="setDevice(kind, ($event.target as HTMLSelectElement).value)">
				<option value="">{{ i18n.ts._calls.systemDefaultDevice }}</option>
				<option v-for="(device, index) in devices(kind)" :key="device.deviceId" :value="device.deviceId">{{ device.label || `${deviceLabel(kind)} ${index + 1}` }}</option>
			</select>
		</label>
		<button class="_button" :class="$style.refresh" :disabled="state.busy" @click="refreshDevices">{{ i18n.ts._calls.refreshDevices }}</button>
		<p v-if="!state.supportsOutputDevice" :class="$style.description">{{ i18n.ts._calls.outputDeviceUnsupported }}</p>
		<label :class="$style.field">
			<span>{{ i18n.ts._calls.inputVolume }} <strong>{{ state.inputVolume }}%</strong></span>
			<input type="range" min="0" max="200" step="1" :value="state.inputVolume" :disabled="state.busy" @input="setInputVolume(Number(($event.target as HTMLInputElement).value))">
		</label>
		<label :class="$style.field">
			<span>{{ i18n.ts._calls.outputVolume }} <strong>{{ state.outputVolume }}%</strong></span>
			<input type="range" min="0" max="100" step="1" :value="state.outputVolume" @input="setOutputVolume(Number(($event.target as HTMLInputElement).value))">
		</label>
	</div>

	<label :class="$style.field">
		<span>{{ i18n.ts._calls.noiseSuppressionMode }}</span>
		<select :value="state.noiseSuppression" :disabled="state.busy" :class="$style.select" @change="changeMode">
			<option value="rnnoise">{{ i18n.ts._calls.rnnoiseMode }}</option>
			<option value="webrtc">{{ i18n.ts._calls.webrtcMode }}</option>
			<option value="none">{{ i18n.ts._calls.noNoiseSuppression }}</option>
		</select>
	</label>
	<p :class="$style.description">{{ i18n.ts._calls.noiseSuppressionDescription }}</p>
	<label :class="$style.field">
		<span>{{ i18n.ts._calls.inputSensitivity }} <strong>{{ state.inputSensitivity <= -100 ? i18n.ts._calls.inputGateDisabled : `${state.inputSensitivity} dBFS` }}</strong></span>
		<input type="range" min="-100" max="0" step="1" :value="state.inputSensitivity" :disabled="state.busy" @input="setInputSensitivity(Number(($event.target as HTMLInputElement).value))">
	</label>
	<p :class="$style.description">{{ i18n.ts._calls.inputSensitivityDescription }}</p>
	<div :class="$style.field">
		<span>{{ i18n.ts._calls.inputLevel }} <strong>{{ Math.round(state.inputLevel) }} dBFS</strong></span>
		<div :class="$style.meter">
			<meter min="-100" max="0" :value="state.inputLevel" :aria-label="i18n.ts._calls.inputLevel"></meter>
			<span :class="$style.threshold" :style="{ left: `${state.inputSensitivity + 100}%` }" aria-hidden="true"></span>
		</div>
		<small :class="{ [$style.transmitting]: state.transmitting }">{{ state.transmitting ? i18n.ts._calls.inputTransmitting : i18n.ts._calls.inputNotTransmitting }}</small>
	</div>
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
import { i18n } from '@/i18n.js';

const props = defineProps<CallsGeneralSettingsProps>();
const state = computed(() => props.getSettings());
const deviceKinds = ['microphone', 'output', 'camera'] as const;

function deviceLabel(kind: typeof deviceKinds[number]): string { return kind === 'microphone' ? i18n.ts._calls.microphone : kind === 'camera' ? i18n.ts._calls.camera : i18n.ts._calls.outputDevice; }

function deviceId(kind: typeof deviceKinds[number]): string { return kind === 'microphone' ? state.value.microphoneId : kind === 'camera' ? state.value.cameraId : state.value.outputDeviceId; }

function devices(kind: typeof deviceKinds[number]): MediaDeviceInfo[] { return kind === 'microphone' ? state.value.microphones : kind === 'camera' ? state.value.cameras : state.value.outputDevices; }

function changeMode(event: Event): void {
	if (state.value.busy) return;
	void props.setNoiseSuppression((event.target as HTMLSelectElement).value as CallsNoiseSuppressionMode);
}
</script>

<style lang="scss" module>
.body { padding: 24px; }
.body h2 { font-size: 1.1em; margin: 0 0 24px; }
.devices { display: flex; flex-direction: column; gap: 20px; margin-bottom: 28px; }
.refresh { align-self: flex-start; color: var(--MI_THEME-accent); }
.field { display: flex; flex-direction: column; gap: 12px; }
.field > span { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.field strong { font-size: 0.85em; font-variant-numeric: tabular-nums; }
.field input { width: 100%; margin: 0; accent-color: var(--MI_THEME-accent); }
.select { padding: 10px; border: 1px solid var(--MI_THEME-divider); border-radius: 8px; background: var(--MI_THEME-panel); color: var(--MI_THEME-fg); font: inherit; }
.description { margin: 12px 0 24px; font-size: 0.85em; line-height: 1.5; opacity: 0.7; }
.meter { position: relative; }
.meter meter { display: block; width: 100%; height: 16px; }
.threshold { position: absolute; top: 0; height: 16px; width: 2px; background: var(--MI_THEME-fg); }
.transmitting { color: var(--MI_THEME-accent); }
</style>
