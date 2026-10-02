<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader/></template>
	<div class="_spacer" style="--MI_SPACER-w: 640px;">
		<MkLoading v-if="room == null && !loadFailed"/>
		<div v-else-if="room == null" class="_panel" :class="$style.notFound">
			<i class="ti ti-alert-circle"></i>
			<strong>{{ i18n.ts.notFound }}</strong>
			<MkButton rounded @click="router.push('/calls')">{{ i18n.ts.goBack }}</MkButton>
		</div>
		<section v-else class="_panel" :class="$style.space">
			<header :class="$style.header">
				<div :class="$style.topRow">
					<div :class="$style.roomMeta">
						<span v-if="room.state === 'open'" :class="$style.live"><i class="ti ti-wave-sine"></i> {{ i18n.ts._calls.live }}</span>
						<span v-else>{{ i18n.ts._calls[room.state] }}</span>
						<span>{{ i18n.ts._calls[room.visibility] }}</span>
					</div>
					<button v-if="hasRoomMenu" type="button" class="_button" :class="$style.menuButton" :aria-label="i18n.ts.details" :disabled="session.joining.value" aria-haspopup="menu" @click="openRoomMenu"><i class="ti ti-dots"></i></button>
				</div>
				<h1 :class="$style.title">{{ room.title }}</h1>
				<p v-if="room.description" :class="$style.description">{{ room.description }}</p>
				<small v-if="room.scheduledAt != null">{{ new Date(room.scheduledAt).toLocaleString() }}</small>
				<div :class="$style.roomCount"><i class="ti ti-users"></i> {{ i18n.tsx._calls.peopleInRoom({ count: participants.length }) }}<span v-if="speakingParticipantIds.size > 0"> · {{ i18n.tsx._calls.peopleSpeaking({ count: speakingParticipantIds.size }) }}</span></div>
			</header>

			<div :class="$style.body">
				<MkInfo v-if="session.replacedRoomId.value === props.roomId">{{ i18n.ts._calls.connectedOnAnotherDevice }}</MkInfo>
				<MkInfo v-if="!connected && !session.joining.value" warn>{{ i18n.ts._calls.websocketDisconnected }}</MkInfo>
				<MkInfo v-if="sessionIsCurrent && session.mediaState.value === 'reconnecting'" warn>{{ i18n.ts._calls.reconnecting }}</MkInfo>
				<MkInfo v-if="sessionIsCurrent && session.mediaFailure.value != null" warn>{{ failureText }}</MkInfo>
				<MkInfo v-if="sessionIsCurrent && session.speakerRequestResult.value === 'rejected'" warn>{{ i18n.ts._calls.speakerRequestRejected }}</MkInfo>

				<section v-if="speakers.length > 0" :aria-label="i18n.ts._calls.speaker">
					<div v-if="room.mode === 'stage'" :class="$style.groupLabel">{{ i18n.ts._calls.speaker }}</div>
					<TransitionGroup tag="div" :class="$style.people" :moveClass="$style.personMove">
						<div v-for="participant in speakers" :key="participant.id" :class="$style.person">
							<div :class="[$style.avatarWrap, speakingParticipantIds.has(participant.id) && $style.speaking]">
								<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="$style.avatar" link preview/>
								<div v-else :class="[$style.avatar, $style.avatarPlaceholder]"><i class="ti ti-user"></i></div>
								<span :class="$style.microphoneBadge" :title="participant.isMuted ? i18n.ts._calls.mutedStatus : i18n.ts._calls.microphoneOn"><i :class="participant.isMuted ? 'ti ti-microphone-off' : 'ti ti-microphone'"></i></span>
							</div>
							<div :class="$style.personName">
								<strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong>
								<button v-if="room.mode === 'stage' && isHost && participant.role !== 'host'" type="button" class="_button" :class="$style.personMenu" :aria-label="i18n.ts.details" aria-haspopup="menu" @click="openParticipantMenu(participant, $event)"><i class="ti ti-dots"></i></button>
							</div>
							<small :class="speakingParticipantIds.has(participant.id) && $style.speakingLabel">{{ speakingParticipantIds.has(participant.id) ? i18n.ts._calls.speakingNow : participant.role === 'host' ? i18n.ts._calls.host : i18n.ts._calls.speaker }}</small>
						</div>
					</TransitionGroup>
				</section>

				<section v-if="listeners.length > 0" :aria-label="i18n.ts._calls.listener">
					<div :class="$style.groupLabel">{{ i18n.ts._calls.listener }} · {{ listeners.length }}</div>
					<TransitionGroup tag="div" :class="$style.people" :moveClass="$style.personMove">
						<div v-for="participant in listeners" :key="participant.id" :class="$style.person">
							<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="$style.listenerAvatar" link preview/>
							<div v-else :class="[$style.listenerAvatar, $style.avatarPlaceholder]"><i class="ti ti-user"></i></div>
							<div :class="$style.personName">
								<strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong>
								<button v-if="room.mode === 'stage' && isHost" type="button" class="_button" :class="$style.personMenu" :aria-label="i18n.ts.details" aria-haspopup="menu" @click="openParticipantMenu(participant, $event)"><i class="ti ti-dots"></i></button>
							</div>
							<small v-if="participant.speakerRequestedAt != null" :class="$style.speakingLabel"><i class="ti ti-hand-stop"></i> {{ i18n.ts._calls.requestSpeaker }}</small>
						</div>
					</TransitionGroup>
				</section>

				<div v-if="sessionIsCurrent && session.videos.value.length > 0" :class="$style.videoGrid">
					<CallsVideo v-for="video in session.videos.value" :key="video.id" :stream="video.stream" :label="videoLabel(video.participantId, video.source)" :class="video.source === 'screen' && $style.screenVideo"/>
				</div>
			</div>

			<footer :class="$style.footer">
				<template v-if="sessionIsCurrent">
					<div :class="$style.footerStatus" aria-live="polite">{{ session.joining.value || session.mediaState.value === 'creating-session' || session.mediaState.value === 'negotiating' ? i18n.ts._calls.roomConnectedMediaConnecting : session.mediaState.value === 'reconnecting' ? i18n.ts._calls.reconnectingShort : i18n.ts._calls.connected }}</div>
					<MkButton v-if="session.needsAudioResume.value" rounded @click="session.resumeAudio()">{{ i18n.ts._calls.resumeAudio }}</MkButton>
					<MkCallsControls :state="session.controls.value" @mute="session.toggleMute()" @camera="session.toggleVideo('camera')" @screen="session.toggleVideo('screen')" @microphoneSettings="session.openDeviceMenu('microphone', $event)" @cameraSettings="session.openDeviceMenu('camera', $event)" @speakerRequest="session.controls.value.speakerRequested ? session.cancelSpeakerRequest() : session.requestSpeaker()" @leave="leaveCurrentRoom"/>
				</template>
				<template v-else-if="room.state === 'open'">
					<p :class="$style.joinHint">{{ room.mode === 'open' ? i18n.ts._calls.joinMutedHint : i18n.ts._calls.listenerDoesNotNeedMicrophone }}</p>
					<MkButton primary large rounded :wait="session.joining.value" :class="$style.joinButton" @click="joinRoom(room.mode === 'open')"><i class="ti ti-headphones"></i> {{ session.joining.value ? i18n.ts._calls.roomConnectedMediaConnecting : i18n.ts._calls.joinRoom }}</MkButton>
				</template>
				<MkButton v-else-if="isHost && room.state === 'scheduled'" primary large rounded @click="openRoom">{{ i18n.ts._calls.openRoom }}</MkButton>
			</footer>
		</section>
	</div>
