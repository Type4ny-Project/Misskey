<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader/></template>
	<div class="_spacer" style="--MI_SPACER-w: 760px;">
		<MkLoading v-if="room == null && !loadFailed"/>
		<div v-else-if="room == null" class="_panel" :class="$style.notFound">
			<i class="ti ti-alert-circle"></i>
			<strong>{{ i18n.ts.notFound }}</strong>
			<MkButton rounded @click="router.push('/calls')">{{ i18n.ts.goBack }}</MkButton>
		</div>
		<div v-else class="_gaps">
			<section class="_panel" :class="$style.roomHeader">
				<div :class="$style.titleRow">
					<div>
						<div :class="$style.roomTitle"><i class="ti ti-broadcast"></i> {{ room.title }}</div>
						<div :class="$style.roomMeta">
							<span v-if="room.state === 'open'" :class="$style.liveIndicator">● {{ i18n.ts._calls.live }}</span>
							<span>{{ i18n.ts._calls[room.attachment.type === 'personal' ? 'personalRoom' : 'chatRoom'] }}</span>
							<span>{{ i18n.ts._calls[room.visibility] }}</span>
						</div>
					</div>
					<span :class="$style.stateBadge">{{ i18n.ts._calls[room.state] }}</span>
				</div>
				<p v-if="room.description" :class="$style.description">{{ room.description }}</p>
				<small v-if="room.scheduledAt != null">{{ new Date(room.scheduledAt).toLocaleString() }}</small>
				<div v-if="isHost || (sessionIsCurrent && session.needsAudioResume.value)" :class="$style.roomActions">
					<MkButton v-if="isHost && room.state === 'scheduled'" primary @click="openRoom">{{ i18n.ts._calls.openRoom }}</MkButton>
					<MkButton v-if="isHost && room.state === 'scheduled'" danger @click="cancelRoom">{{ i18n.ts._calls.cancelRoom }}</MkButton>
					<MkButton v-if="isHost && room.state === 'open' && !sessionIsCurrent" danger @click="endRoom">{{ i18n.ts._calls.endRoom }}</MkButton>
					<MkButton v-if="sessionIsCurrent && session.needsAudioResume.value" @click="session.resumeAudio()">{{ i18n.ts._calls.resumeAudio }}</MkButton>
				</div>
			</section>

			<MkInfo v-if="!connected" warn>{{ i18n.ts._calls.websocketDisconnected }}</MkInfo>
			<MkInfo v-if="sessionIsCurrent && (session.mediaState.value === 'creating-session' || session.mediaState.value === 'negotiating')">{{ i18n.ts._calls.roomConnectedMediaConnecting }}</MkInfo>
			<MkInfo v-if="sessionIsCurrent && session.mediaState.value === 'reconnecting'" warn>{{ i18n.ts._calls.reconnecting }}</MkInfo>
			<MkInfo v-if="sessionIsCurrent && session.mediaFailure.value != null" warn>{{ failureText }}</MkInfo>

			<section v-if="room.state === 'open' && !sessionIsCurrent" class="_panel" :class="$style.lobby">
				<div :class="$style.lobbyBody">
					<strong><i class="ti ti-door-enter"></i> {{ i18n.ts._calls.joinRoom }}</strong>
					<p>{{ myParticipant?.role === 'listener' || myParticipant == null ? i18n.ts._calls.listenerDoesNotNeedMicrophone : i18n.ts._calls.microphone }}</p>
					<MkSelect v-if="myParticipant != null && myParticipant.role !== 'listener' && session.microphones.value.length > 0" :modelValue="session.selectedMicrophone.value" :items="microphoneItems" @update:modelValue="session.switchMicrophone">
						<template #label>{{ i18n.ts._calls.selectMicrophone }}</template>
					</MkSelect>
				</div>
				<MkButton primary large rounded :disabled="session.joining.value" @click="joinRoom"><i class="ti ti-broadcast"></i> {{ i18n.ts._calls.joinRoom }}</MkButton>
			</section>

			<MkSelect v-if="sessionIsCurrent && session.isSpeaker.value && session.microphones.value.length > 0" :modelValue="session.selectedMicrophone.value" :items="microphoneItems" @update:modelValue="session.switchMicrophone">
				<template #label>{{ i18n.ts._calls.microphone }}</template>
			</MkSelect>

			<section v-if="sessionIsCurrent" class="_panel" :class="$style.callControls">
				<button v-if="session.isSpeaker.value" type="button" class="_button" :class="[$style.controlButton, session.muted.value && $style.controlButtonActive]" @click="session.toggleMute()">
					<i :class="session.muted.value ? 'ti ti-microphone-off' : 'ti ti-microphone'"></i>
					<span>{{ session.muted.value ? i18n.ts._calls.unmute : i18n.ts._calls.mute }}</span>
				</button>
				<button v-else type="button" class="_button" :class="[$style.controlButton, session.myParticipant.value?.speakerRequestedAt != null && $style.controlButtonActive]" :disabled="session.myParticipant.value?.speakerRequestedAt != null" @click="session.requestSpeaker()">
					<i class="ti ti-hand-stop"></i>
					<span>{{ session.myParticipant.value?.speakerRequestedAt != null ? i18n.ts._calls.speakerRequested : i18n.ts._calls.requestSpeaker }}</span>
				</button>
				<button type="button" class="_button" :class="[$style.controlButton, $style.controlButtonDanger]" @click="leaveCurrentRoom">
					<i class="ti ti-door-exit"></i>
					<span>{{ isHost ? i18n.ts._calls.endRoom : i18n.ts._calls.leaveRoom }}</span>
				</button>
			</section>

			<section class="_panel" :class="$style.participantsPanel">
				<header :class="$style.sectionHeader"><strong><i class="ti ti-users"></i> {{ i18n.ts.users }}</strong><span>{{ participants.length }}</span></header>

				<div v-if="speakers.length > 0" :class="$style.participantGroup">
					<div :class="$style.groupLabel">{{ i18n.ts._calls.speaker }}</div>
					<div :class="$style.participantGrid">
						<article v-for="participant in speakers" :key="participant.id" :class="[$style.participantCard, speakingParticipantIds.has(participant.id) && $style.speaking]">
							<div :class="$style.participantIdentity">
								<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="$style.avatar" indicator link preview/>
								<div v-else :class="$style.avatarPlaceholder"><i class="ti ti-user"></i></div>
								<div :class="$style.participantDetails">
									<strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong>
									<div :class="$style.participantStatus">
										<span v-if="participant.role === 'host'" :class="$style.hostBadge">HOST</span>
										<span><i v-if="speakingParticipantIds.has(participant.id)" class="ti ti-volume"></i><i v-else :class="participant.isMuted ? 'ti ti-microphone-off' : 'ti ti-microphone'"></i> {{ participant.isMuted ? i18n.ts._calls.mute : speakingParticipantIds.has(participant.id) ? i18n.ts._calls.live : i18n.ts._calls.unmute }}</span>
									</div>
								</div>
							</div>
							<div v-if="isHost && participant.role !== 'host'" :class="$style.moderationActions">
								<MkButton small @click="setRole(participant.id, 'listener')">{{ i18n.ts._calls.demoteListener }}</MkButton>
								<MkButton small danger @click="removeParticipant(participant.id)">{{ i18n.ts._calls.removeParticipant }}</MkButton>
							</div>
						</article>
					</div>
				</div>

				<div v-if="listeners.length > 0" :class="$style.participantGroup">
					<div :class="$style.groupLabel">{{ i18n.ts._calls.listener }}</div>
					<div :class="$style.participantGrid">
						<article v-for="participant in listeners" :key="participant.id" :class="$style.participantCard">
							<div :class="$style.participantIdentity">
								<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="$style.avatar" indicator link preview/>
								<div v-else :class="$style.avatarPlaceholder"><i class="ti ti-user"></i></div>
								<div :class="$style.participantDetails">
									<strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong>
									<div :class="$style.participantStatus"><span><i class="ti ti-headphones"></i> {{ i18n.ts.online }}</span><span v-if="participant.speakerRequestedAt != null" :class="$style.requestBadge">{{ i18n.ts._calls.requestSpeaker }}</span></div>
								</div>
							</div>
							<div v-if="isHost" :class="$style.moderationActions">
								<MkButton small primary @click="setRole(participant.id, 'speaker')">{{ participant.speakerRequestedAt != null ? i18n.ts.approve : i18n.ts._calls.promoteSpeaker }}</MkButton>
								<MkButton small danger @click="removeParticipant(participant.id)">{{ i18n.ts._calls.removeParticipant }}</MkButton>
							</div>
						</article>
					</div>
				</div>
			</section>
		</div>
	</div>
