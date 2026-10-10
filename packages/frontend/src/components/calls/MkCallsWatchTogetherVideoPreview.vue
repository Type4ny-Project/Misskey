<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<a :href="url" :class="$style.root" target="_blank" rel="noopener noreferrer" @contextmenu="contextMenu" @pointerdown="startPress" @pointermove="movePress" @pointerup="cancelPress" @pointercancel="cancelPress" @click="click">
	<img :src="`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`" alt="" loading="lazy" referrerpolicy="no-referrer">
	<div :class="$style.text">
		<strong :title="info?.title ?? undefined">{{ loading ? i18n.ts.loading : info?.title || url }}</strong>
		<p v-if="info?.description" :class="$style.description" :title="info.description">{{ info.description }}</p>
		<p v-else-if="failed" :class="$style.description">{{ i18n.ts.failedToPreviewUrl }}</p>
	</div>
</a>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue';
import type { SummalyResult } from '@misskey-dev/summaly';
import { versatileLang } from '@@/js/intl-const.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ videoId: string; canControl?: boolean }>();
const emit = defineEmits<{ (ev: 'menu', event: PointerEvent): void }>();
const url = computed(() => `https://www.youtube.com/watch?v=${props.videoId}`);
const info = shallowRef<SummalyResult | null>(null);
const loading = ref(true);
const failed = ref(false);

let pressTimer: number | null = null;
let pressPoint = { x: 0, y: 0 };
let held = false;

function cancelPress() {
	if (pressTimer != null) window.clearTimeout(pressTimer);
	pressTimer = null;
}

function startPress(event: PointerEvent) {
	cancelPress();
	held = false;
	if (!props.canControl || event.pointerType === 'mouse' || event.button !== 0) return;
	// Suppress compatibility mouse events that would dismiss the menu on release.
	event.preventDefault();
	pressPoint = { x: event.clientX, y: event.clientY };
	pressTimer = window.setTimeout(() => {
		pressTimer = null;
		held = true;
		emit('menu', event);
	}, 500);
}

function movePress(event: PointerEvent) {
	if (Math.hypot(event.clientX - pressPoint.x, event.clientY - pressPoint.y) > 10) cancelPress();
}

function contextMenu(event: PointerEvent) {
	if (!props.canControl) return;
	cancelPress();
	// Touch long-press may also generate a native contextmenu event.
	event.preventDefault();
	event.stopPropagation();
	if (held) return;
	emit('menu', event);
}

function click(event: MouseEvent) {
	if (held) event.preventDefault();
	held = false;
}

onUnmounted(cancelPress);

watch(url, async (value, _, onCleanup) => {
	const controller = new AbortController();
	onCleanup(() => controller.abort());
	info.value = null;
	loading.value = true;
	failed.value = false;
	try {
		const response = await window.fetch(`/url?url=${encodeURIComponent(value)}&lang=${versatileLang}`, { signal: controller.signal });
		if (!response.ok) throw new Error('Video preview unavailable');
		const summary = await response.json() as SummalyResult;
		if (controller.signal.aborted) return;
		info.value = summary;
		failed.value = !summary.title;
	} catch {
		if (controller.signal.aborted) return;
		failed.value = true;
	} finally { if (!controller.signal.aborted) loading.value = false; }
}, { immediate: true });
</script>

<style lang="scss" module>
.root { display: flex; align-items: center; gap: 12px; color: inherit; -webkit-touch-callout: none; }
.root:hover strong { text-decoration: underline; }
.root img { flex: 0 0 80px; width: 80px; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 6px; }
.text { flex: 1; min-width: 0; }
.text strong, .description { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.description { margin: 4px 0 0; font-size: 0.85em; color: var(--MI_THEME-fgTransparentWeak); }
</style>
