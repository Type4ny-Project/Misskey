<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="dialog" preferType="drawer" :manualShowing="popoutTarget != null ? false : null" @click="closeWindow" @esc="closeWindow" @closed="onDialogClosed">
<Teleport :to="popoutTarget ?? 'body'" :disabled="popoutTarget == null">
	<section class="_panel" :class="$style.space">
		<header :class="$style.header">
			<button type="button" class="_button" :class="$style.menuButton" :aria-label="i18n.ts.windowMinimize" :title="i18n.ts.windowMinimize" @click="closeWindow"><i class="ti ti-minus"></i></button>
			<div :class="$style.heading">
				<h1 :class="$style.title">{{ room?.title ?? i18n.ts._calls.title }}</h1>
				<small v-if="sessionIsCurrent && session.elapsedTime.value != null" :class="$style.elapsedTime" :title="i18n.ts._calls.elapsedTime"><i class="ti ti-clock" aria-hidden="true"></i> {{ session.elapsedTime.value }}</small>
			</div>
			<button v-if="room != null" type="button" class="_button" :class="$style.menuButton" :aria-label="i18n.ts.copyLink" :title="i18n.ts.copyLink" @click="copyRoomLink"><i class="ti ti-link" aria-hidden="true"></i></button>
			<button v-if="hasRoomMenu" type="button" class="_button" :class="$style.menuButton" :aria-label="i18n.ts.details" :disabled="session.joining.value" aria-haspopup="menu" @click="openRoomMenu"><i class="ti ti-dots"></i></button>
			<button v-if="popoutTarget == null" type="button" class="_button" :class="$style.menuButton" :aria-label="i18n.ts.popout" :title="i18n.ts.popout" @click="popout"><i class="ti ti-external-link"></i></button>
		</header>
		<MkLoading v-if="room == null && !loadFailed"/>
		<div v-else-if="room == null" :class="$style.notFound"><i class="ti ti-alert-circle"></i><strong>{{ i18n.ts.notFound }}</strong></div>
		<template v-else>
			<div v-if="room.state === 'ended'" :class="[$style.body, $style.endedBody]">
				<section :class="$style.summary">
					<h2 :class="$style.summaryTitle"><i class="ti ti-phone-off" aria-hidden="true"></i> {{ i18n.ts._calls.ended }}</h2>
					<MkCallsRoomSummary :room="room"/>
				</section>
			</div>
			<div v-else :class="$style.body">
				<MkInfo v-if="session.replacedRoomId.value === props.roomId">{{ i18n.ts._calls.connectedOnAnotherDevice }}</MkInfo>
				<MkInfo v-if="!connected && !session.joining.value" warn>{{ i18n.ts._calls.websocketDisconnected }}</MkInfo>
				<MkInfo v-if="sessionIsCurrent && session.mediaState.value === 'reconnecting'" warn>{{ i18n.ts._calls.reconnecting }}</MkInfo>
				<MkInfo v-if="sessionIsCurrent && session.mediaFailure.value != null" warn>{{ failureText }}</MkInfo>
				<MkInfo v-if="sessionIsCurrent && session.speakerRequestResult.value === 'rejected'" warn>{{ i18n.ts._calls.speakerRequestRejected }}</MkInfo>

				<div :class="$style.callLayout">
					<section ref="stage" :class="$style.stage" :aria-label="i18n.ts._calls.title">
						<div ref="videoGrid" :class="$style.videoGrid" :style="videoGridStyle">
							<CallsVideo v-for="video in roomVideos" :key="video.id" :stream="video.stream" screenWindow :screenWindowActive="session.screenWindows.has(video.stream)" :label="videoLabel(video.participantId)" :speaking="speakingParticipantIds.has(video.participantId)" :focused="focusedVideoId === video.id" :class="focusedVideoId === video.id && $style.focusedVideo" @contextmenu.capture.stop.prevent="openParticipantMenu(participants.find(participant => participant.id === video.participantId), $event)" @select="focusVideo(video.id)" @screenWindow="showScreenWindow(video.stream, video.participantId)"/>
							<div v-for="participant in audioOnlySpeakers" :key="participant.id" :class="[$style.voiceTile, speakingParticipantIds.has(participant.id) && $style.speaking]" @contextmenu.capture.stop.prevent="openParticipantMenu(participant, $event)">
								<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="$style.stageAvatar"/>
								<i v-else class="ti ti-user" :class="$style.stageAvatarPlaceholder"></i>
								<div :class="$style.tileName"><i :class="participant.isMuted ? 'ti ti-microphone-off' : 'ti ti-microphone'"></i><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></div>
							</div>
						</div>
					</section>
					<aside :class="$style.participantArea" :aria-label="i18n.ts.users">
						<section v-if="speakers.length > 0" :aria-label="i18n.ts._calls.speaker">
							<div v-if="room.mode === 'stage'" :class="$style.groupLabel">{{ i18n.ts._calls.speaker }}</div>
							<TransitionGroup tag="div" :class="$style.people" :moveClass="$style.personMove">
								<div v-for="participant in speakers" :key="participant.id" :class="$style.person" @contextmenu.capture.stop.prevent="openParticipantMenu(participant, $event)">
									<MkA v-if="participantUser(participant.userId) != null" v-user-preview="participant.userId" :to="userPage(participantUser(participant.userId)!)" :aria-label="acct(participantUser(participant.userId)!)" :class="$style.personLink"/>
									<div :class="[$style.avatarWrap, speakingParticipantIds.has(participant.id) && $style.speaking]">
										<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="$style.avatar"/>
										<div v-else :class="[$style.avatar, $style.avatarPlaceholder]"><i class="ti ti-user"></i></div>
										<span :class="$style.microphoneBadge" :title="participant.isMuted ? i18n.ts._calls.mutedStatus : i18n.ts._calls.microphoneOn"><i :class="participant.isMuted ? 'ti ti-microphone-off' : 'ti ti-microphone'"></i></span>
									</div>
									<div :class="$style.personName">
										<strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong>
										<button v-if="canModerateParticipants && participant.role !== 'host' && participant.userId !== $i?.id" type="button" class="_button" :class="$style.personMenu" :aria-label="i18n.ts.details" aria-haspopup="menu" @click="openParticipantMenu(participant, $event)"><i class="ti ti-dots"></i></button>
									</div>
									<small :class="speakingParticipantIds.has(participant.id) && $style.speakingLabel">{{ speakingParticipantIds.has(participant.id) ? i18n.ts._calls.speakingNow : participant.role === 'host' ? i18n.ts._calls.host : room.moderatorUserIds.includes(participant.userId) ? i18n.ts._calls.vcModerator : i18n.ts._calls.speaker }}</small>
									<label v-if="sessionIsCurrent && participant.userId !== $i?.id" :class="$style.personVolume">
										<span>{{ i18n.ts.volume }} · {{ session.getParticipantVolume(participant.userId) }}%</span>
										<input type="range" min="0" max="100" step="1" :value="session.getParticipantVolume(participant.userId)" :aria-label="`${i18n.ts.volume}: ${videoLabel(participant.id)}`" @input="session.setParticipantVolume(participant.userId, ($event.target as HTMLInputElement).valueAsNumber)">
									</label>
								</div>
							</TransitionGroup>
						</section>

						<section v-if="listeners.length > 0" :aria-label="i18n.ts._calls.listener">
							<div :class="$style.groupLabel">{{ i18n.ts._calls.listener }} · {{ listeners.length }}</div>
							<TransitionGroup tag="div" :class="$style.people" :moveClass="$style.personMove">
								<div v-for="participant in listeners" :key="participant.id" :class="$style.person" @contextmenu.capture.stop.prevent="openParticipantMenu(participant, $event)">
									<MkA v-if="participantUser(participant.userId) != null" v-user-preview="participant.userId" :to="userPage(participantUser(participant.userId)!)" :aria-label="acct(participantUser(participant.userId)!)" :class="$style.personLink"/>
									<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="$style.listenerAvatar"/>
									<div v-else :class="[$style.listenerAvatar, $style.avatarPlaceholder]"><i class="ti ti-user"></i></div>
									<div :class="$style.personName">
										<strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong>
										<button v-if="canModerateParticipants && participant.userId !== $i?.id" type="button" class="_button" :class="$style.personMenu" :aria-label="i18n.ts.details" aria-haspopup="menu" @click="openParticipantMenu(participant, $event)"><i class="ti ti-dots"></i></button>
									</div>
									<small v-if="room.moderatorUserIds.includes(participant.userId)">{{ i18n.ts._calls.vcModerator }}</small>
									<small v-if="participant.speakerRequestedAt != null" :class="$style.speakingLabel"><i class="ti ti-hand-stop"></i> {{ i18n.ts._calls.requestSpeaker }}</small>
								</div>
							</TransitionGroup>
						</section>
					</aside>
				</div>
			</div>

			<footer :class="$style.footer">
				<MkButton v-if="room.state === 'ended'" rounded @click="closeWindow">{{ i18n.ts.close }}</MkButton>
				<template v-else-if="sessionIsCurrent">
					<MkButton v-if="session.needsAudioResume.value" rounded @click="session.resumeAudio()">{{ i18n.ts._calls.resumeAudio }}</MkButton>
					<MkCallsControls :state="session.controls.value" @mute="session.toggleMute()" @camera="toggleCamera" @screen="session.toggleVideo('screen')" @microphoneSettings="openDeviceMenu('microphone', $event)" @cameraSettings="openDeviceMenu('camera', $event)" @screenSettings="openScreenSettings($event)" @speakerRequest="session.controls.value.speakerRequested ? session.cancelSpeakerRequest() : session.requestSpeaker()" @leave="leaveCurrentRoom"/>
				</template>
				<template v-else-if="room.state === 'open'">
					<MkInfo v-if="!canJoinCalls" warn>{{ i18n.ts._calls.participationNotAllowed }}</MkInfo>
					<MkButton v-else primary large rounded :wait="session.joining.value" :class="$style.joinButton" @click="joinRoom(room.mode === 'open')"><i class="ti ti-headphones"></i> {{ session.joining.value ? i18n.ts._calls.roomConnectedMediaConnecting : i18n.ts._calls.joinRoom }}</MkButton>
				</template>
				<template v-else-if="room.state === 'scheduled'">
					<small v-if="room.scheduledAt != null">{{ new Date(room.scheduledAt).toLocaleString() }}</small>
					<MkButton v-if="isHost" primary large rounded :disabled="!canJoinCalls" @click="openRoom">{{ i18n.ts._calls.openRoom }}</MkButton>
				</template>
			</footer>
		</template>
	</section>
