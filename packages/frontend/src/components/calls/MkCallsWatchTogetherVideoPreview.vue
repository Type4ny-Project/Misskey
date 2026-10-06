<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<a :href="url" :class="$style.root" target="_blank" rel="noopener noreferrer">
	<img :src="`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`" alt="" loading="lazy" referrerpolicy="no-referrer">
	<div :class="$style.text">
		<strong>{{ loading ? i18n.ts.loading : info?.title || url }}</strong>
		<p v-if="info?.description" :class="$style.description" :title="info.description">{{ info.description }}</p>
		<p v-else-if="failed" :class="$style.description">{{ i18n.ts.failedToPreviewUrl }}</p>
	</div>
</a>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import type { SummalyResult } from '@misskey-dev/summaly';
import { versatileLang } from '@@/js/intl-const.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ videoId: string }>();
const url = computed(() => `https://www.youtube.com/watch?v=${props.videoId}`);
const info = shallowRef<SummalyResult | null>(null);
const loading = ref(true);
const failed = ref(false);

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
.root { display: flex; align-items: start; gap: 12px; color: inherit; }
.root:hover strong { text-decoration: underline; }
.root img { flex: 0 0 80px; width: 80px; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 6px; }
.text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.description { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin: 4px 0 0; font-size: 0.85em; color: var(--MI_THEME-fgTransparentWeak); }
</style>