</MkStickyContainer>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSelect from '@/components/MkSelect.vue';
import { createCallsRoomConnection } from '@/composables/use-calls-room.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { useCallsSession } from '@/utility/calls-session.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{ roomId: string }>();
const router = useRouter();
const session = useCallsSession();
const isSessionRoom = computed(() => session.currentRoomId.value === props.roomId);
const pageConnection = shallowRef<ReturnType<typeof createCallsRoomConnection> | null>(isSessionRoom.value ? null : createCallsRoomConnection(props.roomId));
const room = computed(() => isSessionRoom.value ? session.room.value : pageConnection.value?.room.value ?? null);
const participants = computed(() => isSessionRoom.value ? session.participants.value : pageConnection.value?.participants.value ?? []);
const connected = computed(() => isSessionRoom.value ? session.connected.value : pageConnection.value?.connected.value ?? false);
const speakingParticipantIds = computed(() => isSessionRoom.value ? session.speakingParticipantIds.value : pageConnection.value?.speakingParticipantIds.value ?? new Set<string>());
const loadFailed = shallowRef(false);
const usersById = shallowRef(new Map<string, Misskey.entities.UserLite>());
const myParticipant = computed(() => participants.value.find(participant => participant.userId === $i?.id) ?? null);
const isHost = computed(() => myParticipant.value?.role === 'host');
const speakers = computed(() => participants.value.filter(participant => participant.role !== 'listener'));
const listeners = computed(() => participants.value.filter(participant => participant.role === 'listener'));
const sessionIsCurrent = computed(() => isSessionRoom.value && session.isActive.value);
const microphoneItems = computed(() => session.microphones.value.map(device => ({ label: device.label || device.deviceId, value: device.deviceId })));
const failureText = computed(() => session.mediaFailure.value === 'unsupported' ? i18n.ts._calls.unsupportedBrowser : session.mediaFailure.value === 'permission-denied' ? i18n.ts._calls.permissionDenied : session.mediaFailure.value === 'device-not-found' ? i18n.ts._calls.deviceNotFound : session.mediaFailure.value === 'permission-pending' ? i18n.ts._calls.permissionPending : i18n.ts._calls.mediaFailed);

