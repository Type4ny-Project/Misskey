<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Teleport to="body">
	<Transition
		appear
		:enterActiveClass="$style.dockEnterActive"
		:enterFromClass="$style.dockEnterFrom"
		:leaveActiveClass="$style.dockLeaveActive"
		:leaveToClass="$style.dockLeaveTo"
	>
		<div v-if="session.isActive.value && room != null && callsWindowRoomId !== session.currentRoomId.value" ref="rootEl" :class="$style.root">
			<Transition
				:enterActiveClass="$style.panelEnterActive"
				:enterFromClass="$style.panelEnterFrom"
				:leaveActiveClass="$style.panelLeaveActive"
				:leaveToClass="$style.panelLeaveTo"
			>
				<div v-if="expanded" id="calls-dock-panel" class="_panel" :class="$style.panel">
					<header :class="$style.panelHeader">
						<div>
							<strong :class="$style.panelTitle">{{ room.title }}</strong>
							<div :class="$style.panelMeta"><span>{{ participants.length }} {{ i18n.ts.users }}</span></div>
						</div>
						<button type="button" class="_button" :class="$style.circleButton" :aria-label="i18n.ts.close" @click="expanded = false"><i class="ti ti-chevron-down"></i></button>
					</header>

					<MkCallsControls :state="session.controls.value" @mute="session.toggleMute()" @camera="session.toggleVideo('camera')" @screen="session.toggleVideo('screen')" @microphoneSettings="session.openDeviceMenu('microphone', $event)" @cameraSettings="session.openDeviceMenu('camera', $event)" @screenSettings="session.openScreenSettings($event)" @speakerRequest="session.controls.value.speakerRequested ? session.cancelSpeakerRequest() : session.requestSpeaker()" @leave="leaveRoom">
						<button type="button" class="_button" :class="$style.detailsButton" :aria-label="i18n.ts.details" :title="i18n.ts.details" @click="openRoom"><i class="ti ti-layout-dashboard"></i></button>
					</MkCallsControls>

					<section v-if="room?.mode === 'stage' && session.isHost.value && pendingRequests.length > 0" :class="$style.section">
						<strong :class="$style.sectionLabel">{{ i18n.ts._calls.requestSpeaker }}</strong>
						<div :class="$style.userList">
							<div v-for="participant in pendingRequests" :key="participant.id" :class="$style.userRow">
								<MkA v-if="participantUser(participant.userId) != null" :to="userPage(participantUser(participant.userId)!)" :aria-label="acct(participantUser(participant.userId)!)" :class="$style.userLink"/>
								<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="$style.userAvatar"/>
								<div :class="$style.userBody"><strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong></div>
								<button type="button" class="_button" :class="$style.inlineAction" @click="setRole(participant.id, 'speaker')">{{ i18n.ts.approve }}</button>
								<button type="button" class="_button" :class="$style.inlineAction" @click="setRole(participant.id, 'listener')">{{ i18n.ts.reject }}</button>
							</div>
						</div>
					</section>

					<section v-if="speakers.length > 0" :class="$style.section">
						<strong :class="$style.sectionLabel">{{ room?.mode === 'open' ? i18n.ts.users : i18n.ts._calls.speaker }}</strong>
						<div :class="$style.userList">
							<div v-for="participant in speakers" :key="participant.id" :class="$style.userRow">
								<MkA v-if="participantUser(participant.userId) != null" :to="userPage(participantUser(participant.userId)!)" :aria-label="acct(participantUser(participant.userId)!)" :class="$style.userLink"/>
								<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="[$style.userAvatar, session.speakingParticipantIds.value.has(participant.id) && $style.userAvatarLive]"/>
								<div v-else :class="$style.avatarPlaceholder"><i class="ti ti-user"></i></div>
								<div :class="$style.userBody">
									<strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong>
									<small>{{ participant.role === 'host' ? i18n.ts._calls.host : participant.isMuted ? i18n.ts._calls.mutedStatus : session.speakingParticipantIds.value.has(participant.id) ? i18n.ts._calls.speakingNow : i18n.ts._calls.microphoneOn }}</small>
								</div>
								<button v-if="room?.mode === 'stage' && session.isHost.value && participant.role !== 'host'" type="button" class="_button" :class="$style.inlineAction" :aria-label="i18n.ts._calls.demoteListener" :title="i18n.ts._calls.demoteListener" @click="setRole(participant.id, 'listener')"><i class="ti ti-microphone-off"></i></button>
							</div>
						</div>
					</section>

					<section v-if="listeners.length > 0" :class="$style.section">
						<strong :class="$style.sectionLabel">{{ i18n.ts._calls.listener }}</strong>
						<div :class="$style.userList">
							<div v-for="participant in listeners" :key="participant.id" :class="$style.userRow">
								<MkA v-if="participantUser(participant.userId) != null" :to="userPage(participantUser(participant.userId)!)" :aria-label="acct(participantUser(participant.userId)!)" :class="$style.userLink"/>
								<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="$style.userAvatar"/>
								<div v-else :class="$style.avatarPlaceholder"><i class="ti ti-user"></i></div>
								<div :class="$style.userBody">
									<strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong>
									<small><i class="ti ti-headphones"></i> {{ i18n.ts.online }}</small>
								</div>
							</div>
						</div>
					</section>
				</div>
			</Transition>

			<div :class="$style.summaryRow">
				<button type="button" class="_button _panel" :class="[$style.main, expanded && $style.mainExpanded]" :aria-expanded="expanded" aria-controls="calls-dock-panel" @click="expanded = !expanded">
					<div :class="[$style.avatarRing, $style.avatarRingActive, isLiveSpeaking && $style.avatarRingLive]">
						<MkAvatar v-if="hostUser != null" :user="hostUser" :class="$style.avatar"/>
						<i v-else class="ti ti-phone"></i>
					</div>
					<div :class="$style.body">
						<div :class="$style.titleRow"><strong>{{ room.title }}</strong></div>
						<small>{{ participants.length }} {{ i18n.ts.users }} · {{ i18n.tsx._calls.peopleSpeaking({ count: speakingCount }) }}</small>
					</div>
					<i class="ti ti-chevron-up" :class="[$style.expandIcon, expanded && $style.expandIconExpanded]"></i>
				</button>
				<div :class="$style.actions">
					<button v-if="session.isSpeaker.value" type="button" class="_button _panel" :class="[$style.action, session.muted.value && $style.actionMuted]" :aria-label="session.muted.value ? i18n.ts._calls.unmute : i18n.ts._calls.mute" :disabled="session.joining.value" @click="session.toggleMute()"><i :class="session.muted.value ? 'ti ti-microphone-off' : 'ti ti-microphone'"></i></button>
					<button type="button" class="_button _panel" :class="[$style.action, $style.actionDanger]" :aria-label="session.isHost.value ? i18n.ts._calls.endRoom : i18n.ts._calls.leaveRoom" :disabled="session.joining.value" @click="leaveRoom"><i class="ti ti-door-exit"></i></button>
				</div>
			</div>
		</div>
		<div v-else-if="!session.isActive.value && !session.joining.value && session.reconnectCandidate.value != null" ref="rootEl" :class="$style.root">
			<div :class="$style.summaryRow">
				<button type="button" class="_button _panel" :class="[$style.main, $style.resumeMain]" :disabled="session.joining.value || session.reconnectRoomState.value !== 'open'" @click="resumeRecentRoom">
					<div :class="[$style.avatarRing, $style.avatarRingActive]"><i class="ti ti-phone-call"></i></div>
					<div :class="$style.body">
						<div :class="$style.titleRow"><span :class="$style.live">{{ i18n.ts._calls.resumePreviousCall }}</span><strong>{{ session.reconnectCandidate.value.title }}</strong></div>
						<small v-if="session.reconnectRoomState.value === 'checking'">{{ i18n.ts._calls.reconnectingShort }}</small>
						<small v-else>{{ i18n.tsx._calls.resumePreviousCallExpiresIn({ seconds: session.reconnectSecondsRemaining.value }) }}</small>
					</div>
				</button>
				<button type="button" class="_button _panel" :class="$style.action" :aria-label="i18n.ts.close" @click="session.dismissReconnectCandidate()"><i class="ti ti-x"></i></button>
			</div>
		</div>
	</Transition>