</Teleport>
</MkModal>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import CallsVideo from '@/components/MkCallsVideo.vue';
import MkModal from '@/components/MkModal.vue';
import MkCallsControls from '@/components/MkCallsControls.vue';
import MkCallsRoomSummary from '@/components/MkCallsRoomSummary.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import { createCallsRoomConnection } from '@/composables/use-calls-room.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { useCallsSession } from '@/utility/calls-session.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import MkA from '@/components/global/MkA.vue';
import { acct, userPage } from '@/filters/user.js';
import type { MenuItem } from '@/types/menu.js';

const props = defineProps<{
	roomId: string;
}>();
const emit = defineEmits<{ (ev: 'closed'): void; (ev: 'popout', popup: Window | null): void }>();
const dialog = shallowRef<InstanceType<typeof MkModal>>();
const focusedVideoId = shallowRef<string | null>(null);

const popoutTarget = shallowRef<HTMLElement | null>(null);
let popoutWindow: Window | null = null;

function cleanupPopout(): void {
	const popup = popoutWindow;
	popoutWindow = null;
	popup?.removeEventListener('pagehide', closeWindow);
	popup?.close();
	popoutTarget.value = null;
	emit('popout', null);
}

function closeWindow(): void {
	const wasPoppedOut = popoutTarget.value != null;
	dialog.value?.close();
	cleanupPopout();
	if (wasPoppedOut) emit('closed');
}

