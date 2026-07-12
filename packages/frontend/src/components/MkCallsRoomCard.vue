<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<article class="_panel" :class="$style.root">
	<div v-if="room.state === 'open'" :class="$style.live">● {{ i18n.ts._calls.live }}</div>
	<div v-else :class="$style.state">{{ i18n.ts._calls[room.state] }}</div>
	<div :class="$style.body">
		<strong>{{ room.title }}</strong>
		<div v-if="hostUser != null" :class="$style.host">
			<MkAvatar :user="hostUser" indicator :class="$style.avatar"/>
			<MkUserName :user="hostUser"/>
		</div>
	</div>
	<div :class="$style.counts">
		<span><i class="ti ti-microphone"></i> {{ speakerCount }}</span>
		<span><i class="ti ti-headphones"></i> {{ listenerCount }}</span>
	</div>
	<MkButton v-if="room.state === 'open'" primary rounded @click="openJoinDialog"><i class="ti ti-door-enter"></i> {{ i18n.ts._calls.joinRoom }}</MkButton>
</article>
</template>

<script setup lang="ts">
import { computed, onUnmounted, shallowRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkCallsJoinDialog from '@/components/MkCallsJoinDialog.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { createCallsRoomConnection } from '@/composables/use-calls-room.js';

const props = defineProps<{
	room: Misskey.entities.CallsRoom;
}>();

const connection = shallowRef<ReturnType<typeof createCallsRoomConnection> | null>(null);
const participants = computed(() => connection.value?.participants.value ?? []);
const hostUser = shallowRef<Misskey.entities.UserLite | null>(null);
const speakerCount = computed(() => participants.value.filter(participant => participant.role !== 'listener').length);
const listenerCount = computed(() => participants.value.filter(participant => participant.role === 'listener').length);

async function connectRoom(roomId: string): Promise<void> {
	connection.value?.dispose();
	connection.value = createCallsRoomConnection(roomId);
	await connection.value.refresh().catch(() => undefined);
}

function openJoinDialog(): void {
	os.popup(MkCallsJoinDialog, { roomId: props.room.id }, { closed: () => undefined });
}

watch(() => props.room.id, roomId => void connectRoom(roomId), { immediate: true });
watch(() => participants.value.find(participant => participant.role === 'host')?.userId, async userId => {
	hostUser.value = userId == null ? null : await misskeyApi('users/show', { userId }).catch(() => null);
}, { immediate: true });
onUnmounted(() => connection.value?.dispose());
</script>

<style lang="scss" module>
.root { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 14px; padding: 14px; }
.live { padding: 4px 8px; border-radius: 999px; background: color-mix(in srgb, var(--MI_THEME-error) 14%, transparent); color: var(--MI_THEME-error); font-size: 0.72em; font-weight: 800; letter-spacing: 0.05em; }
.state { padding: 4px 8px; border-radius: 999px; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); font-size: 0.72em; font-weight: 700; }
.body { min-width: 0; }
.body > strong { display: block; overflow: hidden; font-size: 1.05em; text-overflow: ellipsis; white-space: nowrap; }
.host { display: flex; min-width: 0; align-items: center; gap: 6px; margin-top: 6px; opacity: 0.75; }
.avatar { width: 24px; height: 24px; flex-shrink: 0; }
.counts { display: flex; align-items: center; gap: 10px; opacity: 0.72; }

@media (max-width: 600px) {
	.root { grid-template-columns: auto minmax(0, 1fr); }
	.counts { grid-column: 1 / -1; }
	.root > :last-child { grid-column: 1 / -1; }
}
</style>