async function openRoom(): Promise<void> { if (room.value != null) { await misskeyApi('calls/rooms/open', { roomId: props.roomId, expectedRevision: room.value.revision }); await refreshRoom(); } }

async function cancelRoom(): Promise<void> { if (room.value != null) { await misskeyApi('calls/rooms/cancel', { roomId: props.roomId, expectedRevision: room.value.revision }); await refreshRoom(); } }

async function endRoom(): Promise<void> { if (room.value != null) { await misskeyApi('calls/rooms/end', { roomId: props.roomId, expectedRevision: room.value.revision }); await refreshRoom(); } }

async function joinRoom(): Promise<void> {
	try {
		await session.join(props.roomId, myParticipant.value != null);
		await refreshRoom();
	} catch (error) {
		await os.alert({ type: 'error', text: error instanceof Error ? error.message : i18n.ts.somethingHappened });
	}
}

async function leaveCurrentRoom(): Promise<void> {
	const { canceled } = await os.confirm({ type: 'warning', text: isHost.value ? i18n.ts._calls.endRoom : i18n.ts._calls.leaveRoom });
	if (canceled) return;
	await session.leave();
	router.push('/calls');
}

async function setRole(participantId: string, role: 'speaker' | 'listener'): Promise<void> {
	if (room.value == null) return;
	await misskeyApi('calls/rooms/set-role', { roomId: props.roomId, participantId, role, expectedRevision: room.value.revision });
	await refreshRoom();
}

async function removeParticipant(participantId: string): Promise<void> {
	if (room.value == null) return;
	await misskeyApi('calls/rooms/remove-participant', { roomId: props.roomId, participantId, expectedRevision: room.value.revision });
	await refreshRoom();
}

async function refreshRoom(): Promise<void> {
	if (isSessionRoom.value) await session.refresh();
	else await pageConnection.value?.refresh();
}

function participantUser(userId: string): Misskey.entities.UserLite | null { return usersById.value.get(userId) ?? null; }

