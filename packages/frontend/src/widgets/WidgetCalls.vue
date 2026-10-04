<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" class="mkw-calls" data-testid="mkw-calls">
	<template #icon><i class="ti ti-headphones"></i></template>
	<template #header>{{ i18n.ts._widgets.calls }}</template>
	<template #func="{ buttonStyleClass }"><button type="button" class="_button" :class="buttonStyleClass" :aria-label="i18n.ts.reload" @click="fetchRooms"><i class="ti ti-refresh"></i></button></template>
	<MkLoading v-if="fetching"/>
	<MkError v-else-if="failed" @retry="fetchRooms"/>
	<div v-else-if="rooms.length === 0" :class="$style.empty">{{ i18n.ts._calls.noFollowingRooms }}</div>
	<div v-else :class="$style.rooms">
		<MkCallsRoomCard v-for="room in rooms" :key="room.id" :room="room" compact/>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { onUnmounted, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { useInterval } from '@@/js/use-interval.js';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkCallsRoomCard from '@/components/MkCallsRoomCard.vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { useStream } from '@/stream.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const name = 'calls';
const widgetPropsDef = {
	showHeader: { type: 'boolean', label: i18n.ts._widgetOptions.showHeader, default: true },
} satisfies FormWithDefault;
type WidgetProps = GetFormResultType<typeof widgetPropsDef>;
const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();
const { widgetProps, configure } = useWidgetPropsManager(name, widgetPropsDef, props, emit);

const rooms = ref<Misskey.entities.CallsRoom[]>([]);
const fetching = ref(true);
const failed = ref(false);

async function fetchRooms(): Promise<void> {
	if ($i == null) { fetching.value = false; return; }
	try {
		rooms.value = await misskeyApi('calls/rooms/list', { limit: 10, states: ['open'], following: true });
		failed.value = false;
	} catch (error) {
		console.error('[Calls] Widget room loading failed', error);
		failed.value = true;
	} finally { fetching.value = false; }
}

const stream = $i == null ? null : useStream();
const channel = stream?.useChannel('callsRooms');
channel?.on('created', fetchRooms);
channel?.on('updated', fetchRooms);
stream?.on('_connected_', fetchRooms);
useInterval(() => { void fetchRooms(); }, 60_000, { immediate: true, afterMounted: true });
onUnmounted(() => {
	channel?.dispose();
	stream?.off('_connected_', fetchRooms);
});

defineExpose<WidgetComponentExpose>({ name, configure, id: props.widget ? props.widget.id : null });
</script>

<style lang="scss" module>
.empty { padding: 20px 12px; font-size: 0.85rem; color: var(--MI_THEME-fgTransparentWeak); text-align: center; }
.rooms > button + button { box-shadow: inset 0 1px 0 var(--MI_THEME-divider); }
</style>