function onDialogClosed(): void {
	if (popoutTarget.value == null) emit('closed');
}

async function popout(): Promise<void> {
	const popup = window.open('', `misskey-calls-${props.roomId}`, 'popup,width=1100,height=780');
	if (popup == null) {
		await os.alert({ type: 'error', text: i18n.ts._calls.popoutBlocked });
		return;
	}
	popup.document.title = room.value?.title ?? i18n.ts._calls.title;
	popup.document.documentElement.style.cssText = window.document.documentElement.style.cssText;
	popup.document.documentElement.lang = window.document.documentElement.lang;
	const base = popup.document.createElement('base');
	base.href = window.location.href;
	popup.document.head.append(base);
	for (const node of window.document.querySelectorAll('style, link[rel="stylesheet"]')) {
		popup.document.head.append(node.cloneNode(true));
	}
	popoutWindow = popup;
	popoutTarget.value = popup.document.body;
	popup.addEventListener('pagehide', closeWindow);
	popup.addEventListener('keydown', event => { if (event.key === 'Escape') closeWindow(); });
	emit('popout', popup);
	await nextTick();
	popup.focus();
}

const videoGrid = shallowRef<HTMLElement | null>(null);
const stage = shallowRef<HTMLElement | null>(null);
const stageSize = shallowRef({ width: 0, height: 0 });

