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
							<span v-if="room.state === 'open'" :class="$style.liveIndicator"><i aria-hidden="true"></i>{{ i18n.ts._calls.live }}</span>
							<span>{{ i18n.ts._calls[room.mode === 'open' ? 'openCall' : 'stageCall'] }}</span>
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
					<MkButton v-if="isHost && room.state === 'open' && !sessionIsCurrent && session.replacedRoomId.value !== props.roomId" danger @click="endRoom">{{ i18n.ts._calls.endRoom }}</MkButton>
					<MkButton v-if="sessionIsCurrent && session.needsAudioResume.value" @click="session.resumeAudio()">{{ i18n.ts._calls.resumeAudio }}</MkButton>
				</div>
			</section>

			<MkInfo v-if="session.replacedRoomId.value === props.roomId">{{ i18n.ts._calls.connectedOnAnotherDevice }}</MkInfo>
			<MkInfo v-if="isSessionRoom && (session.joining.value || session.mediaState.value === 'creating-session' || session.mediaState.value === 'negotiating')">{{ i18n.ts._calls.roomConnectedMediaConnecting }}</MkInfo>
			<MkInfo v-else-if="!connected" warn>{{ i18n.ts._calls.websocketDisconnected }}</MkInfo>
			<MkInfo v-if="sessionIsCurrent && session.mediaState.value === 'reconnecting'" warn>{{ i18n.ts._calls.reconnecting }}</MkInfo>
			<MkInfo v-if="sessionIsCurrent && session.mediaFailure.value != null" warn>{{ failureText }}</MkInfo>
			<MkInfo v-if="sessionIsCurrent && session.speakerRequestResult.value === 'rejected'" warn>{{ i18n.ts._calls.speakerRequestRejected }}</MkInfo>

			<Transition
				:enterActiveClass="$style.surfaceEnterActive"
				:enterFromClass="$style.surfaceEnterFrom"
				:leaveActiveClass="$style.surfaceLeaveActive"
				:leaveToClass="$style.surfaceLeaveTo"
			>
				<section v-if="room.state === 'open' && !sessionIsCurrent" class="_panel" :class="$style.lobby">
					<div :class="$style.lobbyBody">
						<strong><i class="ti ti-door-enter"></i> {{ i18n.ts._calls.joinRoom }}</strong>
						<p>{{ room.mode === 'open' ? i18n.ts._calls.joinMutedHint : myParticipant?.role === 'listener' || myParticipant == null ? i18n.ts._calls.listenerDoesNotNeedMicrophone : i18n.ts._calls.microphone }}</p>
						<MkSelect v-if="myParticipant != null && myParticipant.role !== 'listener' && session.microphones.value.length > 0" :modelValue="session.selectedMicrophone.value" :items="microphoneItems" @update:modelValue="session.switchMicrophone">
							<template #label>{{ i18n.ts._calls.selectMicrophone }}</template>
						</MkSelect>
					</div>
					<MkButton primary large rounded :wait="session.joining.value" @click="joinRoom()"><i class="ti ti-broadcast"></i> {{ session.joining.value ? i18n.ts._calls.connecting : i18n.ts._calls.joinRoom }}</MkButton>
				</section>
			</Transition>

			<Transition
				:enterActiveClass="$style.surfaceEnterActive"
				:enterFromClass="$style.surfaceEnterFrom"
				:leaveActiveClass="$style.surfaceLeaveActive"
				:leaveToClass="$style.surfaceLeaveTo"
			>
				<MkSelect v-if="sessionIsCurrent && session.isSpeaker.value && session.microphones.value.length > 0" :modelValue="session.selectedMicrophone.value" :items="microphoneItems" @update:modelValue="session.switchMicrophone">
					<template #label>{{ i18n.ts._calls.microphone }}</template>
				</MkSelect>
			</Transition>

			<Transition
				:enterActiveClass="$style.controlsEnterActive"
				:enterFromClass="$style.controlsEnterFrom"
				:leaveActiveClass="$style.surfaceLeaveActive"
				:leaveToClass="$style.surfaceLeaveTo"
			>
				<section v-if="sessionIsCurrent" class="_panel" :class="$style.callControls">
					<button v-if="session.isSpeaker.value" type="button" class="_button" :class="[$style.controlButton, session.muted.value && $style.controlButtonActive]" :disabled="session.joining.value" @click="session.toggleMute()">
						<Transition
							mode="out-in"
							:enterActiveClass="$style.controlIconEnterActive"
							:enterFromClass="$style.controlIconEnterFrom"
							:leaveActiveClass="$style.controlIconLeaveActive"
							:leaveToClass="$style.controlIconLeaveTo"
						>
							<i :key="session.muted.value ? 'muted' : 'live'" :class="session.muted.value ? 'ti ti-microphone-off' : 'ti ti-microphone'"></i>
						</Transition>
						<span>{{ session.muted.value ? i18n.ts._calls.unmute : i18n.ts._calls.mute }}</span>
					</button>
					<button v-else-if="room.mode === 'stage'" type="button" class="_button" :class="[$style.controlButton, session.myParticipant.value?.speakerRequestedAt != null && $style.controlButtonActive]" :disabled="session.joining.value" @click="session.myParticipant.value?.speakerRequestedAt != null ? session.cancelSpeakerRequest() : session.requestSpeaker()">
						<i class="ti ti-hand-stop"></i>
						<span>{{ session.myParticipant.value?.speakerRequestedAt != null ? i18n.ts._calls.cancelSpeakerRequest : i18n.ts._calls.requestSpeaker }}</span>
					</button>
					<button type="button" class="_button" :class="[$style.controlButton, $style.controlButtonDanger]" :disabled="session.joining.value" @click="leaveCurrentRoom">
						<i class="ti ti-door-exit"></i>
						<span>{{ isHost ? i18n.ts._calls.endRoom : i18n.ts._calls.leaveRoom }}</span>
					</button>
				</section>
			</Transition>

			<Transition
				:enterActiveClass="$style.surfaceEnterActive"
				:enterFromClass="$style.surfaceEnterFrom"
				:leaveActiveClass="$style.surfaceLeaveActive"
				:leaveToClass="$style.surfaceLeaveTo"
			>
				<section v-if="room.mode === 'stage' && speakers.length > 0" class="_panel" :class="$style.stageSpotlight">
					<strong :class="$style.groupLabel">{{ speakingParticipantIds.size > 0 ? i18n.ts._calls.nowSpeaking : i18n.ts._calls.speaker }}</strong>
					<TransitionGroup
						tag="div"
						:class="$style.stagePeople"
						:enterActiveClass="$style.personEnterActive"
						:enterFromClass="$style.personEnterFrom"
						:leaveActiveClass="$style.personLeaveActive"
						:leaveToClass="$style.personLeaveTo"
						:moveClass="$style.personMove"
					>
						<div v-for="participant in stageSpotlightParticipants" :key="participant.id" :class="$style.stagePerson">
							<div :class="[$style.avatarWithWave, speakingParticipantIds.has(participant.id) && $style.avatarWithWaveSpeaking]">
								<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="$style.stageAvatar" indicator/>
								<div v-else :class="[$style.avatarPlaceholder, $style.stageAvatar]"><i class="ti ti-user"></i></div>
							</div>
							<strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong>
							<small :class="$style.visuallyHidden">{{ speakingParticipantIds.has(participant.id) ? i18n.ts._calls.speakingNow : participant.isMuted ? i18n.ts._calls.mutedStatus : i18n.ts._calls.microphoneOn }}</small>
						</div>
					</TransitionGroup>
				</section>
			</Transition>

			<section class="_panel" :class="$style.participantsPanel">
				<header :class="$style.sectionHeader">
					<strong><i class="ti ti-users"></i> {{ i18n.ts.users }}</strong>
					<Transition
						mode="out-in"
						:enterActiveClass="$style.countEnterActive"
						:enterFromClass="$style.countEnterFrom"
						:leaveActiveClass="$style.countLeaveActive"
						:leaveToClass="$style.countLeaveTo"
					>
						<span :key="participants.length">{{ participants.length }}</span>
					</Transition>
				</header>

				<div v-if="speakers.length > 0" :class="$style.participantGroup">
					<div :class="$style.groupLabel">{{ room.mode === 'open' ? i18n.ts.users : i18n.ts._calls.speaker }}</div>
					<TransitionGroup
						tag="div"
						:class="[$style.participantGrid, room.mode === 'open' && $style.openParticipantGrid]"
						:enterActiveClass="$style.personEnterActive"
						:enterFromClass="$style.personEnterFrom"
						:leaveActiveClass="$style.personLeaveActive"
						:leaveToClass="$style.personLeaveTo"
						:moveClass="$style.personMove"
					>
						<article v-for="participant in speakers" :key="participant.id" :class="[$style.participantCard, room.mode === 'open' && $style.openParticipantCard]">
							<div :class="[$style.participantIdentity, room.mode === 'open' && $style.openParticipantIdentity]">
								<div :class="[$style.avatarWithWave, speakingParticipantIds.has(participant.id) && $style.avatarWithWaveSpeaking]">
									<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="[$style.avatar, room.mode === 'open' && $style.openAvatar]" indicator link preview/>
									<div v-else :class="[$style.avatarPlaceholder, $style.avatar, room.mode === 'open' && $style.openAvatar]"><i class="ti ti-user"></i></div>
								</div>
								<div :class="$style.participantDetails">
									<strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong>
									<div :class="$style.participantStatus">
										<span v-if="participant.role === 'host'" :class="$style.hostBadge">{{ i18n.ts._calls.host }}</span>
										<span :class="$style.visuallyHidden">{{ participant.isMuted ? i18n.ts._calls.mutedStatus : speakingParticipantIds.has(participant.id) ? i18n.ts._calls.speakingNow : i18n.ts._calls.microphoneOn }}</span>
									</div>
								</div>
							</div>
							<div v-if="room.mode === 'stage' && isHost && participant.role !== 'host'" :class="$style.moderationActions">
								<MkButton small @click="setRole(participant.id, 'listener')">{{ i18n.ts._calls.demoteListener }}</MkButton>
								<MkButton small danger @click="removeParticipant(participant.id)">{{ i18n.ts._calls.removeParticipant }}</MkButton>
							</div>
						</article>
					</TransitionGroup>
				</div>

				<div v-if="room.mode === 'stage' && listeners.length > 0" :class="$style.participantGroup">
					<div :class="$style.groupLabel">{{ i18n.ts._calls.listener }}</div>
					<TransitionGroup
						tag="div"
						:class="$style.participantGrid"
						:enterActiveClass="$style.personEnterActive"
						:enterFromClass="$style.personEnterFrom"
						:leaveActiveClass="$style.personLeaveActive"
						:leaveToClass="$style.personLeaveTo"
						:moveClass="$style.personMove"
					>
						<article v-for="participant in listeners" :key="participant.id" :class="$style.participantCard">
							<div :class="$style.participantIdentity">
								<div :class="$style.avatarWithWave">
									<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="$style.avatar" indicator link preview/>
									<div v-else :class="[$style.avatarPlaceholder, $style.avatar]"><i class="ti ti-user"></i></div>
								</div>
								<div :class="$style.participantDetails">
									<strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong>
									<div :class="$style.participantStatus"><span><i class="ti ti-headphones"></i> {{ i18n.ts.online }}</span><span v-if="participant.speakerRequestedAt != null" :class="$style.requestBadge">{{ i18n.ts._calls.requestSpeaker }}</span></div>
								</div>
							</div>
							<div v-if="isHost" :class="$style.moderationActions">
								<MkButton small primary @click="setRole(participant.id, 'speaker')">{{ participant.speakerRequestedAt != null ? i18n.ts.approve : i18n.ts._calls.promoteSpeaker }}</MkButton>
								<MkButton v-if="participant.speakerRequestedAt != null" small @click="setRole(participant.id, 'listener')">{{ i18n.ts.reject }}</MkButton>
								<MkButton small danger @click="removeParticipant(participant.id)">{{ i18n.ts._calls.removeParticipant }}</MkButton>
							</div>
						</article>
					</TransitionGroup>
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