</Teleport>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import MkCallsControls from '@/components/MkCallsControls.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { callsWindowRoomId, openCallsRoom } from '@/utility/calls-window.js';
import { useCallsSession } from '@/utility/calls-session.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkA from '@/components/global/MkA.vue';
import { acct, userPage } from '@/filters/user.js';

const session = useCallsSession();
const expanded = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const room = computed(() => session.room.value);
const participants = computed(() => session.participants.value);
const speakers = computed(() => participants.value.filter(participant => participant.role !== 'listener'));
const listeners = computed(() => participants.value.filter(participant => participant.role === 'listener'));
const pendingRequests = computed(() => listeners.value.filter(participant => participant.speakerRequestedAt != null));
const hostParticipant = computed(() => participants.value.find(participant => participant.role === 'host') ?? null);
const hostUser = computed(() => hostParticipant.value == null ? null : participantUser(hostParticipant.value.userId));
const isLiveSpeaking = computed(() => session.myParticipant.value != null && session.speakingParticipantIds.value.has(session.myParticipant.value.id));
const speakingCount = computed(() => session.speakingParticipantIds.value.size);

watch(rootEl, (element, _, onCleanup) => {
	if (element == null) return;
	const updateHeight = () => {
		window.document.body.style.setProperty('--MI-callsDockSpacing', `calc(${element.offsetHeight}px + var(--MI-margin))`);
	};
	const observer = new ResizeObserver(updateHeight);
	observer.observe(element);
	updateHeight();
	onCleanup(() => {
		observer.disconnect();
		window.document.body.style.removeProperty('--MI-callsDockSpacing');
	});
}, { flush: 'post' });

