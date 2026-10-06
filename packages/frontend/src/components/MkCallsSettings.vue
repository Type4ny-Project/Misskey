<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialog" :width="800" :height="780" @close="close" @esc="close" @closed="emit('closed')">
	<template #header><i class="ti ti-adjustments" aria-hidden="true"></i> {{ i18n.ts._calls.settings }}</template>
	<div :class="$style.layout">
		<nav :class="$style.sidebar" :aria-label="i18n.ts._calls.settings">
			<button class="_button" :class="{ [$style.active]: page === 'general' }" :aria-current="page === 'general' ? 'page' : undefined" @click="page = 'general'"><i class="ti ti-adjustments" aria-hidden="true"></i> {{ i18n.ts._calls.generalSettings }}</button>
			<button class="_button" :class="{ [$style.active]: page === 'statistics' }" :aria-current="page === 'statistics' ? 'page' : undefined" @click="page = 'statistics'"><i class="ti ti-chart-line" aria-hidden="true"></i> {{ i18n.ts._calls.statisticsSettings }}</button>
		</nav>
		<div :class="$style.content">
			<MkCallsConnectionInfo v-if="page === 'statistics' && !closing" :getInfo="getInfo"/>
			<div v-if="page === 'general'" :class="$style.body">
				<h2>{{ i18n.ts._calls.generalSettings }}</h2>
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
		</div>
	</div>
</MkModalWindow>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import type { CallsConnectionInfo } from '@/utility/calls-connection-info.js';
import type { CallsNoiseSuppressionMode } from '@/utility/calls-noise-suppression.js';
import MkCallsConnectionInfo from '@/components/MkCallsConnectionInfo.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	initialPage?: 'general' | 'statistics';
	getInfo: () => Promise<CallsConnectionInfo | null>;
	getSettings: () => { noiseSuppression: CallsNoiseSuppressionMode; inputSensitivity: number; inputLevel: number; transmitting: boolean; busy: boolean };
	setNoiseSuppression: (mode: CallsNoiseSuppressionMode) => Promise<void>;
	setInputSensitivity: (threshold: number) => void;
}>();
const emit = defineEmits<{ (ev: 'closed'): void }>();
const dialog = shallowRef<InstanceType<typeof MkModalWindow>>();
const page = ref(props.initialPage ?? 'general');
const closing = ref(false);

function close(): void { closing.value = true; dialog.value?.close(); }

const state = computed(props.getSettings);

function changeMode(event: Event): void {
	if (state.value.busy) return;
	void props.setNoiseSuppression((event.target as HTMLSelectElement).value as CallsNoiseSuppressionMode);
}
</script>

<style lang="scss" module>
.layout { display: flex; min-height: 100%; }
.sidebar { flex: 0 0 160px; padding: 16px 12px; border-right: 1px solid var(--MI_THEME-divider); }
.sidebar button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px; border-radius: 8px; text-align: left; }
.sidebar .active { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); }
.content { flex: 1; min-width: 0; }
.body { padding: 24px; }
.body h2 { font-size: 1.1em; margin: 0 0 24px; }
@media (max-width: 600px) {
	.layout { flex-direction: column; }
	.sidebar { flex: none; display: flex; border-right: 0; border-bottom: 1px solid var(--MI_THEME-divider); }
	.sidebar button { width: auto; flex: 1; }
}
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
