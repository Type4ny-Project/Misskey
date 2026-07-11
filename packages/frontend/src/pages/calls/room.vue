<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader/></template>
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<MkLoading v-if="room == null && !loadFailed"/>
		<div v-else-if="room == null" class="_panel" :class="$style.notFound">
			<i class="ti ti-alert-circle"></i>
			<strong>{{ i18n.ts.notFound }}</strong>
			<MkButton rounded @click="router.push('/calls')">{{ i18n.ts.goBack }}</MkButton>
		</div>
		<div v-else class="_gaps" :class="$style.roomContent">
			<section class="_panel" :class="$style.hero">
				<div>
					<strong>{{ room.title }}</strong>
					<p>{{ room.description }}</p>
					<small>{{ i18n.ts._calls[room.attachment.type === 'personal' ? 'personalRoom' : 'chatRoom'] }} · {{ i18n.ts._calls[room.visibility] }}</small>
					<small v-if="room.scheduledAt != null"> · {{ new Date(room.scheduledAt).toLocaleString() }}</small>
				</div>
				<span>{{ i18n.ts._calls[room.state] }}</span>
			</section>
			<MkInfo v-if="!connected" warn>{{ i18n.ts._calls.websocketDisconnected }}</MkInfo>
			<MkInfo v-if="mediaState === 'creating-session' || mediaState === 'negotiating'">{{ i18n.ts._calls.roomConnectedMediaConnecting }}</MkInfo>
			<MkInfo v-if="mediaState === 'reconnecting'" warn>{{ i18n.ts._calls.reconnecting }}</MkInfo>
			<MkInfo v-if="mediaFailure != null" warn>{{ failureText }}</MkInfo>
			<MkInfo v-if="myParticipant?.role === 'listener'">{{ i18n.ts._calls.listenerDoesNotNeedMicrophone }}</MkInfo>

			<div :class="$style.actions">
				<MkButton v-if="isHost && room.state === 'scheduled'" primary @click="openRoom">{{ i18n.ts._calls.openRoom }}</MkButton>
				<MkButton v-if="isHost && room.state === 'scheduled'" danger @click="cancelRoom">{{ i18n.ts._calls.cancelRoom }}</MkButton>
				<MkButton v-if="isHost && room.state === 'open'" danger @click="endRoom">{{ i18n.ts._calls.endRoom }}</MkButton>
				<MkButton v-if="myParticipant == null && room.state === 'open'" primary :disabled="joining" @click="joinRoom"><i class="ti ti-phone-call"></i> {{ i18n.ts._calls.joinRoom }}</MkButton>
				<MkButton v-if="mediaState === 'acquiring-media'" @click="media?.cancelMicrophoneRequest()">{{ i18n.ts.cancel }}</MkButton>
				<MkButton v-if="needsAudioResume" @click="resumeAudio">{{ i18n.ts._calls.resumeAudio }}</MkButton>
			</div>

			<MkSelect v-if="microphones.length > 0 && myParticipant?.role !== 'listener'" v-model="selectedMicrophone" :items="microphoneItems" @update:modelValue="switchMicrophone">
				<template #label>{{ i18n.ts._calls.microphone }}</template>
			</MkSelect>

			<section class="_panel" :class="$style.participants">
				<header :class="$style.sectionHeader">
					<strong>{{ i18n.ts.users }}</strong>
					<span>{{ participants.length }}</span>
				</header>
				<div v-for="participant in participants" :key="participant.id" :class="[$style.participant, { [$style.speaking]: speakingParticipantIds.has(participant.id) }]">
					<div :class="$style.participantIdentity">
						<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="$style.avatar" indicator link preview/>
						<div v-else :class="$style.avatarPlaceholder"><i class="ti ti-user"></i></div>
						<div :class="$style.participantDetails">
							<strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong>
							<div :class="$style.badges">
								<span :class="[$style.roleBadge, $style[participant.role]]">{{ i18n.ts._calls[participant.role] }}</span>
								<span v-if="participant.role !== 'listener'" :class="$style.mediaState"><i v-if="speakingParticipantIds.has(participant.id)" class="ti ti-volume"></i><i v-else :class="participant.isMuted ? 'ti ti-microphone-off' : 'ti ti-microphone'"></i> {{ participant.isMuted ? i18n.ts._calls.mute : i18n.ts._calls.unmute }}</span>
								<span v-else :class="$style.mediaState"><i class="ti ti-headphones"></i> {{ i18n.ts.online }}</span>
								<span v-if="participant.speakerRequestedAt != null" :class="$style.requestBadge"><i class="ti ti-hourglass-empty"></i> {{ i18n.ts._calls.requestSpeaker }}</span>
							</div>
						</div>
					</div>
					<div v-if="isHost && participant.role !== 'host'" :class="$style.actions">
						<MkButton v-if="participant.role === 'listener'" small @click="setRole(participant.id, 'speaker')">{{ participant.speakerRequestedAt != null ? i18n.ts.approve : i18n.ts._calls.promoteSpeaker }}</MkButton>
						<MkButton v-else small @click="setRole(participant.id, 'listener')">{{ i18n.ts._calls.demoteListener }}</MkButton>
						<MkButton small danger @click="removeParticipant(participant.id)">{{ i18n.ts._calls.removeParticipant }}</MkButton>
					</div>
				</div>
			</section>
			<div ref="audioContainer" hidden></div>
			<footer v-if="myParticipant != null && room.state === 'open'" class="_panel _acrylic" :class="$style.callDock">
				<div :class="$style.callIndicator">
					<span :class="[$style.statusDot, { [$style.active]: mediaState === 'connected', [$style.busy]: mediaBusy }]" aria-hidden="true"></span>
					<div><strong>{{ room.title }}</strong><small>{{ mediaStatusText }} · {{ i18n.ts._calls[myParticipant.role] }}</small></div>
				</div>
				<div :class="$style.dockActions">
					<MkButton v-if="mediaState === 'idle' || mediaState === 'failed' || mediaState === 'closed'" primary small @click="connectAudio"><i class="ti ti-headphones"></i> {{ i18n.ts._calls.connectAudio }}</MkButton>
					<MkButton v-if="mediaState === 'connected' && myParticipant.role !== 'listener'" small @click="toggleMute"><i :class="muted ? 'ti ti-microphone' : 'ti ti-microphone-off'"></i> {{ muted ? i18n.ts._calls.unmute : i18n.ts._calls.mute }}</MkButton>
					<MkButton v-if="mediaState === 'connected' || mediaState === 'reconnecting'" small @click="disconnectAudio"><i class="ti ti-headphones-off"></i> {{ i18n.ts._calls.disconnectAudio }}</MkButton>
					<MkButton v-if="myParticipant.role === 'listener'" small :disabled="myParticipant.speakerRequestedAt != null" @click="requestSpeaker"><i :class="myParticipant.speakerRequestedAt != null ? 'ti ti-hourglass-empty' : 'ti ti-hand-click'"></i> {{ i18n.ts._calls.requestSpeaker }}</MkButton>
					<MkButton v-if="!isHost" danger small @click="leaveRoom"><i class="ti ti-phone-off"></i> {{ i18n.ts._calls.leaveRoom }}</MkButton>
				</div>
			</footer>
		</div>
	</div>