const props = defineProps<{
	roomId: string;
	join?: string;
}>();
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
const stageSpotlightParticipants = computed(() => {
	const speaking = speakers.value.filter(participant => speakingParticipantIds.value.has(participant.id));
	return speaking.length > 0 ? speaking : speakers.value;
});
const sessionIsCurrent = computed(() => isSessionRoom.value && session.isActive.value);
const microphoneItems = computed(() => session.microphones.value.map(device => ({ label: device.label || device.deviceId, value: device.deviceId })));
const failureText = computed(() => session.mediaFailure.value === 'unsupported' ? i18n.ts._calls.unsupportedBrowser : session.mediaFailure.value === 'permission-denied' ? i18n.ts._calls.permissionDenied : session.mediaFailure.value === 'device-not-found' ? i18n.ts._calls.deviceNotFound : session.mediaFailure.value === 'permission-pending' ? i18n.ts._calls.permissionPending : i18n.ts._calls.mediaFailed);

async function openRoom(): Promise<void> { if (room.value != null) { await misskeyApi('calls/rooms/open', { roomId: props.roomId, expectedRevision: room.value.revision }); await refreshRoom(); } }

async function cancelRoom(): Promise<void> { if (room.value != null) { await misskeyApi('calls/rooms/cancel', { roomId: props.roomId, expectedRevision: room.value.revision }); await refreshRoom(); } }

