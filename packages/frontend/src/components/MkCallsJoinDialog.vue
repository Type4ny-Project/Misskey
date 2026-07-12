<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialog" :width="440" @close="cancel" @closed="emit('closed')">
	<template #header><i class="ti ti-broadcast"></i> {{ i18n.ts._calls.title }}</template>

	<div :class="$style.content">
		<MkLoading v-if="loading"/>
		<MkResult v-else-if="snapshot == null" type="error"/>
		<template v-else>
			<div :class="$style.roomInfo">
				<strong>{{ snapshot.room.title }}</strong>
				<div :class="$style.roomMeta">
					<span v-if="snapshot.room.state === 'open'" :class="$style.live">● {{ i18n.ts._calls.live }}</span>
					<span><i class="ti ti-microphone"></i> {{ speakers.length }}</span>
					<span><i class="ti ti-headphones"></i> {{ listeners.length }}</span>
				</div>
			</div>

			<div v-if="hostUser != null" :class="$style.host">
				<MkAvatar :user="hostUser" indicator :class="$style.hostAvatar"/>
				<div><small>{{ i18n.ts._calls.host }}</small><strong><MkUserName :user="hostUser"/></strong></div>
			</div>

			<p v-if="snapshot.room.description" :class="$style.description">{{ snapshot.room.description }}</p>

			<div v-if="speakers.length > 0" :class="$style.userSection">
				<strong>{{ i18n.ts._calls.speaker }}</strong>
				<div :class="$style.userList">
					<div v-for="participant in speakers" :key="participant.id" :class="$style.userChip">
						<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" indicator :class="$style.userAvatar"/>
						<MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/>
						<span v-else>{{ participant.userId }}</span>
					</div>
				</div>
			</div>

			<div v-if="listeners.length > 0" :class="$style.userSection">
				<strong>{{ i18n.ts._calls.listener }}</strong>
				<div :class="$style.userList">
					<div v-for="participant in listeners" :key="participant.id" :class="$style.userChip">
						<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" indicator :class="$style.userAvatar"/>
						<MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/>
						<span v-else>{{ participant.userId }}</span>
					</div>
				</div>
			</div>

			<div :class="$style.footer">
				<span v-if="isCurrentRoom" :class="$style.current"><i class="ti ti-circle-check"></i> {{ i18n.ts._calls.alreadyJoined }}</span>
				<MkButton v-else-if="snapshot.room.state === 'open'" primary rounded :disabled="joining" @click="joinRoom">
					<i class="ti ti-door-enter"></i> {{ i18n.ts._calls.joinRoom }}
				</MkButton>
				<MkButton rounded @click="cancel">{{ i18n.ts.cancel }}</MkButton>
			</div>
		</template>
	</div>
</MkModalWindow>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
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
const usersById = shallowRef(new Map<string, Misskey.entities.UserLite>());
const loading = ref(true);
const joining = ref(false);
const router = useRouter();
const session = useCallsSession();
const speakers = computed(() => snapshot.value?.participants.filter(participant => participant.role !== 'listener') ?? []);
const listeners = computed(() => snapshot.value?.participants.filter(participant => participant.role === 'listener') ?? []);
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

async function joinRoom(): Promise<void> {
	if (joining.value || snapshot.value?.room.state !== 'open') return;
	if (session.currentRoomId.value != null && session.currentRoomId.value !== props.roomId) {
		const { canceled } = await os.confirm({ type: 'warning', title: i18n.ts._calls.title, text: i18n.ts._calls.switchRoomConfirm });
		if (canceled) return;
	}

	joining.value = true;
	try {
		const alreadyParticipant = snapshot.value.participants.some(participant => participant.userId === $i?.id);
		await session.join(props.roomId, alreadyParticipant);
		router.push('/calls/:roomId', { params: { roomId: props.roomId } });
		dialog.value?.close();
	} catch (error) {
		await os.alert({ type: 'error', text: error instanceof Error ? error.message : i18n.ts.somethingHappened });
	} finally {
		joining.value = false;
	}
}

function cancel(): void {
	dialog.value?.close();
}

onMounted(() => void load());
</script>

<style lang="scss" module>
.content { display: flex; flex-direction: column; gap: 20px; padding: 24px; }
.roomInfo { text-align: center; }
.roomInfo > strong { font-size: 1.2em; }
.roomMeta { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 8px; opacity: 0.75; }
.live { padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--MI_THEME-error) 14%, transparent); color: var(--MI_THEME-error); font-size: 0.75em; font-weight: 700; }
.host { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: var(--MI-radius); background: var(--MI_THEME-bg); }
.hostAvatar { width: 40px; height: 40px; flex-shrink: 0; }
.host small, .host strong { display: block; }
.host small { opacity: 0.65; }
.description { margin: 0; line-height: 1.5; white-space: pre-wrap; opacity: 0.8; }
.userSection { display: flex; flex-direction: column; gap: 10px; }
.userSection > strong { font-size: 0.8em; opacity: 0.65; }
.userList { display: flex; flex-wrap: wrap; gap: 8px; }
.userChip { display: flex; max-width: 100%; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 999px; background: var(--MI_THEME-bg); }
.userAvatar { width: 28px; height: 28px; flex-shrink: 0; }
.footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.current { margin-right: auto; color: var(--MI_THEME-accent); font-weight: 700; }
</style>