</MkStickyContainer>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import type { CallsMediaFailure, CallsMediaState } from '@/utility/calls-media.js';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSelect from '@/components/MkSelect.vue';
import { useCallsRoom } from '@/composables/use-calls-room.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { CallsMediaController } from '@/utility/calls-media.js';
import { detectCallsMediaCapabilities } from '@/utility/calls-media-core.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{ roomId: string }>();
const router = useRouter();
const { room, participants, connected, speakingParticipantIds, refresh, setMuted, setSpeaking, heartbeat, onTrackChange, onRevoked } = useCallsRoom(props.roomId);
const media = shallowRef<CallsMediaController | null>(null);
const mediaState = ref<CallsMediaState>('idle');
const mediaFailure = ref<CallsMediaFailure | null>(null);
const muted = ref(false);
const microphones = ref<MediaDeviceInfo[]>([]);
const selectedMicrophone = ref('');
const microphoneItems = computed(() => microphones.value.map(device => ({ label: device.label || device.deviceId, value: device.deviceId })));
const audioContainer = ref<HTMLElement | null>(null);
const remoteAudio = new Set<HTMLAudioElement>();
const needsAudioResume = ref(false);
const loadFailed = ref(false);
const joining = ref(false);
const usersById = shallowRef(new Map<string, Misskey.entities.UserLite>());
const myParticipant = computed(() => participants.value.find(participant => participant.userId === $i?.id) ?? null);
const isHost = computed(() => myParticipant.value?.role === 'host');
const failureText = computed(() => mediaFailure.value === 'unsupported' ? i18n.ts._calls.unsupportedBrowser : mediaFailure.value === 'permission-denied' ? i18n.ts._calls.permissionDenied : mediaFailure.value === 'device-not-found' ? i18n.ts._calls.deviceNotFound : mediaFailure.value === 'permission-pending' ? i18n.ts._calls.permissionPending : i18n.ts._calls.mediaFailed);
const mediaBusy = computed(() => ['acquiring-media', 'creating-session', 'negotiating', 'reconnecting', 'leaving'].includes(mediaState.value));
const mediaStatusText = computed(() => mediaState.value === 'connected' ? i18n.ts.online : mediaState.value === 'reconnecting' ? i18n.ts._calls.reconnecting : mediaBusy.value ? i18n.ts._calls.roomConnectedMediaConnecting : mediaState.value === 'failed' ? failureText.value : i18n.ts.offline);

