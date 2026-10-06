<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section class="_panel" :class="$style.root" :aria-label="i18n.ts._calls.activities">
	<header :class="$style.header">
		<button v-if="activity != null" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts._calls.backToActivities" @click="activity = null"><i class="ti ti-arrow-left" aria-hidden="true"></i></button>
		<h2 :class="$style.title">{{ activity?.title ?? i18n.ts._calls.activities }}</h2>
		<button type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.close" @click="emit('close')"><i class="ti ti-x" aria-hidden="true"></i></button>
	</header>
	<slot v-if="activity != null" :activity="activity.id"></slot>
	<div v-else class="_gaps_s">
		<p v-if="activities.length === 0">{{ i18n.ts._calls.noActivities }}</p>
		<button v-for="choice in activities" :key="choice.id" type="button" class="_button" :class="$style.choice" @click="activity = choice">
			<i :class="[choice.icon, $style.choiceIcon]" aria-hidden="true"></i>
			<span><strong>{{ choice.title }}</strong><small>{{ choice.description }}</small></span>
			<i class="ti ti-chevron-right" aria-hidden="true"></i>
		</button>
	</div>
</section>
</template>

<script lang="ts">
export type CallsActivity = {
	id: string;
	title: string;
	description: string;
	icon: string;
};
</script>

<script setup lang="ts">
import { shallowRef } from 'vue';
import { i18n } from '@/i18n.js';

defineProps<{ activities: CallsActivity[] }>();
const emit = defineEmits<{ (ev: 'close'): void }>();
const activity = shallowRef<CallsActivity | null>(null);
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