</MkStickyContainer>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import CallsVideo from './video.vue';
import type * as Misskey from 'misskey-js';
import MkCallsControls from '@/components/MkCallsControls.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
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
const sessionIsCurrent = computed(() => isSessionRoom.value && session.isActive.value);
const failureText = computed(() => session.mediaFailure.value === 'unsupported' ? i18n.ts._calls.unsupportedBrowser : session.mediaFailure.value === 'permission-denied' ? i18n.ts._calls.permissionDenied : session.mediaFailure.value === 'device-not-found' ? i18n.ts._calls.deviceNotFound : session.mediaFailure.value === 'permission-pending' ? i18n.ts._calls.permissionPending : i18n.ts._calls.mediaFailed);

const hasRoomMenu = computed(() => isHost.value && (room.value?.state === 'scheduled' || (room.value?.state === 'open' && !sessionIsCurrent.value && session.replacedRoomId.value !== props.roomId)));

function openRoomMenu(event: MouseEvent): void {
	if (session.joining.value || !hasRoomMenu.value) return;
	os.popupMenu(room.value?.state === 'scheduled' ? [
		{ text: i18n.ts._calls.cancelRoom, icon: 'ti ti-x', danger: true, action: cancelRoom },
	] : [
		{ text: i18n.ts._calls.endRoom, icon: 'ti ti-phone-off', danger: true, async action() {
			if (!(await os.confirm({ type: 'warning', text: i18n.ts._calls.endRoom })).canceled) await endRoom();
		} },
	], event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined);
}

