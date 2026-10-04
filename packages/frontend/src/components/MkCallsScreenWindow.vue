<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkWindow :initialWidth="480" :initialHeight="320" canResize front @closed="emit('closed')">
	<template #header><i class="ti ti-app-window"></i> {{ callsScreenWindowLabel }}</template>
	<video ref="video" autoplay muted playsinline :aria-label="callsScreenWindowLabel" :class="$style.video" @canplay="play"></video>
</MkWindow>
</template>

<script setup lang="ts">
import { onUnmounted, shallowRef, watch } from 'vue';
import MkWindow from '@/components/MkWindow.vue';
import { callsScreenWindowLabel, callsScreenWindowStream } from '@/utility/calls-screen-window.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const emit = defineEmits<{ (ev: 'closed'): void }>();
const video = shallowRef<HTMLVideoElement | null>(null);

function play(): void {
	if (video.value?.srcObject == null) return;
	void video.value.play().catch(error => {
		console.error('[Calls] Screen window playback failed', error);
		void os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	});
}

watch([video, callsScreenWindowStream], ([element, stream]) => {
	if (element == null) return;
	element.srcObject = stream;
	play();
}, { flush: 'post' });

onUnmounted(() => {
	video.value?.pause();
	if (video.value != null) video.value.srcObject = null;
});
</script>

<style lang="scss" module>
.video { display: block; width: 100%; height: 100%; object-fit: contain; background: var(--MI_THEME-bg); }
</style>
