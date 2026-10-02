<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<article class="_panel" :class="$style.root">
	<button type="button" class="_button" :class="[$style.summary, expanded && $style.summaryExpanded]" :aria-expanded="expanded" :aria-controls="`calls-room-${room.id}`" @click="expanded = !expanded">
		<div v-if="room.state === 'open'" :class="$style.live"><i aria-hidden="true"></i>{{ i18n.ts._calls.live }}</div>
		<div v-else :class="$style.state">{{ i18n.ts._calls[room.state] }}</div>
		<div :class="$style.body">
			<strong>{{ room.title }}</strong>
			<div v-if="hostUser != null" :class="$style.host">
				<MkAvatar :user="hostUser" indicator :class="$style.avatar"/>
				<MkUserName :user="hostUser"/>
			</div>
			<div v-if="speakingParticipants.length > 0" :class="$style.speakingNow"><i class="ti ti-volume" aria-hidden="true"></i> {{ i18n.ts._calls.speakingNow }}: <MkUserName v-if="speakingParticipants[0].user != null" :user="speakingParticipants[0].user"/><span v-else>{{ speakingParticipants[0].participant.userId }}</span></div>
		</div>
		<div :class="$style.preview">
			<TransitionGroup
				tag="div"
				:class="$style.avatarStack"
				:enterActiveClass="$style.avatarEnterActive"
				:enterFromClass="$style.avatarEnterFrom"
				:leaveActiveClass="$style.avatarLeaveActive"
				:leaveToClass="$style.avatarLeaveTo"
			>
				<MkAvatar
					v-for="item in visibleParticipants.slice(0, 4).filter(item => item.user != null)"
					:key="item.participant.id"
					:user="item.user!"
					:class="[$style.previewAvatar, connection?.speakingParticipantIds.value.has(item.participant.id) && $style.previewAvatarSpeaking]"
				/>
			</TransitionGroup>
			<span><i class="ti ti-users"></i> {{ participants.length }}</span>
		</div>
		<i class="ti ti-chevron-down" :class="[$style.chevron, expanded && $style.chevronExpanded]"></i>
	</button>
	<Transition
		:enterActiveClass="$style.detailsEnterActive"
		:enterFromClass="$style.detailsEnterFrom"
		:leaveActiveClass="$style.detailsLeaveActive"
		:leaveToClass="$style.detailsLeaveTo"
	>
		<div v-if="expanded" :id="`calls-room-${room.id}`" :class="$style.details">
			<TransitionGroup
				tag="div"
				:class="$style.participantList"
				:enterActiveClass="$style.participantEnterActive"
				:enterFromClass="$style.participantEnterFrom"
				:leaveActiveClass="$style.participantLeaveActive"
				:leaveToClass="$style.participantLeaveTo"
				:moveClass="$style.participantMove"
			>
				<div v-for="item in visibleParticipants" :key="item.participant.id" :class="$style.participant">
					<MkAvatar v-if="item.user != null" :user="item.user" indicator :class="$style.participantAvatar"/>
					<div v-else :class="$style.avatarFallback"><i class="ti ti-user"></i></div>
					<span><MkUserName v-if="item.user != null" :user="item.user"/><template v-else>{{ item.participant.userId }}</template></span>
					<small v-if="item.participant.role === 'host'">{{ i18n.ts._calls.host }}</small>
				</div>
				<button v-if="sortedParticipants.length > 10" key="more" type="button" class="_button" :class="$style.more" @click="openParticipantsDialog">{{ i18n.tsx._calls.moreParticipants({ count: sortedParticipants.length - 10 }) }}</button>
			</TransitionGroup>
			<div v-if="room.state === 'open'" :class="$style.joinArea"><small>{{ i18n.ts._calls.joinMutedHint }}</small><MkButton primary rounded @click="joinRoom"><i class="ti ti-door-enter"></i> {{ i18n.ts._calls.joinRoom }}</MkButton></div>
		</div>
	</Transition>
</article>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkCallsJoinDialog from '@/components/MkCallsJoinDialog.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { createCallsRoomConnection } from '@/composables/use-calls-room.js';

const props = defineProps<{
	room: Misskey.entities.CallsRoom;
}>();

const connection = shallowRef<ReturnType<typeof createCallsRoomConnection> | null>(null);
const participants = computed(() => connection.value?.participants.value ?? []);
const hostUser = shallowRef<Misskey.entities.UserLite | null>(null);
const participantUsers = shallowRef(new Map<string, Misskey.entities.UserDetailed>());
const expanded = ref(false);
const router = useRouter();
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

function joinRoom(): void {
	router.push('/calls/:roomId', { params: { roomId: props.room.id }, query: { join: 'true' } });
}

