<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialog" :width="560" :height="480" @close="finish(false)" @esc="finish(false)" @closed="emit('closed')">
	<template #header><i class="ti ti-camera" aria-hidden="true"></i> {{ i18n.ts._calls.cameraPreview }}</template>
	<div :class="$style.body">
		<video ref="video" autoplay muted playsinline :class="$style.video" :aria-label="i18n.ts._calls.cameraPreview"></video>
		<p>{{ i18n.ts._calls.cameraPreviewDescription }}</p>
		<div :class="$style.actions">
			<MkButton :disabled="submitted" @click="finish(false)">{{ i18n.ts.cancel }}</MkButton>
			<MkButton primary :disabled="submitted" @click="finish(true)">{{ i18n.ts._calls.startCamera }}</MkButton>
		</div>
	</div>
</MkModalWindow>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{ stream: MediaStream }>();
const emit = defineEmits<{ (ev: 'done', confirmed: boolean): void; (ev: 'closed'): void }>();
const dialog = shallowRef<InstanceType<typeof MkModalWindow>>();
const video = shallowRef<HTMLVideoElement>();
const submitted = ref(false);

function finish(confirmed: boolean): void {
	if (submitted.value) return;
	submitted.value = true;
	emit('done', confirmed);
	dialog.value?.close();
}

onMounted(() => {
	if (video.value != null) video.value.srcObject = props.stream;
});
onUnmounted(() => {
	if (video.value != null) { video.value.pause(); video.value.srcObject = null; }
});
</script>

<style lang="scss" module>
.body { padding: 20px; }
.video { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: contain; transform: scaleX(-1); background: var(--MI_THEME-bg); border-radius: var(--MI-radius); }
.actions { display: flex; justify-content: flex-end; gap: 12px; }
</style>
