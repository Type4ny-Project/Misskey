<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section class="_panel" :class="$style.root" :aria-label="i18n.ts._calls.activities">
	<header :class="$style.header">
		<button v-if="activity != null" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts._calls.backToActivities" @click="activity = null"><i class="ti ti-arrow-left" aria-hidden="true"></i></button>
		<h2 :class="$style.title">{{ activity === 'drawing' ? i18n.ts._drawing.title : i18n.ts._calls.activities }}</h2>
		<button type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.close" @click="emit('close')"><i class="ti ti-x" aria-hidden="true"></i></button>
	</header>
	<MkCallsDrawing v-if="activity === 'drawing'" :room="room" @refresh="emit('refresh')"/>
	<button v-else type="button" class="_button" :class="$style.choice" @click="activity = 'drawing'">
		<i class="ti ti-brush" :class="$style.choiceIcon" aria-hidden="true"></i>
		<span><strong>{{ i18n.ts._drawing.title }}</strong><small>{{ i18n.ts._drawing.description }}</small></span>
		<i class="ti ti-chevron-right" aria-hidden="true"></i>
	</button>
</section>
</template>

<script setup lang="ts">
import { shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import MkCallsDrawing from './MkCallsDrawing.vue';
import { i18n } from '@/i18n.js';

defineProps<{ room: Misskey.entities.CallsRoom }>();
const emit = defineEmits<{ (ev: 'close'): void; (ev: 'refresh'): void }>();
const activity = shallowRef<'drawing' | null>(null);
</script>

<style lang="scss" module>
.root { padding: 16px; }
.header { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.title { flex: 1; margin: 0; font-size: 1rem; }
.iconButton { flex: 0 0 32px; height: 32px; border-radius: var(--MI-radius); }
.choice { display: flex; align-items: center; gap: 16px; width: 100%; padding: 16px; box-sizing: border-box; text-align: left; border-radius: var(--MI-radius); background: var(--MI_THEME-buttonBg); }
.choice:hover { background: var(--MI_THEME-buttonHoverBg); }
.choiceIcon { font-size: 28px; color: var(--MI_THEME-accent); }
.choice > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.choice strong, .choice small { display: block; }
.choice small { margin-top: 4px; color: var(--MI_THEME-fgTransparentWeak); }
</style>