async function openRoom() { if (room.value != null) room.value = await misskeyApi('calls/rooms/open', { roomId: props.roomId, expectedRevision: room.value.revision }); }

async function cancelRoom() { if (room.value != null) room.value = await misskeyApi('calls/rooms/cancel', { roomId: props.roomId, expectedRevision: room.value.revision }); }

async function endRoom() { if (room.value != null) room.value = await misskeyApi('calls/rooms/end', { roomId: props.roomId, expectedRevision: room.value.revision }); }

async function joinRoom() {
	if (joining.value) return;
	const capabilities = detectCallsMediaCapabilities();
	if (!capabilities.secureContext || !capabilities.peerConnection || !capabilities.transceiver) {
		mediaState.value = 'failed';
		mediaFailure.value = 'unsupported';
		return;
	}
	joining.value = true;
	let joined = false;
	try {
		await misskeyApi('calls/rooms/join', { roomId: props.roomId });
		joined = true;
		await refresh();
		await connectAudio();
	} catch (error) {
		await media.value?.close().catch(() => undefined);
		media.value = null;
		if (joined) await misskeyApi('calls/rooms/leave', { roomId: props.roomId }).catch(() => undefined);
		await refresh().catch(() => undefined);
		await os.alert({ type: 'error', text: error instanceof Error ? error.message : i18n.ts.somethingHappened });
	} finally {
		joining.value = false;
	}
}

async function leaveRoom() { await media.value?.close(); await misskeyApi('calls/rooms/leave', { roomId: props.roomId }); router.push('/calls'); }

async function requestSpeaker() { await misskeyApi('calls/rooms/request-speaker', { roomId: props.roomId }); }

async function setRole(participantId: string, role: 'speaker' | 'listener') { if (room.value != null) { await misskeyApi('calls/rooms/set-role', { roomId: props.roomId, participantId, role, expectedRevision: room.value.revision }); await refresh(); } }

async function removeParticipant(participantId: string) { if (room.value != null) { await misskeyApi('calls/rooms/remove-participant', { roomId: props.roomId, participantId, expectedRevision: room.value.revision }); await refresh(); } }

async function connectAudio() {
	if (myParticipant.value == null) return;
	await media.value?.close().catch(() => undefined);
	media.value = new CallsMediaController(props.roomId, myParticipant.value.role, (state, failure) => { mediaState.value = state; mediaFailure.value = failure; }, addRemoteTrack, (_stats, speaking) => setSpeaking(speaking));
	try {
		await media.value.connect(selectedMicrophone.value || undefined);
	} catch {
		// CallsMediaController reports a normalized, user-facing failure through onState.
		return;
	}
	if (myParticipant.value.role !== 'listener') await loadMicrophones();
}

async function disconnectAudio() {
	await media.value?.close();
	media.value = null;
	muted.value = false;
}

function addRemoteTrack(track: MediaStreamTrack) {
	if ([...remoteAudio].some(audio => (audio.srcObject as MediaStream | null)?.getTracks().some(current => current.id === track.id))) return;
	const audio = new Audio();
	audio.autoplay = true;
	audio.srcObject = new MediaStream([track]);
	remoteAudio.add(audio);
	audioContainer.value?.append(audio);
	void audio.play().catch(() => { needsAudioResume.value = true; });
	track.addEventListener('ended', () => { remoteAudio.delete(audio); audio.remove(); });
}

async function resumeAudio() { await Promise.all([...remoteAudio].map(audio => audio.play())); needsAudioResume.value = false; }

function toggleMute() { muted.value = !muted.value; media.value?.setMuted(muted.value); setMuted(muted.value); }

async function switchMicrophone(deviceId: string) { await media.value?.switchMicrophone(deviceId); }

