<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialog" :width="440" @close="cancel" @closed="emit('closed')">
	<template #header><i class="ti ti-broadcast"></i> {{ i18n.ts._calls.title }}</template>

	<div :class="$style.content">
		<Transition
			mode="out-in"
			:enterActiveClass="$style.contentEnterActive"
			:enterFromClass="$style.contentEnterFrom"
			:leaveActiveClass="$style.contentLeaveActive"
			:leaveToClass="$style.contentLeaveTo"
		>
			<MkLoading v-if="loading" key="loading"/>
			<MkResult v-else-if="snapshot == null" key="error" type="error"/>
			<div v-else key="room" :class="$style.loadedContent">
				<div :class="$style.roomInfo">
					<strong>{{ snapshot.room.title }}</strong>
					<div :class="$style.roomMeta">
						<span v-if="snapshot.room.state === 'open'" :class="$style.live"><i aria-hidden="true"></i>{{ i18n.ts._calls.live }}</span>
						<span><i class="ti ti-microphone"></i> {{ speakers.length }}</span>
						<span><i class="ti ti-headphones"></i> {{ listeners.length }}</span>
					</div>
				</div>

				<div v-if="hostUser != null" :class="$style.host">
					<MkAvatar :user="hostUser" indicator :class="$style.hostAvatar"/>
					<div><small>{{ i18n.ts._calls.host }}</small><strong><MkUserName :user="hostUser"/></strong></div>
				</div>

				<p v-if="snapshot.room.description" :class="$style.description">{{ snapshot.room.description }}</p>

				<div v-if="sortedParticipants.length > 0" :class="$style.userSection">
					<strong>{{ i18n.ts.users }}</strong>
					<TransitionGroup
						appear
						tag="div"
						:class="$style.userList"
						:enterActiveClass="$style.chipEnterActive"
						:enterFromClass="$style.chipEnterFrom"
						:leaveActiveClass="$style.chipLeaveActive"
						:leaveToClass="$style.chipLeaveTo"
						:moveClass="$style.chipMove"
					>
						<div v-for="participant in sortedParticipants" :key="participant.id" :class="$style.userChip">
							<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" indicator :class="$style.userAvatar"/>
							<MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/>
							<span v-else>{{ participant.userId }}</span>
							<small v-if="participant.role === 'host'">{{ i18n.ts._calls.host }}</small>
						</div>
					</TransitionGroup>
				</div>

				<div :class="$style.footer">
					<span v-if="isCurrentRoom" :class="$style.current"><i class="ti ti-circle-check"></i> {{ i18n.ts._calls.alreadyJoined }}</span>
					<MkButton v-else-if="snapshot.room.state === 'open'" primary rounded @click="joinRoom">
						<i class="ti ti-door-enter"></i> {{ i18n.ts._calls.joinRoom }}
					</MkButton>
					<MkButton rounded @click="cancel">{{ i18n.ts.cancel }}</MkButton>
				</div>
			</div>
		</Transition>
	</div>
</MkModalWindow>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import { useCallsSession } from '@/utility/calls-session.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{
	roomId: string;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialog = shallowRef<InstanceType<typeof MkModalWindow>>();
const snapshot = shallowRef<Misskey.entities.CallsRoomsShowResponse | null>(null);
const usersById = shallowRef(new Map<string, Misskey.entities.UserDetailed>());
const loading = ref(true);
const router = useRouter();
const session = useCallsSession();
const speakers = computed(() => snapshot.value?.participants.filter(participant => participant.role !== 'listener') ?? []);
const listeners = computed(() => snapshot.value?.participants.filter(participant => participant.role === 'listener') ?? []);
const sortedParticipants = computed(() => [...(snapshot.value?.participants ?? [])].sort((a, b) => {
	const priority = (participant: typeof a) => {
		if (participant.role === 'host') return 0;
		const user = usersById.value.get(participant.userId);
		return user?.isFollowing && user?.isFollowed ? 1 : 2;
	};
	return priority(a) - priority(b);
}));
const hostUser = computed(() => {
	const host = snapshot.value?.participants.find(participant => participant.role === 'host');
	return host == null ? null : participantUser(host.userId);
});
const isCurrentRoom = computed(() => session.currentRoomId.value === props.roomId && session.isActive.value);

