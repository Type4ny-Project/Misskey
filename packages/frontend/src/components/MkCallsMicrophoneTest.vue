<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.row">
		<button class="_button" :class="$style.button" :disabled="state.busy && !testing" @click="testing ? stop() : start()">{{ testing ? i18n.ts._calls.stopMicrophoneTest : i18n.ts._calls.microphoneTest }}</button>
		<div :class="$style.meter" role="meter" :aria-label="i18n.ts._calls.inputLevel" aria-valuemin="-100" aria-valuemax="0" :aria-valuenow="Math.round(level)">
			<div :class="$style.fill" :style="{ width: `${Math.min(100, Math.max(0, level + 100))}%` }"></div>
		</div>
	</div>
	<p :class="$style.description">{{ i18n.ts._calls.microphoneTestDescription }}</p>
	<small>{{ Math.round(level) }} dBFS · {{ transmitting ? i18n.ts._calls.inputTransmitting : i18n.ts._calls.inputNotTransmitting }}</small>
</div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { CallsGeneralSettingsProps } from '@/components/MkCallsGeneralSettings.vue';
import type { CallsNoiseSuppression } from '@/utility/calls-noise-suppression.js';
import { createCallsNoiseSuppression } from '@/utility/calls-noise-suppression.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const props = defineProps<Pick<CallsGeneralSettingsProps, 'getSettings'>>();
const state = computed(() => props.getSettings());
const testing = ref(false);
const testLevel = ref(-100);
const testTransmitting = ref(false);
const level = computed(() => testing.value ? testLevel.value : state.value.inputLevel);
const transmitting = computed(() => testing.value ? testTransmitting.value : state.value.transmitting);
let abort: AbortController | null = null;
let stream: MediaStream | null = null;
let processing: CallsNoiseSuppression | null = null;
let audio: HTMLAudioElement | null = null;

function stop(): void {
	processing?.close();
	processing = null;
	abort?.abort();
	abort = null;
	stream?.getTracks().forEach(track => track.stop());
	stream = null;
	if (audio != null) { audio.pause(); audio.srcObject = null; audio = null; }
	testing.value = false;
	testLevel.value = -100;
	testTransmitting.value = false;
}

async function start(): Promise<void> {
	if (state.value.busy) return;
	const controller = new AbortController();
	abort = controller;
	testing.value = true;
	try {
		const captured = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: state.value.microphoneId ? { exact: state.value.microphoneId } : undefined, echoCancellation: true, autoGainControl: state.value.autoGainControl, noiseSuppression: state.value.noiseSuppression === 'webrtc' }, video: false });
		if (controller.signal.aborted) { captured.getTracks().forEach(track => track.stop()); return; }
		stream = captured;
		const processor = await createCallsNoiseSuppression(captured, error => { console.error('[Calls] Microphone test processor failed', error); stop(); void os.alert({ type: 'error', text: i18n.ts._calls.mediaFailed }); }, controller.signal, { rnnoise: state.value.noiseSuppression === 'rnnoise', inputSensitivity: state.value.inputSensitivity, inputVolume: state.value.inputVolume, onLevel: (value, open) => { testLevel.value = value; testTransmitting.value = open; } });
		if (controller.signal.aborted) { processor.close(); return; }
		processing = processor;
		audio = new Audio();
		audio.srcObject = new MediaStream([processing.track]);
		audio.volume = state.value.outputVolume / 100;
		if (state.value.supportsOutputDevice) await audio.setSinkId(state.value.outputDeviceId);
		if (controller.signal.aborted) return;
		await audio.play();
	} catch (error) {
		if (controller.signal.aborted) return;
		stop();
		console.error('[Calls] Microphone test failed', error);
		await os.alert({ type: 'error', text: i18n.ts._calls.mediaFailed });
	}
}

watch(() => [state.value.microphoneId, state.value.outputDeviceId, state.value.noiseSuppression, state.value.autoGainControl], stop);
watch(() => [state.value.inputVolume, state.value.outputVolume, state.value.inputSensitivity], () => {
	processing?.setInputVolume(state.value.inputVolume);
	processing?.setInputSensitivity(state.value.inputSensitivity);
	if (audio != null) audio.volume = state.value.outputVolume / 100;
});
onUnmounted(stop);
</script>

<style lang="scss" module>
.row { display: flex; align-items: center; gap: 18px; }
button.button { align-self: flex-start; width: max-content; max-width: 100%; flex: none; padding: 10px 16px; border-radius: 8px; background: var(--MI_THEME-accent); color: var(--MI_THEME-fgOnAccent); font-weight: bold; }
.meter { flex: 1; height: 24px; overflow: hidden; border-radius: 3px; background: var(--MI_THEME-divider); mask-image: repeating-linear-gradient(to right, #000 0 4px, transparent 4px 8px); }
.fill { height: 100%; background: var(--MI_THEME-accent); }
.description { margin: 12px 0 8px; font-size: 0.85em; line-height: 1.5; opacity: 0.7; }
.root small { opacity: 0.7; }
</style>