async function endRoom(): Promise<void> { if (room.value != null) { await misskeyApi('calls/rooms/end', { roomId: props.roomId, expectedRevision: room.value.revision }); await refreshRoom(); } }

async function joinRoom(startMuted = false): Promise<void> {
	if (session.currentRoomId.value != null && session.currentRoomId.value !== props.roomId) {
		const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._calls.switchRoomConfirm });
		if (canceled) return;
	}

	try {
		await session.join(props.roomId, myParticipant.value != null, undefined, startMuted);
		if (!sessionIsCurrent.value) return;
		await refreshRoom();
		if (props.join === 'true') router.replace('/calls/:roomId', { params: { roomId: props.roomId } });
		os.toast(i18n.ts._calls.joinedCall);
	} catch (error) {
		await os.alert({ type: 'error', text: error instanceof Error ? error.message : i18n.ts.somethingHappened });
	}
}

function shouldAutoJoin(): boolean { return props.join === 'true'; }

async function leaveCurrentRoom(): Promise<void> {
	const { canceled } = await os.confirm({ type: 'warning', text: isHost.value ? i18n.ts._calls.endRoom : i18n.ts._calls.leaveRoom });
	if (canceled) return;
	await session.leave();
	os.toast(i18n.ts._calls.leftCall);
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
watch(() => room.value?.state, state => {
	if (state === 'ended' || state === 'cancelled') router.push('/calls');
});
onMounted(() => {
	void refreshRoom().then(() => {
		if (myParticipant.value != null && myParticipant.value.role !== 'listener') void session.prepareMicrophones();
		if (room.value?.state === 'open' && !sessionIsCurrent.value && shouldAutoJoin()) void joinRoom(isHost.value);
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
.liveIndicator { display: inline-flex; align-items: center; gap: 7px; color: var(--MI_THEME-accent); font-weight: 800; letter-spacing: 0.08em; }
.liveIndicator > i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: liveDot 2s ease-out infinite; }
.stateBadge { padding: 5px 10px; border-radius: 999px; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); font-size: 0.82rem; font-weight: 700; }
.description { margin: 16px 0 0; opacity: 0.78; white-space: pre-wrap; }
.lobby { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 22px; }
.lobbyBody { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 12px; }
.lobby p { margin: 6px 0 0; opacity: 0.68; }
.roomActions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 18px; padding-top: 16px; border-top: solid 1px var(--MI_THEME-divider); }
.callControls { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 16px; }
.controlButton { display: inline-flex; min-width: 120px; align-items: center; justify-content: center; gap: 8px; padding: 12px 16px; border-radius: 999px; background: var(--MI_THEME-buttonBg); transition: color 0.18s ease, background-color 0.18s ease, box-shadow 0.22s ease, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1); }
.controlButtonActive { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); }
.controlButtonDanger { color: var(--MI_THEME-error); }
.notFound { display: grid; justify-items: center; gap: 12px; padding: 40px; text-align: center; }
.notFound > i { font-size: 2rem; }
.participantsPanel { padding: 20px; }
.stageSpotlight { padding: 24px; text-align: center; }
.stagePeople { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: 22px; }
.stagePerson { display: grid; min-width: 120px; justify-items: center; gap: 7px; padding: 14px; border-radius: 20px; }
.stageAvatar { width: 76px; height: 76px; border-radius: 50%; }
.sectionHeader { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: solid 1px var(--MI_THEME-divider); }
.sectionHeader span { min-width: 30px; padding: 3px 9px; border-radius: 999px; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); text-align: center; }
.participantGroup { margin-top: 20px; }
.groupLabel { margin-bottom: 10px; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.06em; opacity: 0.65; text-transform: uppercase; }
.participantGrid { position: relative; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr)); gap: 10px; }
.openParticipantGrid { grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 12px; }
.participantCard { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; overflow: hidden; padding: 12px; border-radius: 18px; background-color: color(from var(--MI_THEME-bg) srgb r g b / 0.42); transition: background-color 0.38s ease; }
.openParticipantCard { min-height: 150px; justify-content: center; padding: 18px 12px; text-align: center; }
.participantIdentity { display: flex; min-width: 0; align-items: center; gap: 11px; }
.openParticipantIdentity { width: 100%; flex-direction: column; gap: 10px; }
.avatar, .avatarPlaceholder { width: 44px; height: 44px; flex: 0 0 44px; border-radius: 50%; }
.openAvatar { width: 72px; height: 72px; flex-basis: 72px; }
.openParticipantIdentity .avatarPlaceholder { font-size: 1.6rem; }
.avatarPlaceholder { display: grid; place-items: center; background: var(--MI_THEME-panel); }
.stageAvatar.avatarPlaceholder { width: 76px; height: 76px; flex-basis: 76px; }
.avatarWithWave { position: relative; display: inline-grid; flex: 0 0 auto; place-items: center; margin: -4px; padding: 4px; border-radius: 50%; transition: background-color 0.26s ease, box-shadow 0.3s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
.avatarWithWaveSpeaking { background: color-mix(in srgb, var(--MI_THEME-accent) 18%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--MI_THEME-accent) 45%, transparent), 0 0 22px color-mix(in srgb, var(--MI_THEME-accent) 35%, transparent); transform: scale(1.04); }
.participantDetails { min-width: 0; }
.participantDetails > strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.openParticipantCard .participantDetails { width: 100%; }
.openParticipantCard .participantStatus { justify-content: center; }
.participantStatus { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 4px; font-size: 0.78rem; opacity: 0.72; }
.visuallyHidden { position: absolute; width: 1px; height: 1px; overflow: hidden; margin: -1px; padding: 0; border: 0; clip: rect(0 0 0 0); white-space: nowrap; }
.hostBadge { padding: 2px 7px; border-radius: 999px; background: var(--MI_THEME-accent); color: var(--MI_THEME-fgOnAccent); font-size: 0.68rem; font-weight: 800; }
.requestBadge { color: var(--MI_THEME-infoFg); }
.moderationActions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.surfaceEnterActive { transform-origin: top center; transition: opacity 0.22s ease-out, transform 0.34s cubic-bezier(0.22, 1, 0.36, 1), filter 0.26s ease-out; }
.surfaceLeaveActive { transform-origin: top center; transition: opacity 0.14s ease-in, transform 0.2s ease-in, filter 0.16s ease-in; }
.surfaceEnterFrom { opacity: 0; filter: blur(5px); transform: translateY(12px) scale(0.985); }
.surfaceLeaveTo { opacity: 0; filter: blur(3px); transform: translateY(-6px) scale(0.99); }
.controlsEnterActive { transform-origin: center; transition: opacity 0.2s ease-out, transform 0.42s cubic-bezier(0.16, 1, 0.3, 1); }
.controlsEnterFrom { opacity: 0; transform: translateY(16px) scale(0.92); }
.controlIconEnterActive, .controlIconLeaveActive { transition: opacity 0.14s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
.controlIconEnterFrom { opacity: 0; transform: scale(0.5) rotate(-24deg); }
.controlIconLeaveTo { opacity: 0; transform: scale(0.5) rotate(24deg); }
.personEnterActive, .personLeaveActive, .personMove { transition: opacity 0.24s ease, transform 0.38s cubic-bezier(0.22, 1, 0.36, 1); }
.personEnterFrom { opacity: 0; transform: translateY(14px) scale(0.92); }
.personLeaveTo { opacity: 0; transform: translateY(-8px) scale(0.94); }
.countEnterActive, .countLeaveActive { transition: opacity 0.14s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
.countEnterFrom { opacity: 0; transform: translateY(8px) scale(0.8); }
.countLeaveTo { opacity: 0; transform: translateY(-8px) scale(0.8); }

@media (hover: hover) {
	.controlButton:hover { box-shadow: 0 7px 18px color(from var(--MI_THEME-bg) srgb r g b / 0.16); transform: translateY(-2px); }
	.participantCard:hover { background-color: color-mix(in srgb, var(--MI_THEME-accent) 8%, color(from var(--MI_THEME-bg) srgb r g b / 0.46)); }
}

.controlButton:active { transform: scale(0.97); }

@keyframes liveDot {
	0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--MI_THEME-accent) 44%, transparent); }
	65%, 100% { box-shadow: 0 0 0 8px transparent; }
}

@media (prefers-reduced-motion: reduce) {
	.liveIndicator > i { animation: none; }
	.controlButton, .participantCard, .avatarWithWave, .surfaceEnterActive, .surfaceLeaveActive, .controlsEnterActive, .controlIconEnterActive, .controlIconLeaveActive, .personEnterActive, .personLeaveActive, .personMove, .countEnterActive, .countLeaveActive { transition-duration: 0.01ms; }
	.controlButton:hover, .controlButton:active, .participantCard, .avatarWithWaveSpeaking { transform: none; }
}

@media (max-width: 600px) {
	.lobby, .participantCard, .callControls { align-items: stretch; flex-direction: column; }
	.titleRow { flex-direction: column; }
	.moderationActions { justify-content: stretch; }
}
</style>
