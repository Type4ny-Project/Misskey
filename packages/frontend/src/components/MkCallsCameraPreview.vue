<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_s">
	<button class="_button" :class="$style.button" @click="pending || stream ? stop() : preview()">{{ pending || stream ? i18n.ts.close : i18n.ts._calls.previewCamera }}</button>
	<video v-if="stream" ref="video" :class="$style.video" autoplay muted playsinline :aria-label="i18n.ts._calls.camera"></video>
</div>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, ref, shallowRef, watch } from 'vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const props = defineProps<{ deviceId: string }>();
const stream = shallowRef<MediaStream | null>(null);
const video = shallowRef<HTMLVideoElement>();
const pending = ref(false);
let generation = 0;

function stop(): void {
	generation++;
	stream.value?.getTracks().forEach(track => track.stop());
	stream.value = null;
	pending.value = false;
}

async function preview(): Promise<void> {
	const request = ++generation;
	pending.value = true;
	try {
		const captured = await navigator.mediaDevices.getUserMedia({ video: { deviceId: props.deviceId ? { exact: props.deviceId } : undefined }, audio: false });
		if (request !== generation) { captured.getTracks().forEach(track => track.stop()); return; }
		stream.value = captured;
		await nextTick();
		if (request !== generation || video.value == null) return;
		video.value.srcObject = captured;
		await video.value.play();
	} catch (error) {
		if (request !== generation) return;
		stop();
		console.error('[Calls] Camera preview failed', error);
		await os.alert({ type: 'error', text: i18n.ts._calls.videoFailed });
	} finally {
		if (request === generation) pending.value = false;
	}
}

watch(() => props.deviceId, stop);
onUnmounted(stop);
</script>

<style lang="scss" module>
button.button { align-self: flex-start; width: max-content; max-width: 100%; padding: 10px 16px; border-radius: 8px; background: var(--MI_THEME-accent); color: var(--MI_THEME-fgOnAccent); font-weight: bold; }
.video { display: block; width: 100%; max-height: 320px; object-fit: contain; background: #000; border-radius: 8px; }
</style>
