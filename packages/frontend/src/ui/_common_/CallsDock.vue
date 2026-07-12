<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Teleport to="body">
	<div v-if="session.isActive.value && room != null" ref="rootEl" :class="$style.root">
		<Transition name="calls-dock-expand">
			<div v-if="expanded" class="_panel" :class="$style.panel">
				<header :class="$style.panelHeader">
					<div>
						<strong :class="$style.panelTitle">{{ room.title }}</strong>
						<div :class="$style.panelMeta"><span>{{ i18n.ts._calls.live }}</span><span>{{ participants.length }} {{ i18n.ts.users }}</span></div>
					</div>
					<button class="_button" :class="$style.circleButton" @click="expanded = false"><i class="ti ti-chevron-down"></i></button>
				</header>

				<div :class="$style.quickActions">
					<button v-if="session.isSpeaker.value" class="_button" :class="[$style.quickAction, session.muted.value && $style.quickActionActive]" @click="session.toggleMute()">
						<i :class="session.muted.value ? 'ti ti-microphone-off' : 'ti ti-microphone'"></i>
						<span>{{ session.muted.value ? i18n.ts._calls.unmute : i18n.ts._calls.mute }}</span>
					</button>
					<button v-else class="_button" :class="[$style.quickAction, session.myParticipant.value?.speakerRequestedAt != null && $style.quickActionActive]" :disabled="session.myParticipant.value?.speakerRequestedAt != null" @click="session.requestSpeaker()">
						<i class="ti ti-hand-stop"></i>
						<span>{{ i18n.ts._calls.requestSpeaker }}</span>
					</button>
					<button class="_button" :class="$style.quickAction" @click="openRoom"><i class="ti ti-layout-dashboard"></i><span>{{ i18n.ts.details }}</span></button>
					<button class="_button" :class="[$style.quickAction, $style.quickActionDanger]" @click="leaveRoom"><i class="ti ti-door-exit"></i><span>{{ session.isHost.value ? i18n.ts._calls.endRoom : i18n.ts._calls.leaveRoom }}</span></button>
				</div>

				<section v-if="session.isHost.value && pendingRequests.length > 0" :class="$style.section">
					<strong :class="$style.sectionLabel">{{ i18n.ts._calls.requestSpeaker }}</strong>
					<div :class="$style.userList">
						<div v-for="participant in pendingRequests" :key="participant.id" :class="$style.userRow">
							<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="$style.userAvatar"/>
							<div :class="$style.userBody"><strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong></div>
							<button class="_button" :class="$style.inlineAction" @click="setRole(participant.id, 'speaker')">{{ i18n.ts.approve }}</button>
						</div>
					</div>
				</section>

				<section v-if="speakers.length > 0" :class="$style.section">
					<strong :class="$style.sectionLabel">{{ i18n.ts._calls.speaker }}</strong>
					<div :class="$style.userList">
						<div v-for="participant in speakers" :key="participant.id" :class="$style.userRow">
							<MkAvatar v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!" :class="[$style.userAvatar, session.speakingParticipantIds.value.has(participant.id) && $style.userAvatarLive]"/>
							<div v-else :class="$style.avatarPlaceholder"><i class="ti ti-user"></i></div>
							<div :class="$style.userBody">
								<strong><MkUserName v-if="participantUser(participant.userId) != null" :user="participantUser(participant.userId)!"/><template v-else>{{ participant.userId }}</template></strong>
								<small>{{ participant.role === 'host' ? i18n.ts._calls.host : participant.isMuted ? i18n.ts._calls.mute : session.speakingParticipantIds.value.has(participant.id) ? i18n.ts._calls.live : i18n.ts._calls.speaker }}</small>
							</div>
							<button v-if="session.isHost.value && participant.role !== 'host'" class="_button" :class="$style.inlineAction" :title="i18n.ts._calls.demoteListener" @click="setRole(participant.id, 'listener')"><i class="ti ti-microphone-off"></i></button>
						</div>
					</div>
				</section>

				<section v-if="listeners.length > 0" :class="$style.section">
					<strong :class="$style.sectionLabel">{{ i18n.ts._calls.listener }}</strong>
					<div :class="$style.userList">
						<div v-for="participant in listeners" :key="participant.id" :class="$style.userRow">
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
			<button class="_button _panel" :class="$style.main" @click="expanded = !expanded">
				<div :class="[$style.avatarRing, $style.avatarRingActive, isLiveSpeaking && $style.avatarRingLive]">
					<MkAvatar v-if="hostUser != null" :user="hostUser" :class="$style.avatar"/>
					<i v-else class="ti ti-phone"></i>
				</div>
				<div :class="$style.body">
					<div :class="$style.titleRow"><span :class="$style.live">{{ i18n.ts._calls.live }}</span><strong>{{ room.title }}</strong></div>
					<small>{{ participants.length }} {{ i18n.ts.users }} · {{ i18n.ts._calls[session.myParticipant.value!.role] }}</small>
				</div>
				<i :class="expanded ? 'ti ti-chevron-down' : 'ti ti-chevron-up'"></i>
			</button>
			<div :class="$style.actions">
				<button v-if="session.isSpeaker.value" class="_button _panel" :class="[$style.action, session.muted.value && $style.actionMuted]" @click="session.toggleMute()"><i :class="session.muted.value ? 'ti ti-microphone-off' : 'ti ti-microphone'"></i></button>
				<button class="_button _panel" :class="[$style.action, $style.actionDanger]" @click="leaveRoom"><i class="ti ti-door-exit"></i></button>
			</div>
		</div>
	</div>
