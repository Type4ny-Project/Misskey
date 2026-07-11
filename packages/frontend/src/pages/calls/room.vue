<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader/></template>
	<MkSpacer :contentMax="800">
		<MkLoading v-if="room == null"/>
		<div v-else class="_gaps">
			<section class="_panel" :class="$style.hero">
				<div><strong>{{ room.title }}</strong><p>{{ room.description }}</p></div>
				<span>{{ i18n.ts._calls[room.state] }}</span>
			</section>
			<MkInfo v-if="!connected" warn>{{ i18n.ts._calls.websocketDisconnected }}</MkInfo>
			<MkInfo v-if="mediaState === 'creating-session' || mediaState === 'negotiating'">{{ i18n.ts._calls.roomConnectedMediaConnecting }}</MkInfo>
			<MkInfo v-if="mediaState === 'reconnecting'" warn>{{ i18n.ts._calls.reconnecting }}</MkInfo>
			<MkInfo v-if="mediaFailure != null" warn>{{ failureText }}</MkInfo>
			<MkInfo v-if="myParticipant?.role === 'listener'">{{ i18n.ts._calls.listenerDoesNotNeedMicrophone }}</MkInfo>

			<div :class="$style.actions">
				<MkButton v-if="isHost && room.state === 'scheduled'" primary @click="openRoom">{{ i18n.ts._calls.openRoom }}</MkButton>
				<MkButton v-if="isHost && room.state === 'open'" danger @click="endRoom">{{ i18n.ts._calls.endRoom }}</MkButton>
				<MkButton v-if="myParticipant == null && room.state === 'open'" primary @click="joinRoom">{{ i18n.ts._calls.joinRoom }}</MkButton>
				<MkButton v-if="myParticipant != null && mediaState === 'idle'" primary @click="connectAudio">{{ i18n.ts._calls.connectAudio }}</MkButton>
				<MkButton v-if="mediaState === 'connected'" @click="toggleMute">{{ muted ? i18n.ts._calls.unmute : i18n.ts._calls.mute }}</MkButton>
				<MkButton v-if="myParticipant?.role === 'listener'" @click="requestSpeaker">{{ i18n.ts._calls.requestSpeaker }}</MkButton>
				<MkButton v-if="myParticipant != null && !isHost" @click="leaveRoom">{{ i18n.ts._calls.leaveRoom }}</MkButton>
				<MkButton v-if="needsAudioResume" @click="resumeAudio">{{ i18n.ts._calls.resumeAudio }}</MkButton>
			</div>

			<MkSelect v-if="microphones.length > 0 && myParticipant?.role !== 'listener'" v-model="selectedMicrophone" :items="microphoneItems" @update:modelValue="switchMicrophone">
				<template #label>{{ i18n.ts._calls.microphone }}</template>
			</MkSelect>

			<section class="_panel" :class="$style.participants">
				<div v-for="participant in participants" :key="participant.id" :class="$style.participant">
					<div><strong>{{ participant.userId }}</strong><small>{{ i18n.ts._calls[participant.role] }}</small></div>
					<div v-if="isHost && participant.role !== 'host'" :class="$style.actions">
						<MkButton v-if="participant.role === 'listener'" small @click="setRole(participant.id, 'speaker')">{{ i18n.ts._calls.promoteSpeaker }}</MkButton>
						<MkButton v-else small @click="setRole(participant.id, 'listener')">{{ i18n.ts._calls.demoteListener }}</MkButton>
						<MkButton small danger @click="removeParticipant(participant.id)">{{ i18n.ts._calls.removeParticipant }}</MkButton>
					</div>
				</div>
			</section>
			<div ref="audioContainer" hidden></div>
		</div>
	</MkSpacer>
