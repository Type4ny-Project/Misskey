<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<figure ref="viewport" :class="[$style.root, screen && $style.screen, speaking && $style.speaking, focused && $style.focused]" @wheel="onWheel">
	<video ref="video" autoplay muted playsinline :aria-label="label" :class="$style.video" :style="screen ? { transform } : undefined" @loadedmetadata="constrain" @canplay="startPlayback"></video>
	<button type="button" class="_button" :class="$style.select" :aria-label="focused ? i18n.ts._calls.showVideoGrid : i18n.ts._calls.focusVideo" :aria-pressed="focused" @click="emit('select')"></button>
	<div v-if="screen && zoom > 100" :class="[$style.pan, dragging && $style.dragging]" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="stopDragging" @pointercancel="stopDragging" @lostpointercapture="stopDragging" @click.stop></div>
	<label v-if="screen" :class="$style.zoom" @click.stop @contextmenu.stop><input type="range" min="100" max="400" step="1" :value="zoom" :aria-label="i18n.ts._calls.screenZoom" @input="setZoom(($event.target as HTMLInputElement).valueAsNumber)"><span>{{ zoom }}%</span></label>
	<button v-if="needsPlayback" type="button" class="_button" :class="$style.play" :aria-label="i18n.ts._calls.resumeVideo" @click="startPlayback"><i class="ti ti-player-play"></i> {{ i18n.ts._calls.resumeVideo }}</button>
	<button v-if="screenWindow" type="button" class="_button" :class="$style.windowButton" :aria-label="i18n.ts.openInWindow" :title="i18n.ts.openInWindow" :aria-pressed="screenWindowActive" @click="emit('screenWindow')"><i class="ti ti-app-window"></i></button>
	<label v-if="audioVolume != null" :class="$style.volume" @click.stop @contextmenu.stop><i class="ti ti-volume"></i><input type="range" min="0" max="100" step="1" :value="audioVolume" :aria-label="`${i18n.ts._calls.screenAudioVolume}: ${label}`" @input="emit('volume', ($event.target as HTMLInputElement).valueAsNumber)"></label>
	<figcaption :class="$style.caption"><span>{{ label }}</span></figcaption>
</figure>
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { i18n } from '@/i18n.js';
import { useCallsScreenZoom } from '@/composables/use-calls-screen-zoom.js';

const props = defineProps<{
	stream: MediaStream;
	label: string;
	speaking?: boolean;
	focused?: boolean;
	screenWindow?: boolean;
	screen?: boolean;
	screenWindowActive?: boolean;
	audioVolume?: number;
}>();
const emit = defineEmits<{ (ev: 'select' | 'screenWindow'): void; (ev: 'volume', value: number): void }>();
const video = shallowRef<HTMLVideoElement | null>(null);
const viewport = shallowRef<HTMLElement | null>(null);
const { zoom, transform, dragging, setZoom, onWheel, onPointerDown, onPointerMove, stopDragging, reset, constrain } = useCallsScreenZoom(viewport, video, computed(() => props.screen === true));
const needsPlayback = shallowRef(false);

function startPlayback(): void {
	const element = video.value;
	if (element == null) return;
	element.muted = true;
	void element.play().then(() => { needsPlayback.value = false; }, error => {
		console.error('[Calls] Video playback failed', error);
		needsPlayback.value = true;
	});
}

watch([video, () => props.stream], ([element, stream]) => {
	if (element == null) return;
	reset();
	element.srcObject = stream;
	startPlayback();
}, { flush: 'post' });

</script>

<style lang="scss" module>
.root {
	position: relative;
	margin: 0;
	overflow: hidden;
	min-width: 0;
	min-height: 0;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-bg);
}

.root:hover, .root:focus-within { outline: 2px solid var(--MI_THEME-accent); outline-offset: -2px; }
.root:hover > .caption, .root:focus-within > .caption, .root:hover > .windowButton, .root:focus-within > .windowButton { opacity: 1; }

.speaking { outline: 3px solid var(--MI_THEME-accent); outline-offset: -3px; }
.focused { background: var(--MI_THEME-panel); }
.select { position: absolute; inset: 0; cursor: zoom-in; }
.focused > .select { cursor: zoom-out; }
.select:focus-visible { outline: 2px solid var(--MI_THEME-accent); outline-offset: -2px; }

.video {
	display: block;
	width: 100%;
	height: 100%;
	aspect-ratio: 16 / 9;
	object-fit: contain;
	background: var(--MI_THEME-bg);
}

.caption {
	opacity: 0;
	transition: opacity 0.18s ease;
	position: absolute;
	left: 12px;
	bottom: 12px;
	display: flex;
	align-items: center;
	gap: 6px;
	max-width: calc(100% - 76px);
	padding: 6px 8px;
	border-radius: 6px;
	background: var(--MI_THEME-panel);
	font-size: 0.8rem;
	pointer-events: none;
}

.screen > .caption { bottom: 52px; }

.caption > span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.volume { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 8px; background: var(--MI_THEME-panel); }
.volume > input { width: 100px; accent-color: var(--MI_THEME-accent); }

.windowButton { position: absolute; bottom: 8px; right: 8px; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 8px; background: var(--MI_THEME-panel); font-size: 20px; opacity: 0; transition: opacity 0.18s ease; }
.play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--MI_THEME-panel); }
@media (pointer: coarse) { .caption, .windowButton { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .caption, .windowButton { transition: none; } }
.pan { position: absolute; inset: 0; cursor: grab; touch-action: none; }
.pan.dragging { cursor: grabbing; }
.zoom { position: absolute; right: 56px; bottom: 8px; display: flex; align-items: center; gap: 6px; max-width: calc(100% - 80px); padding: 6px 8px; border-radius: 8px; background: var(--MI_THEME-panel); }
.zoom > input { width: 100px; min-width: 0; accent-color: var(--MI_THEME-accent); }
.zoom > span { min-width: 4ch; text-align: right; font-size: 0.8rem; font-variant-numeric: tabular-nums; }
</style>
