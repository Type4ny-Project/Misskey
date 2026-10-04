<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button type="button" class="_button" :class="$style.root" @click="openCallsRoom(room.id)">
	<div :class="$style.meta">
		<span v-if="room.state === 'open'" :class="$style.live"><i class="ti ti-wave-sine" aria-hidden="true"></i> {{ i18n.ts._calls.live }}</span>
		<span v-else>{{ i18n.ts._calls[room.state] }}</span>
		<span>{{ room.mode === 'stage' ? i18n.ts._calls.stageCall : i18n.ts._calls.openCall }}</span>
		<span>{{ i18n.ts._calls[room.visibility] }}</span>
	</div>
	<strong :class="$style.title">{{ room.title }}</strong>
	<div v-if="hostUser != null" :class="$style.host">
		<MkAvatar :user="hostUser" :class="$style.hostAvatar"/>
		<MkUserName :user="hostUser"/>
		<small>{{ i18n.ts._calls.host }}</small>
	</div>
	<div v-if="speakingParticipants.length > 0" :class="$style.speakingNow"><i class="ti ti-volume" aria-hidden="true"></i> {{ i18n.ts._calls.speakingNow }}: <MkUserName v-if="speakingParticipants[0].user != null" :user="speakingParticipants[0].user"/><span v-else>{{ speakingParticipants[0].participant.userId }}</span></div>
	<div :class="$style.footer">
		<div :class="$style.participants">
			<div :class="$style.avatarStack">
				<MkAvatar v-for="item in visibleParticipants.slice(0, 4).filter(item => item.user != null)" :key="item.participant.id" :user="item.user!" :class="[$style.previewAvatar, connection?.speakingParticipantIds.value.has(item.participant.id) && $style.speakingAvatar]"/>
			</div>
			<span>{{ i18n.tsx._calls.peopleInRoom({ count: participants.length }) }}</span>
		</div>
		<span :class="$style.openRoom">{{ i18n.ts._calls.viewRoom }} <i class="ti ti-arrow-right" aria-hidden="true"></i></span>
	</div>
</button>
</template>

<script setup lang="ts">
import { computed, onUnmounted, shallowRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { openCallsRoom } from '@/utility/calls-window.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { createCallsRoomConnection } from '@/composables/use-calls-room.js';

const props = defineProps<{
	room: Misskey.entities.CallsRoom;
}>();

const connection = shallowRef<ReturnType<typeof createCallsRoomConnection> | null>(null);
const participants = computed(() => connection.value?.participants.value ?? []);
const hostUser = shallowRef<Misskey.entities.UserLite | null>(null);
const participantUsers = shallowRef(new Map<string, Misskey.entities.UserDetailed>());
const sortedParticipants = computed(() => participants.value.map(participant => ({ participant, user: participantUsers.value.get(participant.userId) ?? null })).sort((a, b) => {
	const priority = (item: typeof a) => item.participant.role === 'host' ? 0 : item.user?.isFollowing && item.user?.isFollowed ? 1 : 2;
	return priority(a) - priority(b);
}));
const visibleParticipants = computed(() => sortedParticipants.value.slice(0, 10));
const speakingParticipants = computed(() => sortedParticipants.value.filter(item => connection.value?.speakingParticipantIds.value.has(item.participant.id)));

async function connectRoom(roomId: string): Promise<void> {
	connection.value?.dispose();
	connection.value = createCallsRoomConnection(roomId);
	await connection.value.refresh().catch(() => undefined);
}

watch(() => props.room.id, roomId => void connectRoom(roomId), { immediate: true });
watch(() => participants.value.find(participant => participant.role === 'host')?.userId, async userId => {
	hostUser.value = userId == null ? null : await misskeyApi('users/show', { userId }).catch(() => null);
}, { immediate: true });
watch(() => participants.value.map(participant => participant.userId), async userIds => {
	const users = await Promise.all(userIds.map(userId => misskeyApi('users/show', { userId }).catch(() => null)));
	participantUsers.value = new Map(users.filter(user => user != null).map(user => [user.id, user]));
}, { immediate: true });
onUnmounted(() => connection.value?.dispose());
</script>

<style lang="scss" module>
.root { width: 100%; text-align: left; display: flex; flex-direction: column; gap: 14px; padding: 20px; border: 1px solid var(--MI_THEME-divider); border-radius: var(--MI-radius); color: var(--MI_THEME-fg); transition: background-color 0.15s ease; }
.root:hover { background: var(--MI_THEME-buttonHoverBg); }
.root:focus-visible { outline: 2px solid var(--MI_THEME-accent); outline-offset: 2px; }
.meta { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; font-size: 0.8rem; color: var(--MI_THEME-fgTransparentWeak); }
.live { display: inline-flex; align-items: center; gap: 4px; color: var(--MI_THEME-accent); font-weight: 700; }
.live > i { font-size: 20px; }
.title { font-size: 1.15rem; line-height: 1.4; overflow-wrap: anywhere; }
.host { display: flex; align-items: center; gap: 8px; min-width: 0; }
.host > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.host > small { flex-shrink: 0; color: var(--MI_THEME-fgTransparentWeak); }
.hostAvatar { width: 32px; height: 32px; flex-shrink: 0; }
.speakingNow { display: flex; align-items: center; gap: 4px; color: var(--MI_THEME-accent); font-size: 0.8rem; }
.footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-top: 14px; border-top: 1px solid var(--MI_THEME-divider); }
.participants { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 0.8rem; }
.avatarStack { display: flex; padding-left: 8px; }
.previewAvatar { width: 28px; height: 28px; margin-left: -8px; border: 2px solid var(--MI_THEME-panel); }
.speakingAvatar { box-shadow: 0 0 0 2px var(--MI_THEME-accent); }
.openRoom { display: inline-flex; flex-shrink: 0; align-items: center; gap: 6px; color: var(--MI_THEME-accent); font-size: 0.85rem; font-weight: 700; }
@media (max-width: 400px) {
	.root { padding: 16px; }
	.footer { align-items: flex-start; }
	.participants { flex-direction: column; align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
	.root { transition: none; }
}
</style>