function participantUser(userId: string): Misskey.entities.UserLite | null {
	return usersById.value.get(userId) ?? null;
}

async function load(): Promise<void> {
	loading.value = true;
	try {
		const nextSnapshot = await misskeyApi('calls/rooms/show', { roomId: props.roomId });
		snapshot.value = nextSnapshot;
		const userIds = [...new Set(nextSnapshot.participants.map(participant => participant.userId))];
		const users = await Promise.all(userIds.map(userId => misskeyApi('users/show', { userId }).catch(() => null)));
		usersById.value = new Map(users.filter(user => user != null).map(user => [user.id, user]));
	} catch {
		snapshot.value = null;
	} finally {
		loading.value = false;
	}
}

function joinRoom(): void {
	if (snapshot.value?.room.state !== 'open') return;
	router.push('/calls/:roomId', { params: { roomId: props.roomId }, query: { join: 'true' } });
	dialog.value?.close();
}

function cancel(): void {
	dialog.value?.close();
}

onMounted(() => void load());
</script>

<style lang="scss" module>
.content { min-height: 160px; padding: 24px; }
.loadedContent { display: flex; flex-direction: column; gap: 20px; }
.roomInfo { text-align: center; }
.roomInfo > strong { font-size: 1.2em; }
.roomMeta { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 8px; opacity: 0.75; }
.live { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--MI_THEME-error) 14%, transparent); color: var(--MI_THEME-error); font-size: 0.75em; font-weight: 700; }
.live > i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: liveDot 2s ease-out infinite; }
.host { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: var(--MI-radius); background: var(--MI_THEME-bg); transition: background-color 0.18s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
.hostAvatar { width: 40px; height: 40px; flex-shrink: 0; }
.host small, .host strong { display: block; }
.host small { opacity: 0.65; }
.description { margin: 0; line-height: 1.5; white-space: pre-wrap; opacity: 0.8; }
.userSection { display: flex; flex-direction: column; gap: 10px; }
.userSection > strong { font-size: 0.8em; opacity: 0.65; }
.userList { position: relative; display: flex; flex-wrap: wrap; gap: 8px; }
.userChip { display: flex; max-width: 100%; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 999px; background: var(--MI_THEME-bg); transition: background-color 0.18s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
.userAvatar { width: 28px; height: 28px; flex-shrink: 0; }
.footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.current { margin-right: auto; color: var(--MI_THEME-accent); font-weight: 700; }
.contentEnterActive { transition: opacity 0.22s ease-out, transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), filter 0.24s ease-out; }
.contentLeaveActive { transition: opacity 0.13s ease-in, transform 0.18s ease-in; }
.contentEnterFrom { opacity: 0; filter: blur(5px); transform: translateY(10px) scale(0.985); }
.contentLeaveTo { opacity: 0; transform: translateY(-5px) scale(0.99); }
.chipEnterActive, .chipLeaveActive, .chipMove { transition: opacity 0.2s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
.chipEnterFrom, .chipLeaveTo { opacity: 0; transform: translateY(7px) scale(0.9); }
.chipLeaveActive { position: absolute; }

@media (hover: hover) {
	.host:hover, .userChip:hover { background: var(--MI_THEME-buttonHoverBg); transform: translateY(-1px); }
}

@keyframes liveDot {
	0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--MI_THEME-error) 44%, transparent); }
	65%, 100% { box-shadow: 0 0 0 7px transparent; }
}

@media (prefers-reduced-motion: reduce) {
	.live > i { animation: none; }
	.host, .userChip, .contentEnterActive, .contentLeaveActive, .chipEnterActive, .chipLeaveActive, .chipMove { transition-duration: 0.01ms; }
	.host:hover, .userChip:hover { transform: none; }
}
</style>