function participantUser(userId: string): Misskey.entities.UserLite | null {
	return session.usersById.value.get(userId) ?? null;
}

function openRoom(): void {
	if (session.currentRoomId.value == null) return;
	expanded.value = false;
	void openCallsRoom(session.currentRoomId.value);
}

async function leaveRoom(): Promise<void> {
	const { canceled } = await os.confirm({ type: 'warning', text: session.isHost.value ? i18n.ts._calls.endRoom : i18n.ts._calls.leaveRoom });
	if (canceled) return;
	expanded.value = false;
	try {
		await session.leave();
		os.toast(i18n.ts._calls.leftCall);
	} catch (error) {
		console.error('[Calls] Dock operation failed', error);
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function resumeRecentRoom(): Promise<void> {
	try {
		await session.resumeRecentRoom();
		if (!session.isActive.value) return;
		os.toast(i18n.ts._calls.joinedCall);
		openRoom();
	} catch (error) {
		console.error('[Calls] Dock operation failed', error);
		session.dismissReconnectCandidate();
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function setRole(participantId: string, role: 'speaker' | 'listener'): Promise<void> {
	if (room.value == null || session.currentRoomId.value == null) return;
	await misskeyApi('calls/rooms/set-role', { roomId: session.currentRoomId.value, participantId, role, expectedRevision: room.value.revision });
	await session.refresh();
}

function onWindowPointerDown(event: PointerEvent): void {
	if (!expanded.value || !(event.target instanceof Node) || rootEl.value?.contains(event.target)) return;
	expanded.value = false;
}

onMounted(() => window.addEventListener('pointerdown', onWindowPointerDown));
onBeforeUnmount(() => window.removeEventListener('pointerdown', onWindowPointerDown));
</script>

<style lang="scss" module>
.root { position: fixed; right: 16px; bottom: calc(var(--MI-minBottomSpacing) + var(--MI-margin)); z-index: 1200; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; max-width: min(420px, calc(100vw - 32px)); }
.panel { display: flex; width: min(420px, calc(100vw - 32px)); max-height: min(70vh, 560px); flex-direction: column; gap: 14px; overflow: hidden auto; padding: 14px; border-radius: 24px; background: color(from var(--MI_THEME-panel) srgb r g b / 0.94); box-shadow: 0 16px 40px color(from var(--MI_THEME-bg) srgb r g b / 0.28); backdrop-filter: blur(18px); }
.panelHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.panelTitle { display: block; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.panelMeta { display: flex; gap: 8px; margin-top: 4px; font-size: 0.78rem; opacity: 0.72; }
.panelMeta > :first-child, .live { color: var(--MI_THEME-accent); font-weight: 800; letter-spacing: 0.08em; }
.circleButton { width: 32px; height: 32px; border-radius: 999px; }
.detailsButton { width: 40px; height: 48px; border-radius: 14px; font-size: 20px; }
.section { display: flex; flex-direction: column; gap: 8px; }
.sectionLabel { font-size: 0.78rem; letter-spacing: 0.04em; opacity: 0.72; text-transform: uppercase; }
.userList { display: flex; flex-direction: column; gap: 6px; }
.userRow { position: relative; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 16px; background: color(from var(--MI_THEME-bg) srgb r g b / 0.28); }
.userLink { position: absolute; inset: 0; z-index: 1; border-radius: inherit; }
.userAvatar, .avatarPlaceholder { width: 36px; height: 36px; flex: 0 0 36px; border-radius: 50%; }
.avatarPlaceholder { display: grid; place-items: center; background: var(--MI_THEME-bg); }
.userAvatarLive { box-shadow: 0 0 0 3px var(--MI_THEME-accent), 0 0 16px color-mix(in srgb, var(--MI_THEME-accent) 38%, transparent); animation: avatarPulse 1.35s ease-in-out infinite alternate; }
.userBody { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
.userBody small { opacity: 0.68; }
.inlineAction { position: relative; z-index: 2; flex: 0 0 auto; padding: 6px 10px; border-radius: 999px; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); font-size: 0.78rem; font-weight: 700; }
.summaryRow { display: flex; align-items: stretch; gap: 8px; }
.main { display: flex; min-width: min(310px, calc(100vw - 120px)); align-items: center; gap: 11px; padding: 9px 12px; border-radius: 22px; text-align: left; box-shadow: 0 12px 30px color(from var(--MI_THEME-bg) srgb r g b / 0.24); }
.resumeMain { min-width: min(350px, calc(100vw - 92px)); }
.resumeMain:disabled { cursor: wait; opacity: 0.72; }
.avatarRing { position: relative; z-index: 0; display: grid; width: 42px; height: 42px; flex: 0 0 42px; place-items: center; border-radius: 50%; isolation: isolate; }
.avatarRingActive::before, .avatarRingActive::after { position: absolute; z-index: -1; inset: -4px; border: 2px solid var(--MI_THEME-accent); border-radius: 44% 56% 48% 52% / 52% 43% 57% 48%; content: ''; opacity: 0.62; pointer-events: none; transition: opacity 0.4s ease, scale 0.4s ease; }
.avatarRingActive::before { animation: organicRing 3.2s ease-in-out infinite; }
.avatarRingActive::after { inset: -7px; border-color: color-mix(in srgb, var(--MI_THEME-accent) 42%, transparent); opacity: 0; scale: 0.88; }
.avatarRingLive::before { opacity: 1; }
.avatarRingLive::after { opacity: 0.72; scale: 1; animation: organicRing 1.25s -0.72s ease-in-out infinite reverse; }
.avatar { width: 38px; height: 38px; }
.body { min-width: 0; flex: 1; }
.titleRow { display: flex; align-items: center; gap: 7px; }
.titleRow strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.body small { display: block; overflow: hidden; margin-top: 3px; opacity: 0.66; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; gap: 8px; }
.action { display: grid; width: 52px; place-items: center; border-radius: 20px; font-size: 1.15rem; }
.actionMuted { color: var(--MI_THEME-warn); }
.actionDanger { color: var(--MI_THEME-error); }
.expandIcon { transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1); }
.expandIconExpanded { transform: rotate(180deg); }
.main, .action, .circleButton, .inlineAction, .userRow { transition: color 0.18s ease, background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.22s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
.mainExpanded { box-shadow: 0 8px 22px color(from var(--MI_THEME-bg) srgb r g b / 0.2); transform: translateY(1px); }
.main:active, .action:active, .circleButton:active, .inlineAction:active { transform: scale(0.96); }
.dockEnterActive { transform-origin: bottom right; transition: opacity 0.22s ease-out, transform 0.34s cubic-bezier(0.22, 1, 0.36, 1); }
.dockLeaveActive { transform-origin: bottom right; transition: opacity 0.16s ease-in, transform 0.2s ease-in; }
.dockEnterFrom, .dockLeaveTo { opacity: 0; transform: translate3d(0, 12px, 0) scale(0.94); }
.panelEnterActive { transform-origin: bottom right; will-change: opacity, transform, filter; transition: opacity 0.22s ease-out, transform 0.38s cubic-bezier(0.16, 1, 0.3, 1), filter 0.28s ease-out; }
.panelLeaveActive { transform-origin: bottom right; will-change: opacity, transform, filter; transition: opacity 0.14s ease-in, transform 0.22s ease-in, filter 0.18s ease-in; }
.panelEnterFrom { opacity: 0; filter: blur(7px); transform: translate3d(18px, 18px, 0) scale(0.88); }
.panelLeaveTo { opacity: 0; filter: blur(4px); transform: translate3d(12px, 14px, 0) scale(0.94); }
.panelEnterActive > * { animation: panelContentIn 0.3s 0.07s cubic-bezier(0.22, 1, 0.36, 1) both; }
.panelEnterActive > :nth-child(2) { animation-delay: 0.11s; }
.panelEnterActive > :nth-child(n + 3) { animation-delay: 0.15s; }

@media (hover: hover) {
	.main:hover, .action:hover, .circleButton:hover, .inlineAction:hover { transform: translateY(-1px); }
	.userRow:hover { background: color(from var(--MI_THEME-bg) srgb r g b / 0.4); }
}

@keyframes organicRing {
	0%, 100% { transform: scale(0.96) rotate(0deg); border-radius: 44% 56% 48% 52% / 52% 43% 57% 48%; }
	35% { transform: scale(1.06) rotate(7deg); border-radius: 58% 42% 55% 45% / 42% 57% 43% 58%; }
	68% { transform: scale(1.01) rotate(-5deg); border-radius: 49% 51% 39% 61% / 60% 44% 56% 40%; }
}

@keyframes avatarPulse {
	from { transform: scale(0.96); }
	to { transform: scale(1.03); }
}

@keyframes panelContentIn {
	from { opacity: 0; transform: translateY(8px); }
	to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
	.userAvatarLive, .avatarRingActive::before, .avatarRingActive::after { animation: none; }
	.dockEnterActive, .dockLeaveActive, .panelEnterActive, .panelLeaveActive, .expandIcon, .main, .action, .circleButton, .inlineAction, .userRow { transition-duration: 0.01ms; }
	.panelEnterActive > * { animation: none; }
	.main, .mainExpanded, .main:hover, .main:active, .action:hover, .action:active, .circleButton:hover, .circleButton:active, .inlineAction:hover, .inlineAction:active, .expandIconExpanded { transform: none; }
}

@media (max-width: 500px) {
	.root { right: 12px; max-width: calc(100vw - 24px); }
	.panel { width: calc(100vw - 24px); max-height: min(60vh, 480px); }
	.main { min-width: calc(100vw - 144px); }
}
</style>