function openParticipantsDialog(): void {
	os.popup(MkCallsJoinDialog, { roomId: props.room.id }, { closed: () => undefined });
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
.root { overflow: hidden; transition: box-shadow 0.24s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1); }
.summary { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; width: 100%; align-items: center; gap: 14px; padding: 14px; text-align: left; transition: background-color 0.2s ease; }
.summaryExpanded { background: color-mix(in srgb, var(--MI_THEME-accent) 4%, transparent); }
.live { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 999px; background: color-mix(in srgb, var(--MI_THEME-error) 14%, transparent); color: var(--MI_THEME-error); font-size: 0.72em; font-weight: 800; letter-spacing: 0.05em; }
.live > i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 0 color-mix(in srgb, var(--MI_THEME-error) 44%, transparent); animation: liveDot 2s ease-out infinite; }
.state { padding: 4px 8px; border-radius: 999px; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); font-size: 0.72em; font-weight: 700; }
.body { min-width: 0; }
.body > strong { display: block; overflow: hidden; font-size: 1.05em; text-overflow: ellipsis; white-space: nowrap; }
.host { display: flex; min-width: 0; align-items: center; gap: 6px; margin-top: 6px; opacity: 0.75; }
.speakingNow { display: flex; align-items: center; gap: 4px; margin-top: 5px; color: var(--MI_THEME-accent); font-size: 0.82em; }
.speakingNow > i { animation: speakingIcon 0.7s ease-in-out infinite alternate; }
.avatar { width: 24px; height: 24px; flex-shrink: 0; }
.preview { display: flex; align-items: center; gap: 10px; opacity: 0.82; }
.avatarStack { display: flex; padding-left: 8px; }
.previewAvatar { width: 28px; height: 28px; margin-left: -8px; border: 2px solid var(--MI_THEME-panel); transition: box-shadow 0.24s ease, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1); }
.previewAvatarSpeaking { z-index: 1; box-shadow: 0 0 0 2px var(--MI_THEME-accent), 0 0 12px color-mix(in srgb, var(--MI_THEME-accent) 42%, transparent); transform: translateY(-2px); }
.chevron { transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1); }
.chevronExpanded { transform: rotate(180deg); }
.details { display: flex; max-height: 560px; align-items: flex-end; gap: 16px; overflow: hidden; padding: 0 14px 14px; border-top: 1px solid var(--MI_THEME-divider); transform-origin: top center; }
.participantList { position: relative; display: grid; flex: 1; gap: 4px; padding-top: 10px; }
.participant { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 5px 8px; border-radius: 8px; background: var(--MI_THEME-bg); transition: background-color 0.18s ease, transform 0.2s ease; }
.participant > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.participant small { margin-left: auto; color: var(--MI_THEME-accent); font-weight: 700; }
.participantAvatar, .avatarFallback { width: 28px; height: 28px; flex: none; }
.avatarFallback { display: grid; place-items: center; border-radius: 50%; background: var(--MI_THEME-accentedBg); }
.more { justify-self: start; padding: 6px 8px; color: var(--MI_THEME-accent); font-size: 0.85em; }
.joinArea { display: grid; justify-items: end; gap: 6px; }
.joinArea small { opacity: 0.64; }
.detailsEnterActive { transition: max-height 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s ease-out, padding 0.32s ease-out, transform 0.38s cubic-bezier(0.22, 1, 0.36, 1); }
.detailsLeaveActive { transition: max-height 0.26s ease-in, opacity 0.16s ease-in, padding 0.24s ease-in, transform 0.26s ease-in; }
.detailsEnterFrom, .detailsLeaveTo { max-height: 0; padding-top: 0; padding-bottom: 0; opacity: 0; transform: translateY(-8px) scaleY(0.96); }
.avatarEnterActive, .avatarLeaveActive { transition: opacity 0.18s ease, transform 0.26s cubic-bezier(0.22, 1, 0.36, 1); }
.avatarEnterFrom, .avatarLeaveTo { opacity: 0; transform: scale(0.72); }
.participantEnterActive, .participantLeaveActive, .participantMove { transition: opacity 0.2s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
.participantEnterFrom { opacity: 0; transform: translateX(-10px); }
.participantLeaveTo { opacity: 0; transform: translateX(10px); }
.participantLeaveActive { position: absolute; width: 100%; }

@media (hover: hover) {
	.root:hover { box-shadow: 0 8px 24px color(from var(--MI_THEME-bg) srgb r g b / 0.16); transform: translateY(-1px); }
	.participant:hover { background: var(--MI_THEME-buttonHoverBg); }
}

@keyframes liveDot {
	0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--MI_THEME-error) 44%, transparent); }
	65%, 100% { box-shadow: 0 0 0 7px transparent; }
}

@keyframes speakingIcon {
	from { transform: scale(0.92) rotate(-5deg); }
	to { transform: scale(1.08) rotate(5deg); }
}

@media (prefers-reduced-motion: reduce) {
	.root, .summary, .live > i, .speakingNow > i, .previewAvatar, .chevron, .detailsEnterActive, .detailsLeaveActive, .avatarEnterActive, .avatarLeaveActive, .participantEnterActive, .participantLeaveActive, .participantMove { animation: none; transition-duration: 0.01ms; }
	.root:hover, .previewAvatarSpeaking, .chevronExpanded { transform: none; }
}

@media (max-width: 600px) {
	.summary { grid-template-columns: auto minmax(0, 1fr) auto; }
	.preview .avatarStack { display: none; }
	.details { align-items: stretch; flex-direction: column; }
	.joinArea { justify-items: stretch; }
}
</style>