async function loadParticipantUsers(userIds: string[]): Promise<void> {
	const missingIds = [...new Set(userIds)].filter(userId => !usersById.value.has(userId));
	if (missingIds.length === 0) return;
	const fetched = await Promise.all(missingIds.map(userId => misskeyApi('users/show', { userId }).catch(() => null)));
	const next = new Map(usersById.value);
	for (const user of fetched) if (user != null) next.set(user.id, user);
	usersById.value = next;
}

watch(() => participants.value.map(participant => participant.userId), userIds => { void loadParticipantUsers(userIds); }, { immediate: true });
watch(isSessionRoom, active => {
	if (active) {
		pageConnection.value?.dispose();
		pageConnection.value = null;
	} else if (pageConnection.value == null) {
		pageConnection.value = createCallsRoomConnection(props.roomId);
		void pageConnection.value.refresh().catch(() => { loadFailed.value = true; });
	}
}, { immediate: true });
onMounted(() => {
	void refreshRoom().then(() => {
		if (myParticipant.value != null && myParticipant.value.role !== 'listener') void session.prepareMicrophones();
	}).catch(() => { loadFailed.value = true; });
});
onUnmounted(() => pageConnection.value?.dispose());

definePage(() => ({ title: room.value?.title ?? i18n.ts._calls.title, icon: 'ti ti-phone' }));
</script>

<style lang="scss" module>
.roomHeader { padding: 24px; }
.titleRow { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.roomTitle { font-size: 1.3rem; font-weight: 800; }
.roomMeta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; font-size: 0.86rem; opacity: 0.75; }
.liveIndicator { color: var(--MI_THEME-error); font-weight: 800; letter-spacing: 0.08em; }
.stateBadge { padding: 5px 10px; border-radius: 999px; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); font-size: 0.82rem; font-weight: 700; }
.description { margin: 16px 0 0; opacity: 0.78; white-space: pre-wrap; }
.lobby { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 22px; }
.lobbyBody { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 12px; }
.lobby p { margin: 6px 0 0; opacity: 0.68; }
.roomActions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 18px; padding-top: 16px; border-top: solid 1px var(--MI_THEME-divider); }
.callControls { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 16px; }
.controlButton { display: inline-flex; min-width: 120px; align-items: center; justify-content: center; gap: 8px; padding: 12px 16px; border-radius: 999px; background: var(--MI_THEME-buttonBg); }
.controlButtonActive { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); }
.controlButtonDanger { color: var(--MI_THEME-error); }
.notFound { display: grid; justify-items: center; gap: 12px; padding: 40px; text-align: center; }
.notFound > i { font-size: 2rem; }
.participantsPanel { padding: 20px; }
.sectionHeader { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: solid 1px var(--MI_THEME-divider); }
.sectionHeader span { min-width: 30px; padding: 3px 9px; border-radius: 999px; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); text-align: center; }
.participantGroup { margin-top: 20px; }
.groupLabel { margin-bottom: 10px; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.06em; opacity: 0.65; text-transform: uppercase; }
.participantGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr)); gap: 10px; }
.participantCard { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding: 12px; border-radius: 18px; background: color(from var(--MI_THEME-bg) srgb r g b / 0.42); }
.participantIdentity { display: flex; min-width: 0; align-items: center; gap: 11px; }
.avatar, .avatarPlaceholder { width: 44px; height: 44px; flex: 0 0 44px; border-radius: 50%; }
.avatarPlaceholder { display: grid; place-items: center; background: var(--MI_THEME-panel); }
.participantDetails { min-width: 0; }
.participantDetails > strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.participantStatus { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 4px; font-size: 0.78rem; opacity: 0.72; }
.hostBadge { padding: 2px 7px; border-radius: 999px; background: var(--MI_THEME-accent); color: var(--MI_THEME-fgOnAccent); font-size: 0.68rem; font-weight: 800; }
.requestBadge { color: var(--MI_THEME-infoFg); }
.moderationActions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.speaking { box-shadow: inset 4px 0 var(--MI_THEME-accent); }

@media (max-width: 600px) {
	.lobby, .participantCard, .callControls { align-items: stretch; flex-direction: column; }
	.titleRow { flex-direction: column; }
	.moderationActions { justify-content: stretch; }
}
</style>
