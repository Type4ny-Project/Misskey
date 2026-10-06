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
			<MkCallsGeneralSettings v-if="page === 'general'" :getSettings="getSettings" :setNoiseSuppression="setNoiseSuppression" :setInputSensitivity="setInputSensitivity" :setInputVolume="setInputVolume" :setOutputVolume="setOutputVolume" :setDevice="setDevice" :refreshDevices="refreshDevices"/>
		</div>
	</div>
</MkModalWindow>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import type { CallsConnectionInfo } from '@/utility/calls-connection-info.js';
import type { CallsGeneralSettingsProps } from '@/components/MkCallsGeneralSettings.vue';
import MkCallsGeneralSettings from '@/components/MkCallsGeneralSettings.vue';
import MkCallsConnectionInfo from '@/components/MkCallsConnectionInfo.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<CallsGeneralSettingsProps & {
	initialPage?: 'general' | 'statistics';
	getInfo: () => Promise<CallsConnectionInfo | null>;
}>();
const emit = defineEmits<{ (ev: 'closed'): void }>();
const dialog = shallowRef<InstanceType<typeof MkModalWindow>>();
const page = ref(props.initialPage ?? 'general');
const closing = ref(false);

function close(): void { closing.value = true; dialog.value?.close(); }

</script>

<style lang="scss" module>
.layout { display: flex; min-height: 100%; }
.sidebar { flex: 0 0 160px; padding: 16px 12px; border-right: 1px solid var(--MI_THEME-divider); }
.sidebar button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px; border-radius: 8px; text-align: left; }
.sidebar .active { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); }
.content { flex: 1; min-width: 0; }
@media (max-width: 600px) {
	.layout { flex-direction: column; }
	.sidebar { flex: none; display: flex; border-right: 0; border-bottom: 1px solid var(--MI_THEME-divider); }
	.sidebar button { width: auto; flex: 1; }
}
</style>
