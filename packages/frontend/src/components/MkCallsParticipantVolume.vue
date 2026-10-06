<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<label :class="$style.root" @click.stop>
	<span>{{ i18n.ts.volume }} · {{ volume }}%</span>
	<input type="range" min="0" max="200" step="1" :value="volume" :aria-label="`${i18n.ts.volume}: ${label}`" @input="session.setParticipantVolume(userId, ($event.target as HTMLInputElement).valueAsNumber)">
</label>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { i18n } from '@/i18n.js';
import { useCallsSession } from '@/utility/calls-session.js';

const props = defineProps<{ userId: string; label: string }>();
const session = useCallsSession();
const volume = computed(() => session.getParticipantVolume(props.userId));
</script>

<style lang="scss" module>
.root { display: flex; flex-direction: column; gap: 8px; min-width: 200px; padding: 12px 16px; }
.root input { width: 100%; accent-color: var(--MI_THEME-accent); }
</style>