async function loadMicrophones() { microphones.value = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput'); selectedMicrophone.value ||= microphones.value[0]?.deviceId ?? ''; }

function participantUser(userId: string) { return usersById.value.get(userId) ?? null; }

async function loadParticipantUsers(userIds: string[]) {
	const missingUserIds = [...new Set(userIds)].filter(userId => !usersById.value.has(userId));
	if (missingUserIds.length === 0) return;
	try {
		const users = await misskeyApi('users/show', { userIds: missingUserIds });
		usersById.value = new Map([...usersById.value, ...users.map(user => [user.id, user] as const)]);
	} catch {
		// Keep the participant card usable with its user ID and retry on the next room snapshot.
	}
}

async function handleDeviceChange() {
	const previous = selectedMicrophone.value;
	await loadMicrophones();
	if (previous !== '' && !microphones.value.some(device => device.deviceId === previous)) {
		selectedMicrophone.value = microphones.value[0]?.deviceId ?? '';
		if (selectedMicrophone.value !== '' && mediaState.value === 'connected') await switchMicrophone(selectedMicrophone.value);
	}
}

const removeTrackListener = onTrackChange(() => void media.value?.reconcile());
const removeRevokedListener = onRevoked(reason => {
	if (reason === 'stale-generation') void disconnectAudio().then(connectAudio);
	else if (reason === 'moderation' && myParticipant.value?.role === 'listener' && room.value?.state === 'open') void disconnectAudio().then(connectAudio);
	else void media.value?.close();
});
watch(() => myParticipant.value?.isMuted, value => { if (value != null) muted.value = value; });
watch(() => myParticipant.value?.role, (role, previousRole) => {
	if (previousRole === 'listener' && role === 'speaker' && room.value?.state === 'open') void (media.value == null ? connectAudio() : disconnectAudio().then(connectAudio));
});
watch(() => room.value?.state, state => { if (state === 'ended' || state === 'cancelled') void disconnectAudio(); });
watch(() => participants.value.map(participant => participant.userId), userIds => { void loadParticipantUsers(userIds); }, { immediate: true });
const heartbeatTimer = window.setInterval(() => { const identity = media.value?.connectionIdentity; if (identity != null) heartbeat(identity.connectionId, identity.generation); }, 30_000);
onMounted(() => { void refresh().catch(() => { loadFailed.value = true; }); navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange); });
onUnmounted(() => { window.clearInterval(heartbeatTimer); navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange); removeTrackListener(); removeRevokedListener(); void media.value?.close(); for (const audio of remoteAudio) audio.remove(); });

definePage(() => ({ title: room.value?.title ?? i18n.ts._calls.title, icon: 'ti ti-phone' }));
</script>

<style lang="scss" module>
.hero { display: flex; justify-content: space-between; gap: 16px; padding: 24px; }
.hero p { margin-bottom: 0; opacity: 0.7; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.roomContent { min-height: calc(100dvh - 90px); padding-bottom: 96px; }
.notFound { display: grid; justify-items: center; gap: 12px; padding: 40px; text-align: center; }
.notFound > i { font-size: 2rem; }
.participants { padding: 0 20px 8px; }
.sectionHeader { display: flex; justify-content: space-between; align-items: center; padding: 16px 0 8px; border-bottom: solid 1px var(--MI_THEME-divider); }
.sectionHeader span { min-width: 28px; padding: 2px 8px; text-align: center; border-radius: var(--MI-radius); background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); }
.participant { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 0; border-bottom: solid 1px var(--MI_THEME-divider); }
.participant:last-child { border-bottom: 0; }
.participantIdentity { display: flex; align-items: center; gap: 12px; min-width: 0; }
.avatar, .avatarPlaceholder { width: 52px; height: 52px; flex: 0 0 52px; border-radius: 50%; }
.avatarPlaceholder { display: grid; place-items: center; background: var(--MI_THEME-buttonBg); font-size: 24px; }
.participantDetails { min-width: 0; }
.badges { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 5px; font-size: 0.82em; }
.roleBadge, .requestBadge { padding: 2px 8px; border-radius: var(--MI-radius); }
.host { background: var(--MI_THEME-accent); color: var(--MI_THEME-fgOnAccent); }
.speaker { background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); }
.listener { background: var(--MI_THEME-buttonBg); }
.requestBadge { background: var(--MI_THEME-infoBg); color: var(--MI_THEME-infoFg); }
.mediaState { opacity: 0.75; }
.speaking { box-shadow: inset 4px 0 var(--MI_THEME-accent); }
.callDock { position: fixed; bottom: var(--MI-margin); left: 50%; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 16px; width: min(calc(100vw - var(--MI-margin) - var(--MI-margin)), 800px); padding: 12px 16px; transform: translateX(-50%); box-shadow: 0 8px 32px color-mix(in srgb, var(--MI_THEME-bg) 45%, transparent); }
.callIndicator { display: flex; align-items: center; gap: 10px; min-width: 0; }
.callIndicator > div { min-width: 0; }
.callIndicator strong, .callIndicator small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.callIndicator small { opacity: 0.7; }
.statusDot { width: 12px; height: 12px; flex: 0 0 12px; border-radius: 50%; background: var(--MI_THEME-divider); }
.statusDot.active { background: var(--MI_THEME-accent); box-shadow: 0 0 0 4px var(--MI_THEME-accentedBg); }
.statusDot.busy { background: var(--MI_THEME-warn); animation: pulse 1.2s ease-in-out infinite; }
.dockActions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }

@keyframes pulse { 50% { opacity: 0.45; } }

@media (max-width: 500px) {
	.participant { align-items: flex-start; flex-direction: column; }
	.participant > .actions { padding-left: 64px; }
	.callDock { align-items: stretch; flex-direction: column; }
	.dockActions { justify-content: stretch; }
}
</style>
