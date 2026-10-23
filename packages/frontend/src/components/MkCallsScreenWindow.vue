<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkWindow :initialWidth="480" :initialHeight="320" canResize front @closed="emit('closed')">
	<template #header><i class="ti ti-app-window"></i> {{ label }}</template>
	<div ref="viewport" :class="$style.content" @wheel="onWheel">
		<video ref="video" autoplay muted playsinline :aria-label="label" :class="$style.video" :style="{ transform }" @loadedmetadata="constrain" @canplay="play"></video>
		<div v-if="zoom > 100" :class="[$style.pan, dragging && $style.dragging]" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="stopDragging" @pointercancel="stopDragging" @lostpointercapture="stopDragging" @click.stop></div>
		<label :class="$style.zoom" @click.stop @contextmenu.stop><input type="range" min="100" max="400" step="1" :value="zoom" :aria-label="i18n.ts._calls.screenZoom" @input="setZoom(($event.target as HTMLInputElement).valueAsNumber)"><span>{{ zoom }}%</span></label>
		<label v-if="screenVideo != null && session.screenAudioIds.value.has(screenVideo.id)" :class="$style.volume"><i class="ti ti-volume"></i><input type="range" min="0" max="100" step="1" :value="session.getScreenVolume(screenVideo.id)" :aria-label="i18n.ts._calls.screenAudioVolume" @input="session.setScreenVolume(screenVideo.id, ($event.target as HTMLInputElement).valueAsNumber)"></label>
	</div>
</MkWindow>
</template>

<script setup lang="ts">
import { computed, onUnmounted, shallowRef, watch } from 'vue';
import MkWindow from '@/components/MkWindow.vue';
import { useCallsSession } from '@/utility/calls-session.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { useCallsScreenZoom } from '@/composables/use-calls-screen-zoom.js';

const props = defineProps<{
	stream: MediaStream;
	label: string;
}>();

const emit = defineEmits<{ (ev: 'closed'): void }>();
const session = useCallsSession();
const screenVideo = computed(() => session.videos.value.find(item => !item.local && item.stream === props.stream));
const video = shallowRef<HTMLVideoElement | null>(null);
const viewport = shallowRef<HTMLElement | null>(null);
const { zoom, transform, dragging, setZoom, onWheel, onPointerDown, onPointerMove, stopDragging, reset, constrain } = useCallsScreenZoom(viewport, video, computed(() => true));

function play(): void {
	if (video.value?.srcObject == null) return;
	void video.value.play().catch(error => {
		console.error('[Calls] Screen window playback failed', error);
		void os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	});
}

watch([video, () => props.stream], ([element, stream]) => {
	if (element == null) return;
	reset();
	element.srcObject = stream;
	play();
}, { flush: 'post' });

onUnmounted(() => {
	video.value?.pause();
	if (video.value != null) video.value.srcObject = null;
});
</script>

<style lang="scss" module>
.content { position: relative; height: 100%; overflow: hidden; }
.volume { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 8px; background: var(--MI_THEME-panel); }
.volume > input { width: 100px; accent-color: var(--MI_THEME-accent); }
.video { display: block; width: 100%; height: 100%; object-fit: contain; background: var(--MI_THEME-bg); }
.pan { position: absolute; inset: 0; cursor: grab; touch-action: none; }
.pan.dragging { cursor: grabbing; }
.zoom { position: absolute; right: 8px; bottom: 8px; display: flex; align-items: center; gap: 6px; max-width: calc(100% - 32px); padding: 6px 8px; border-radius: 8px; background: var(--MI_THEME-panel); }
.zoom > input { width: 100px; min-width: 0; accent-color: var(--MI_THEME-accent); }
.zoom > span { min-width: 4ch; text-align: right; font-size: 0.8rem; font-variant-numeric: tabular-nums; }
</style>
