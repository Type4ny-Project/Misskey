<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkCallsRoomCard v-if="room != null" :room="room"/>
	<MkLoading v-else-if="loading"/>
	<a v-else :href="`${url}/calls/${roomId}`" class="_panel" :class="$style.unavailable"><i class="ti ti-phone-off" aria-hidden="true"></i> {{ i18n.ts._calls.roomUnavailable }}</a>
</div>
</template>

<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import MkCallsRoomCard from '@/components/MkCallsRoomCard.vue';
import { i18n } from '@/i18n.js';
import { retainCallsRoomConnection } from '@/composables/use-calls-room.js';

const props = defineProps<{ roomId: string }>();
const room = shallowRef<Misskey.entities.CallsRoom | null>(null);
const loading = ref(true);

watch(() => props.roomId, async (roomId, _, onCleanup) => {
	let disposed = false;
	const connection = retainCallsRoomConnection(roomId);
	onCleanup(() => { disposed = true; connection.dispose(); });
	room.value = null;
	loading.value = true;
	try {
		await connection.load();
		if (!disposed) room.value = connection.room.value;
	} catch {
		// Deleted rooms and rooms the viewer cannot access share the same unavailable card.
	} finally {
		if (!disposed) loading.value = false;
	}
}, { immediate: true });
</script>

<style lang="scss" module>
.root { display: block; width: 100%; max-width: 640px; margin-block: 8px; }
.unavailable { display: block; padding: 16px; border: 1px solid var(--MI_THEME-divider); border-radius: var(--MI-radius); }
</style>
