<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<dl :class="$style.root">
	<div :class="$style.item">
		<dt :class="$style.label">{{ i18n.ts._calls.startedAt }}</dt>
		<dd :class="$style.value"><time v-if="startedAt != null" :datetime="startedAt.toISOString()">{{ date(startedAt) }}</time><span v-else>{{ i18n.ts.unknown }}</span></dd>
	</div>
	<div :class="$style.item">
		<dt :class="$style.label">{{ i18n.ts._calls.endedAt }}</dt>
		<dd :class="$style.value"><time v-if="endedAt != null" :datetime="endedAt.toISOString()">{{ date(endedAt) }}</time><span v-else>{{ i18n.ts.unknown }}</span></dd>
	</div>
	<div :class="$style.item">
		<dt :class="$style.label">{{ i18n.ts._calls.totalDuration }}</dt>
		<dd :class="[$style.value, $style.duration]">{{ duration }}</dd>
	</div>
</dl>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import date from '@/filters/date.js';

const props = defineProps<{
	room: Pick<Misskey.entities.CallsRoom, 'startedAt' | 'endedAt'>;
}>();

function parseDate(value: string | null | undefined): Date | null {
	if (value == null || value.trim() === '') return null;
	const parsed = new Date(value);
	return Number.isFinite(parsed.getTime()) ? parsed : null;
}

const startedAt = computed(() => parseDate(props.room.startedAt));
const endedAt = computed(() => parseDate(props.room.endedAt));
const duration = computed(() => {
	if (startedAt.value == null || endedAt.value == null) return i18n.ts.unknown;
	const milliseconds = endedAt.value.getTime() - startedAt.value.getTime();
	if (milliseconds < 0) return i18n.ts.unknown;
	const seconds = Math.floor(milliseconds / 1000);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor(seconds / 60) % 60;
	return [...(hours > 0 ? [hours] : []), minutes, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-width: 0;
	margin: 0;
}

.item {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	justify-content: space-between;
	gap: 4px 16px;
	min-width: 0;
}

.label {
	font-size: 0.85rem;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow-wrap: anywhere;
}

.value {
	min-width: 0;
	margin: 0;
	overflow-wrap: anywhere;
}

.duration {
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}
</style>