function openParticipantMenu(participant: (typeof participants.value)[number], event: MouseEvent): void {
	if (!isHost.value || room.value?.mode !== 'stage' || participant.role === 'host') return;
	os.popupMenu([
		{ text: participant.role === 'listener' ? participant.speakerRequestedAt != null ? i18n.ts.approve : i18n.ts._calls.promoteSpeaker : i18n.ts._calls.demoteListener, icon: 'ti ti-microphone', action: () => setRole(participant.id, participant.role === 'listener' ? 'speaker' : 'listener') },
		...(participant.speakerRequestedAt != null ? [{ text: i18n.ts.reject, icon: 'ti ti-x', action: () => setRole(participant.id, 'listener') }] : []),
		{ text: i18n.ts._calls.removeParticipant, icon: 'ti ti-user-x', danger: true, action: () => removeParticipant(participant.id) },
	], event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined);
}

function videoLabel(participantId: string, source: 'camera' | 'screen'): string {
	const participant = participants.value.find(item => item.id === participantId);
	const user = participant == null ? null : participantUser(participant.userId);
	return `${user?.name || user?.username || participant?.userId || ''} · ${source === 'screen' ? i18n.ts._calls.screenSharing : i18n.ts._calls.camera}`;
}

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
.space { display: flex; flex-direction: column; min-height: min(620px, calc(100dvh - 120px)); border-radius: 24px; }
.header { padding: 24px 24px 16px; }
.topRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 32px; }
.roomMeta { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 0.8rem; color: var(--MI_THEME-fgTransparentWeak); }
.live { display: inline-flex; align-items: center; gap: 4px; color: var(--MI_THEME-accent); font-weight: 700; }
.live > i { font-size: 20px; }
.title { margin: 12px 0; font-size: 1.5rem; line-height: 1.4; overflow-wrap: anywhere; }
.description { margin: 0 0 12px; white-space: pre-wrap; overflow-wrap: anywhere; opacity: 0.8; }
.roomCount { margin-top: 12px; font-size: 0.85rem; opacity: 0.65; }
.menuButton { width: 36px; height: 36px; border-radius: 50%; font-size: 20px; }
.body { display: flex; flex: 1; flex-direction: column; gap: 28px; padding: 16px 24px 32px; }
.groupLabel { margin-bottom: 20px; font-size: 0.85rem; font-weight: 600; opacity: 0.65; }
.people { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 28px 16px; }
.person { display: flex; min-width: 0; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
.avatarWrap { position: relative; padding: 4px; border: 2px solid transparent; border-radius: 50%; transition: border-color 0.2s ease; }
.speaking { border-color: var(--MI_THEME-accent); }
.avatar { display: block; width: 72px; height: 72px; border-radius: 50%; }
.listenerAvatar { display: block; width: 48px; height: 48px; border-radius: 50%; margin: 6px 0; }
.avatarPlaceholder { display: grid; place-items: center; background: var(--MI_THEME-buttonBg); font-size: 24px; }
.microphoneBadge { position: absolute; right: -2px; bottom: -2px; display: grid; place-items: center; width: 24px; height: 24px; border: 3px solid var(--MI_THEME-panel); border-radius: 50%; background: var(--MI_THEME-buttonBg); font-size: 12px; }
.personName { display: flex; align-items: center; justify-content: center; width: 100%; min-width: 0; gap: 4px; }
.personName > strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; }
.personMenu { flex: 0 0 28px; height: 28px; border-radius: 50%; }
.person > small { font-size: 0.75rem; color: var(--MI_THEME-fgTransparentWeak); }
.person > .speakingLabel { color: var(--MI_THEME-accent); }
.personMove { transition: transform 0.2s ease; }
.videoGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 12px; }
.screenVideo { grid-column: 1 / -1; }
.footer { position: sticky; bottom: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: auto; padding: 20px 20px max(20px, env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--MI_THEME-divider); background: var(--MI_THEME-panel); border-radius: 0 0 24px 24px; z-index: 1; }
.footerStatus { font-size: 0.8rem; opacity: 0.65; }
.joinHint { margin: 0; font-size: 0.85rem; opacity: 0.7; }
.joinButton { width: min(100%, 360px); }
.notFound { display: grid; justify-items: center; gap: 12px; padding: 40px; text-align: center; }
@media (max-width: 600px) {
	.header { padding: 20px 20px 12px; }
	.body { padding: 12px 20px 28px; }
	.people { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 24px 10px; }
	.space { min-height: min(560px, calc(100dvh - 100px)); }
	.footer { padding-left: 12px; padding-right: 12px; }
}
@media (prefers-reduced-motion: reduce) {
	.avatarWrap, .personMove { transition: none; }
}
</style>