</Teleport>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { mainRouter } from '@/router.js';
import { useCallsSession } from '@/utility/calls-session.js';
import { misskeyApi } from '@/utility/misskey-api.js';

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

function participantUser(userId: string): Misskey.entities.UserLite | null {
	return session.usersById.value.get(userId) ?? null;
}

function openRoom(): void {
	if (session.currentRoomId.value == null) return;
	expanded.value = false;
	mainRouter.push('/calls/:roomId', { params: { roomId: session.currentRoomId.value } });
}

async function leaveRoom(): Promise<void> {
	const wasOnRoomPage = /^\/calls\/[^/]+$/.test(mainRouter.currentRoute.value.path);
	const { canceled } = await os.confirm({ type: 'warning', text: session.isHost.value ? i18n.ts._calls.endRoom : i18n.ts._calls.leaveRoom });
	if (canceled) return;
	expanded.value = false;
	await session.leave();
	if (wasOnRoomPage) mainRouter.push('/calls');
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
.root { position: fixed; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 1200; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; max-width: min(420px, calc(100vw - 32px)); }
.panel { display: flex; width: min(420px, calc(100vw - 32px)); max-height: min(70vh, 560px); flex-direction: column; gap: 14px; overflow: hidden auto; padding: 14px; border-radius: 24px; background: color(from var(--MI_THEME-panel) srgb r g b / 0.94); box-shadow: 0 16px 40px color(from var(--MI_THEME-bg) srgb r g b / 0.28); backdrop-filter: blur(18px); }
.panelHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.panelTitle { display: block; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.panelMeta { display: flex; gap: 8px; margin-top: 4px; font-size: 0.78rem; opacity: 0.72; }
.panelMeta > :first-child, .live { color: var(--MI_THEME-accent); font-weight: 800; letter-spacing: 0.08em; }
.circleButton { width: 32px; height: 32px; border-radius: 999px; }
.quickActions { display: flex; flex-wrap: wrap; gap: 8px; }
.quickAction { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border-radius: 999px; background: color(from var(--MI_THEME-bg) srgb r g b / 0.36); font-size: 0.85rem; }
.quickActionActive { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); }
.quickActionDanger { color: var(--MI_THEME-error); }
.section { display: flex; flex-direction: column; gap: 8px; }
.sectionLabel { font-size: 0.78rem; letter-spacing: 0.04em; opacity: 0.72; text-transform: uppercase; }
.userList { display: flex; flex-direction: column; gap: 6px; }
.userRow { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 16px; background: color(from var(--MI_THEME-bg) srgb r g b / 0.28); }
.userAvatar, .avatarPlaceholder { width: 36px; height: 36px; flex: 0 0 36px; border-radius: 50%; }
.avatarPlaceholder { display: grid; place-items: center; background: var(--MI_THEME-bg); }
.userAvatarLive { box-shadow: 0 0 0 3px var(--MI_THEME-accent), 0 0 16px color-mix(in srgb, var(--MI_THEME-accent) 38%, transparent); animation: avatarPulse 1.35s ease-in-out infinite alternate; }
.userBody { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
.userBody small { opacity: 0.68; }
.inlineAction { flex: 0 0 auto; padding: 6px 10px; border-radius: 999px; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); font-size: 0.78rem; font-weight: 700; }
.summaryRow { display: flex; align-items: stretch; gap: 8px; }
.main { display: flex; min-width: min(310px, calc(100vw - 120px)); align-items: center; gap: 11px; padding: 9px 12px; border-radius: 22px; text-align: left; box-shadow: 0 12px 30px color(from var(--MI_THEME-bg) srgb r g b / 0.24); }
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

@keyframes organicRing {
	0%, 100% { transform: scale(0.96) rotate(0deg); border-radius: 44% 56% 48% 52% / 52% 43% 57% 48%; }
	35% { transform: scale(1.06) rotate(7deg); border-radius: 58% 42% 55% 45% / 42% 57% 43% 58%; }
	68% { transform: scale(1.01) rotate(-5deg); border-radius: 49% 51% 39% 61% / 60% 44% 56% 40%; }
}

@keyframes avatarPulse {
	from { transform: scale(0.96); }
	to { transform: scale(1.03); }
}

@media (prefers-reduced-motion: reduce) {
	.userAvatarLive, .avatarRingActive::before, .avatarRingActive::after { animation: none; }
}

@media (max-width: 500px) {
	.root { right: 12px; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); max-width: calc(100vw - 24px); }
	.panel { width: calc(100vw - 24px); max-height: min(60vh, 480px); }
	.main { min-width: calc(100vw - 144px); }
}
</style>