</MkStickyContainer>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import type { CallsMediaFailure, CallsMediaState } from '@/utility/calls-media.js';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSelect from '@/components/MkSelect.vue';
import { useCallsRoom } from '@/composables/use-calls-room.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { CallsMediaController } from '@/utility/calls-media.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{ roomId: string }>();
const router = useRouter();
const { room, participants, connected, refresh, onTrackChange } = useCallsRoom(props.roomId);
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
const myParticipant = computed(() => participants.value.find(participant => participant.userId === $i?.id) ?? null);
const isHost = computed(() => myParticipant.value?.role === 'host');
const failureText = computed(() => mediaFailure.value === 'unsupported' ? i18n.ts._calls.unsupportedBrowser : mediaFailure.value === 'permission-denied' ? i18n.ts._calls.permissionDenied : mediaFailure.value === 'device-not-found' ? i18n.ts._calls.deviceNotFound : i18n.ts._calls.mediaFailed);

async function openRoom() { if (room.value != null) await misskeyApi('calls/rooms/open', { roomId: props.roomId, expectedRevision: room.value.revision }); }

async function endRoom() { if (room.value != null) await misskeyApi('calls/rooms/end', { roomId: props.roomId, expectedRevision: room.value.revision }); }

async function joinRoom() { await misskeyApi('calls/rooms/join', { roomId: props.roomId }); await refresh(); }

async function leaveRoom() { await media.value?.close(); await misskeyApi('calls/rooms/leave', { roomId: props.roomId }); router.push('/calls'); }

async function requestSpeaker() { await misskeyApi('calls/rooms/request-speaker', { roomId: props.roomId }); }

async function setRole(participantId: string, role: 'speaker' | 'listener') { if (room.value != null) await misskeyApi('calls/rooms/set-role', { roomId: props.roomId, participantId, role, expectedRevision: room.value.revision }); }

async function removeParticipant(participantId: string) { if (room.value != null) await misskeyApi('calls/rooms/remove-participant', { roomId: props.roomId, participantId, expectedRevision: room.value.revision }); }

async function connectAudio() {
	if (myParticipant.value == null) return;
	media.value = new CallsMediaController(props.roomId, myParticipant.value.role, (state, failure) => { mediaState.value = state; mediaFailure.value = failure; }, addRemoteTrack);
	await media.value.connect(selectedMicrophone.value || undefined);
	if (myParticipant.value.role !== 'listener') await loadMicrophones();
}

function addRemoteTrack(track: MediaStreamTrack) {
	const audio = new Audio();
	audio.autoplay = true;
	audio.srcObject = new MediaStream([track]);
	remoteAudio.add(audio);
	audioContainer.value?.append(audio);
	void audio.play().catch(() => { needsAudioResume.value = true; });
	track.addEventListener('ended', () => { remoteAudio.delete(audio); audio.remove(); });
}

async function resumeAudio() { await Promise.all([...remoteAudio].map(audio => audio.play())); needsAudioResume.value = false; }

function toggleMute() { muted.value = !muted.value; media.value?.setMuted(muted.value); }

async function switchMicrophone(deviceId: string) { await media.value?.switchMicrophone(deviceId); }

async function loadMicrophones() { microphones.value = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput'); selectedMicrophone.value ||= microphones.value[0]?.deviceId ?? ''; }

const removeTrackListener = onTrackChange(() => void media.value?.reconcile());
onMounted(refresh);
onUnmounted(() => { removeTrackListener(); void media.value?.close(); for (const audio of remoteAudio) audio.remove(); });

definePage(() => ({ title: room.value?.title ?? i18n.ts._calls.title, icon: 'ti ti-phone' }));
</script>

<style lang="scss" module>
.hero { display: flex; justify-content: space-between; gap: 16px; padding: 24px; }
.hero p { margin-bottom: 0; opacity: 0.7; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.participants { padding: 8px 20px; }
.participant { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 0; border-bottom: solid 1px var(--MI_THEME-divider); }
.participant:last-child { border-bottom: 0; }
.participant small { display: block; opacity: 0.7; }
</style>