watch(stage, (element, _, onCleanup) => {
	if (element == null) return;
	const observer = new ResizeObserver(([entry]) => {
		stageSize.value = { width: entry.contentRect.width, height: entry.contentRect.height };
	});
	observer.observe(element);
	onCleanup(() => observer.disconnect());
}, { flush: 'post' });

async function focusVideo(id: string): Promise<void> {
	const tiles = Array.from(videoGrid.value?.children ?? []) as HTMLElement[];
	const positions = tiles.map(tile => tile.getBoundingClientRect());
	for (const tile of tiles) for (const animation of tile.getAnimations()) animation.cancel();
	focusedVideoId.value = focusedVideoId.value === id ? null : id;
	await nextTick();
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	for (const [index, tile] of tiles.entries()) {
		const before = positions[index];
		const after = tile.getBoundingClientRect();
		if (after.width === 0 || after.height === 0) continue;
		tile.animate([
			{ transformOrigin: 'top left', transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})` },
			{ transformOrigin: 'top left', transform: 'none' },
		], { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
	}
}

const session = useCallsSession();
const canJoinCalls = computed(() => $i?.policies.canJoinCalls !== false);
const isSessionRoom = computed(() => session.currentRoomId.value === props.roomId);
const pageConnection = shallowRef<ReturnType<typeof createCallsRoomConnection> | null>(isSessionRoom.value ? null : createCallsRoomConnection(props.roomId));
const room = computed(() => isSessionRoom.value ? session.room.value : pageConnection.value?.room.value ?? null);
const participants = computed(() => isSessionRoom.value ? session.participants.value : pageConnection.value?.participants.value ?? []);
const connected = computed(() => isSessionRoom.value ? session.connected.value : pageConnection.value?.connected.value ?? false);
const speakingParticipantIds = computed(() => isSessionRoom.value ? session.speakingParticipantIds.value : pageConnection.value?.speakingParticipantIds.value ?? new Set<string>());
const loadFailed = shallowRef(false);
let disposed = false;
const myParticipant = computed(() => participants.value.find(participant => participant.userId === $i?.id) ?? null);
const isHost = computed(() => myParticipant.value?.role === 'host');
const canModerateParticipants = computed(() => isHost.value || (myParticipant.value != null && room.value?.moderatorUserIds.includes(myParticipant.value.userId) === true));
const speakers = computed(() => participants.value.filter(participant => participant.role !== 'listener').sort((a, b) => Number(a.isMuted) - Number(b.isMuted)));
const listeners = computed(() => participants.value.filter(participant => participant.role === 'listener'));
const sessionIsCurrent = computed(() => isSessionRoom.value && session.isActive.value);
const roomVideos = computed(() => sessionIsCurrent.value ? session.videos.value : []);
const audioOnlySpeakers = computed(() => speakers.value.filter(participant => !roomVideos.value.some(video => video.participantId === participant.id)));
const videoGridStyle = computed(() => {
	const focused = focusedVideoId.value != null;
	const count = roomVideos.value.length + audioOnlySpeakers.value.length - (focused ? 1 : 0);
	const { width, height } = stageSize.value;
	let columns = 1;
	let bestSize = 0;
	for (let candidate = 1; candidate <= count; candidate++) {
		const rows = Math.ceil(count / candidate);
		const rowHeight = focused ? (height - 12 * rows) / (3 + rows) : (height - 12 * (rows - 1)) / rows;
		const size = Math.min((width - 12 * (candidate - 1)) / candidate * 9 / 16, rowHeight);
		if (size > bestSize) {
			columns = candidate;
			bestSize = size;
		}
	}
	const rows = Math.ceil(count / columns);
	return {
		gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
		gridTemplateRows: focused ? count > 0 ? `minmax(0, 3fr) repeat(${rows}, minmax(0, 1fr))` : 'minmax(0, 1fr)' : `repeat(${Math.max(1, rows)}, minmax(0, 1fr))`,
	};
});
const failureText = computed(() => session.mediaFailure.value === 'unsupported' ? i18n.ts._calls.unsupportedBrowser : session.mediaFailure.value === 'permission-denied' ? i18n.ts._calls.permissionDenied : session.mediaFailure.value === 'device-not-found' ? i18n.ts._calls.deviceNotFound : session.mediaFailure.value === 'permission-pending' ? i18n.ts._calls.permissionPending : i18n.ts._calls.mediaFailed);

const hasRoomMenu = computed(() => isHost.value && (room.value?.state === 'scheduled' || room.value?.state === 'open'));

watch(() => room.value?.title, title => {
	if (popoutWindow != null) popoutWindow.document.title = title ?? i18n.ts._calls.title;
});

async function copyRoomLink(): Promise<void> {
	if (popoutWindow != null) window.focus();
	try {
		await copyToClipboard(`${url}/calls/${props.roomId}`);
	} catch {
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

function openScreenSettings(event: MouseEvent): void {
	if (popoutWindow != null) window.focus();
	session.openScreenSettings(event);
}

function openDeviceMenu(kind: 'microphone' | 'camera', event: MouseEvent): void {
	if (popoutWindow != null) window.focus();
	session.openDeviceMenu(kind, event);
}

function toggleCamera(): void {
	if (popoutWindow != null) window.focus();
	void session.toggleVideo('camera');
}

function openRoomMenu(event: MouseEvent): void {
	if (popoutWindow != null) window.focus();
	if (session.joining.value || !hasRoomMenu.value) return;
	os.popupMenu([
		{ text: i18n.ts._calls.changeTitle, icon: 'ti ti-pencil', action: changeTitle },
		...(room.value?.state === 'scheduled' ? [
			{ text: i18n.ts._calls.cancelRoom, icon: 'ti ti-x', danger: true, action: cancelRoom },
		] : !sessionIsCurrent.value && session.replacedRoomId.value !== props.roomId ? [
			{ text: i18n.ts._calls.endRoom, icon: 'ti ti-phone-off', danger: true, async action() {
				if (!(await os.confirm({ type: 'warning', text: i18n.ts._calls.endRoom })).canceled) await endRoom();
			} },
		] : []),
	], event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined);
}

async function changeTitle(): Promise<void> {
	if (!hasRoomMenu.value || room.value == null) return;
	const { canceled, result } = await os.inputText({
		title: i18n.ts._calls.changeTitle,
		default: room.value.title,
		minLength: 1,
		maxLength: 256,
	});
	if (canceled || !hasRoomMenu.value || room.value == null) return;
	const title = result.trim();
	if (title.length === 0 || title === room.value.title) return;
	try {
		await misskeyApi('calls/rooms/update-title', { roomId: props.roomId, title, expectedRevision: room.value.revision });
		await refreshRoom();
	} catch (error) {
		console.error('[Calls] Title change failed', error);
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function openParticipantMenu(participant: (typeof participants.value)[number] | undefined, event: PointerEvent): Promise<void> {
	if (popoutWindow != null) window.focus();
	if (!canModerateParticipants.value || room.value == null || participant == null || participant.role === 'host' || participant.userId === $i?.id) return;
	const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
	let publications: Misskey.entities.CallsMediaReconcileResponse['publications'];
	try {
		({ publications } = await misskeyApi('calls/media/reconcile', { roomId: props.roomId }));
	} catch (error) {
		console.error('[Calls] Participant menu failed', error);
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
		return;
	}
	if (disposed || !canModerateParticipants.value || room.value == null) return;
	const items: MenuItem[] = [
		...(isHost.value && room.value.mode === 'stage' ? [
			{ text: participant.role === 'listener' ? participant.speakerRequestedAt != null ? i18n.ts.approve : i18n.ts._calls.promoteSpeaker : i18n.ts._calls.demoteListener, icon: 'ti ti-microphone', action: () => setRole(participant.id, participant.role === 'listener' ? 'speaker' : 'listener') },
			...(participant.speakerRequestedAt != null ? [{ text: i18n.ts.reject, icon: 'ti ti-x', action: () => setRole(participant.id, 'listener') }] : []),
		] : []),
		...(isHost.value ? [{ text: i18n.ts._calls.transferHost, icon: 'ti ti-crown', action: () => transferHost(participant.id) }] : []),
		...(isHost.value ? [{ text: room.value.moderatorUserIds.includes(participant.userId) ? i18n.ts._calls.removeVcModerator : i18n.ts._calls.assignVcModerator, icon: 'ti ti-shield', action: () => setModerator(participant.id, !room.value!.moderatorUserIds.includes(participant.userId)) }] : []),
		...(participant.role === 'speaker' && !participant.isMuted ? [{ text: i18n.ts._calls.mute, icon: 'ti ti-microphone-off', action: () => muteParticipant(participant.id) }] : []),
		...(publications.some(publication => publication.participantId === participant.id && publication.mediaSource === 'camera') ? [{ text: i18n.ts._calls.stopCamera, icon: 'ti ti-camera-off', action: () => stopParticipantVideo(participant.id, 'camera') }] : []),
		...(publications.some(publication => publication.participantId === participant.id && publication.mediaSource === 'screen') ? [{ text: i18n.ts._calls.stopScreenSharing, icon: 'ti ti-screen-share-off', action: () => stopParticipantVideo(participant.id, 'screen') }] : []),
		{ text: i18n.ts._calls.removeParticipant, icon: 'ti ti-user-x', danger: true, action: () => removeParticipant(participant.id) },
	];
	if (event.type === 'contextmenu') {
		os.contextMenu(items, event);
	} else {
		os.popupMenu(items, target);
	}
}

async function showScreenWindow(stream: MediaStream, participantId: string): Promise<void> {
	try {
		await session.showScreenWindow(stream, videoLabel(participantId));
		if (session.screenWindows.has(stream)) closeWindow();
	} catch (error) {
		console.error('[Calls] Room operation failed', error);
		if (popoutWindow != null) window.focus();
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

function videoLabel(participantId: string): string {
	const participant = participants.value.find(item => item.id === participantId);
	const user = participant == null ? null : participantUser(participant.userId);
	return user?.name || user?.username || participant?.userId || '';
}

async function openRoom(): Promise<void> { if (room.value != null) { await misskeyApi('calls/rooms/open', { roomId: props.roomId, expectedRevision: room.value.revision }); await refreshRoom(); await joinRoom(true); } }

async function cancelRoom(): Promise<void> { if (room.value != null) { await misskeyApi('calls/rooms/cancel', { roomId: props.roomId, expectedRevision: room.value.revision }); await refreshRoom(); } }

async function endRoom(): Promise<void> { if (room.value != null) { await misskeyApi('calls/rooms/end', { roomId: props.roomId, expectedRevision: room.value.revision }); await refreshRoom(); } }

async function joinRoom(startMuted = false, requestConfirmation = false): Promise<void> {
	if (!canJoinCalls.value) return;
	if (session.currentRoomId.value != null && session.currentRoomId.value !== props.roomId) {
		const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._calls.switchRoomConfirm });
		if (canceled) return;
	} else if (requestConfirmation) {
		const { canceled } = await os.confirm({ type: 'question', title: room.value?.title, text: i18n.ts._calls.joinRoomConfirm });
		if (canceled) return;
	}
	if (disposed || !canJoinCalls.value || room.value?.state !== 'open' || sessionIsCurrent.value || session.joining.value) return;

	try {
		await session.join(props.roomId, myParticipant.value != null, undefined, startMuted);
		if (!sessionIsCurrent.value) return;
		await refreshRoom();
		os.toast(i18n.ts._calls.joinedCall);
	} catch (error) {
		console.error('[Calls] Room operation failed', error);
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function leaveCurrentRoom(): Promise<void> {
	if (popoutWindow != null) window.focus();
	const endingRoom = isHost.value;
	const { canceled } = await os.confirm({ type: 'warning', text: endingRoom ? i18n.ts._calls.endRoom : i18n.ts._calls.leaveRoom });
	if (canceled) return;
	try {
		await session.leave();
		os.toast(i18n.ts._calls.leftCall);
		if (!endingRoom) closeWindow();
	} catch (error) {
		console.error('[Calls] Room operation failed', error);
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function setRole(participantId: string, role: 'speaker' | 'listener'): Promise<void> {
	if (room.value == null) return;
	await misskeyApi('calls/rooms/set-role', { roomId: props.roomId, participantId, role, expectedRevision: room.value.revision });
	await refreshRoom();
}

async function transferHost(participantId: string): Promise<void> {
	if (!isHost.value || room.value == null) return;
	const { canceled } = await os.confirm({ type: 'warning', title: videoLabel(participantId), text: i18n.ts._calls.transferHostConfirm });
	if (canceled || !isHost.value || room.value == null) return;
	const params = { roomId: props.roomId, participantId, expectedRevision: room.value.revision };
	try {
		try {
			await misskeyApi('calls/rooms/transfer-host', params);
		} catch (error) {
			await refreshRoom();
			if (participants.value.find(item => item.id === participantId)?.role !== 'host') throw error;
			await misskeyApi('calls/rooms/transfer-host', params);
		}
		await refreshRoom();
	} catch (error) {
		console.error('[Calls] Host transfer failed', error);
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function setModerator(participantId: string, isModerator: boolean): Promise<void> {
	if (room.value == null) return;
	try {
		await misskeyApi('calls/rooms/set-moderator', { roomId: props.roomId, participantId, isModerator, expectedRevision: room.value.revision });
		await refreshRoom();
	} catch (error) {
		console.error('[Calls] Moderator change failed', error);
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function muteParticipant(participantId: string): Promise<void> {
	if (room.value == null) return;
	const { canceled } = await os.confirm({ type: 'warning', title: videoLabel(participantId), text: i18n.ts._calls.muteParticipantConfirm });
	if (canceled || room.value == null) return;
	try {
		await misskeyApi('calls/rooms/mute-participant', { roomId: props.roomId, participantId, expectedRevision: room.value.revision });
		await refreshRoom();
	} catch (error) {
		console.error('[Calls] Participant mute failed', error);
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function stopParticipantVideo(participantId: string, mediaSource: 'camera' | 'screen'): Promise<void> {
	if (room.value == null) return;
	const { canceled } = await os.confirm({ type: 'warning', title: videoLabel(participantId), text: mediaSource === 'camera' ? i18n.ts._calls.stopParticipantCameraConfirm : i18n.ts._calls.stopParticipantScreenSharingConfirm });
	if (canceled || room.value == null) return;
	try {
		await misskeyApi('calls/rooms/stop-participant-video', { roomId: props.roomId, participantId, mediaSource, expectedRevision: room.value.revision });
		await refreshRoom();
	} catch (error) {
		console.error('[Calls] Participant video stop failed', error);
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function removeParticipant(participantId: string): Promise<void> {
	if (room.value == null) return;
	const { canceled } = await os.confirm({ type: 'warning', title: videoLabel(participantId), text: i18n.ts._calls.removeParticipantConfirm });
	if (canceled || room.value == null) return;
	try {
		await misskeyApi('calls/rooms/remove-participant', { roomId: props.roomId, participantId, expectedRevision: room.value.revision });
		await refreshRoom();
	} catch (error) {
		console.error('[Calls] Participant kick failed', error);
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function refreshRoom(): Promise<void> {
	if (isSessionRoom.value) await session.refresh();
	else await pageConnection.value?.refresh();
}

function participantUser(userId: string): Misskey.entities.UserLite | null { return participants.value.find(participant => participant.userId === userId)?.user ?? null; }

watch(isSessionRoom, active => {
	if (active) {
		pageConnection.value?.dispose();
		pageConnection.value = null;
	} else if (pageConnection.value == null) {
		pageConnection.value = createCallsRoomConnection(props.roomId);
		void pageConnection.value.refresh().catch(error => {
			console.error('[Calls] Room loading failed', error);
			loadFailed.value = true;
		});
	}
}, { immediate: true });
watch(() => room.value?.state, state => {
	if (state === 'cancelled') closeWindow();
});
onMounted(() => {
	window.addEventListener('pagehide', cleanupPopout);
	void refreshRoom().then(() => {
		if (room.value?.state === 'open' && myParticipant.value != null && myParticipant.value.role !== 'listener') void session.prepareMicrophones();
		if (!disposed && room.value?.state === 'open' && !sessionIsCurrent.value && !session.joining.value) void joinRoom(isHost.value || room.value.mode === 'open', true);
	}).catch(error => {
		console.error('[Calls] Room loading failed', error);
		loadFailed.value = true;
	});
});
onUnmounted(() => {
	disposed = true;
	window.removeEventListener('pagehide', cleanupPopout);
	pageConnection.value?.dispose();
	cleanupPopout();
});

watch(roomVideos, videos => { if (!videos.some(video => video.id === focusedVideoId.value)) focusedVideoId.value = null; });
</script>

<style lang="scss" module>
.space { display: flex; flex-direction: column; width: 100vw; height: 100dvh; overflow: hidden; border-radius: 0; }
.header { display: flex; align-items: center; gap: 8px; flex-shrink: 0; padding: 12px 20px; border-bottom: 1px solid var(--MI_THEME-divider); }
.heading { flex: 1; min-width: 0; }
.title { margin: 0; font-size: 1.2rem; line-height: 1.4; overflow-wrap: anywhere; }
.elapsedTime { font-variant-numeric: tabular-nums; color: var(--MI_THEME-fgTransparentWeak); }
.menuButton { width: 36px; height: 36px; border-radius: 50%; font-size: 20px; }
.body { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: 16px; padding: 16px; background: var(--MI_THEME-bg); }
.endedBody { overflow: auto; }
.summary { width: min(100%, 560px); box-sizing: border-box; margin: auto; padding: 24px; border-radius: var(--MI-radius); background: var(--MI_THEME-panel); }
.summaryTitle { display: flex; align-items: center; gap: 8px; margin: 0 0 24px; font-size: 1.1rem; }
.callLayout { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 16px; flex: 1; min-height: 0; }
.stage { grid-column: 2; grid-row: 1; min-width: 0; min-height: 0; overflow: auto; }
.participantArea { grid-column: 1; grid-row: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 24px; padding: 16px; border-radius: var(--MI-radius); background: var(--MI_THEME-panel); }
.groupLabel { margin-bottom: 12px; font-size: 0.85rem; font-weight: 600; opacity: 0.65; }
.people { display: flex; flex-direction: column; gap: 12px; }
.person { position: relative; display: grid; min-width: 0; grid-template-columns: 40px minmax(0, 1fr); align-items: center; column-gap: 8px; row-gap: 2px; }
.personLink { position: absolute; inset: 0; z-index: 1; border-radius: var(--MI-radius); }
.person > .avatarWrap, .person > .listenerAvatar { grid-row: span 2; }
.avatarWrap { position: relative; padding: 2px; border: 2px solid transparent; border-radius: 50%; transition: border-color 0.2s ease; }
.speaking { border-color: var(--MI_THEME-accent); }
.avatar { display: block; width: 32px; height: 32px; border-radius: 50%; }
.listenerAvatar { display: block; width: 36px; height: 36px; border-radius: 50%; margin: 2px; }
.avatarPlaceholder { display: grid; place-items: center; background: var(--MI_THEME-buttonBg); font-size: 24px; }
.microphoneBadge { position: absolute; right: -2px; bottom: -2px; display: grid; place-items: center; width: 16px; height: 16px; border: 2px solid var(--MI_THEME-panel); border-radius: 50%; background: var(--MI_THEME-buttonBg); font-size: 10px; }
.personName { display: flex; align-items: center; justify-content: space-between; width: 100%; min-width: 0; gap: 4px; }
.personName > strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; }
.personMenu { position: relative; z-index: 2; flex: 0 0 28px; height: 28px; border-radius: 50%; }
.person > small { grid-column: 2; font-size: 0.75rem; color: var(--MI_THEME-fgTransparentWeak); }
.person > .speakingLabel { color: var(--MI_THEME-accent); }
.personVolume { position: relative; z-index: 2; grid-column: 1 / -1; display: flex; flex-direction: column; gap: 4px; width: 100%; margin-top: 4px; font-size: 0.75rem; }
.personVolume > input { width: 100%; min-width: 0; margin: 0; accent-color: var(--MI_THEME-accent); }
.personMove { transition: transform 0.2s ease; }
.videoGrid { display: grid; gap: 12px; height: 100%; min-height: 0; }
.focusedVideo { grid-column: 1 / -1; order: -1; }
.voiceTile { position: relative; display: grid; place-items: center; min-width: 0; min-height: 0; overflow: hidden; border: 2px solid transparent; border-radius: var(--MI-radius); background: var(--MI_THEME-panel); }
.voiceTile.speaking { border-color: var(--MI_THEME-accent); }
.stageAvatar { width: 80px; height: 80px; }
.stageAvatarPlaceholder { font-size: 48px; }
.tileName { position: absolute; left: 12px; bottom: 12px; display: flex; align-items: center; gap: 6px; max-width: calc(100% - 24px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; }
.footer { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: auto; padding: 20px 20px max(20px, env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--MI_THEME-divider); background: var(--MI_THEME-panel); border-radius: 0 0 var(--MI-radius) var(--MI-radius); z-index: 1; }
.joinButton { width: min(100%, 360px); }
.notFound { display: grid; justify-items: center; gap: 12px; padding: 40px; text-align: center; }
@media (max-width: 800px) {
	.header { padding: 12px; }
	.body { padding: 12px; }
	.callLayout { grid-template-columns: 120px minmax(0, 1fr); gap: 8px; }
	.participantArea { padding: 8px; }
	.person { grid-template-columns: minmax(0, 1fr); justify-items: start; }
	.person > .avatarWrap, .person > .listenerAvatar { grid-row: auto; }
	.person > small { grid-column: 1; }
	.footer { padding-left: 12px; padding-right: 12px; }
}
@media (prefers-reduced-motion: reduce) {
	.avatarWrap, .personMove { transition: none; }
}
</style>
