<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<figure :class="[$style.root, speaking && $style.speaking, focused && $style.focused]">
	<video ref="video" autoplay muted playsinline :aria-label="label" :class="$style.video" @canplay="startPlayback"></video>
	<button type="button" class="_button" :class="$style.select" :aria-label="focused ? i18n.ts._calls.showVideoGrid : i18n.ts._calls.focusVideo" :aria-pressed="focused" @click="emit('select')"></button>
	<button v-if="needsPlayback" type="button" class="_button" :class="$style.play" :aria-label="i18n.ts._calls.resumeVideo" @click="startPlayback"><i class="ti ti-player-play"></i> {{ i18n.ts._calls.resumeVideo }}</button>
	<button v-if="screenWindow" type="button" class="_button" :class="$style.windowButton" :aria-label="i18n.ts.openInWindow" :title="i18n.ts.openInWindow" :aria-pressed="screenWindowActive" @click="emit('screenWindow')"><i class="ti ti-app-window"></i></button>
	<figcaption :class="$style.caption"><span>{{ label }}</span></figcaption>
</figure>
</template>

<script setup lang="ts">
import { shallowRef, watch } from 'vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	stream: MediaStream;
	label: string;
	speaking?: boolean;
	focused?: boolean;
	screenWindow?: boolean;
	screenWindowActive?: boolean;
}>();
const emit = defineEmits<{ (ev: 'select' | 'screenWindow'): void }>();
const video = shallowRef<HTMLVideoElement | null>(null);
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

.caption > span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.windowButton { position: absolute; bottom: 8px; right: 8px; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 8px; background: var(--MI_THEME-panel); font-size: 20px; opacity: 0; transition: opacity 0.18s ease; }
.play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--MI_THEME-panel); }
@media (pointer: coarse) { .caption, .windowButton { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .caption, .windowButton { transition: none; } }
</style>
