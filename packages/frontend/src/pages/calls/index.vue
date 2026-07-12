<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader/></template>
	<div class="_spacer" style="--MI_SPACER-w: 760px;">
		<div class="_gaps">
			<section class="_panel" :class="$style.createPanel">
				<div v-if="!createFormOpen" :class="$style.createPrompt">
					<div :class="$style.createPromptIcon"><i class="ti ti-phone-plus"></i></div>
					<div>
						<strong>{{ i18n.ts._calls.newCall }}</strong>
						<p>{{ i18n.ts._calls.newCallDescription }}</p>
					</div>
					<MkButton primary gradate rounded @click="openCreateForm"><i class="ti ti-broadcast"></i> {{ i18n.ts._calls.createRoom }}</MkButton>
				</div>

				<form v-else :class="$style.createForm" @submit.prevent="createRoom">
					<header :class="$style.createHeader">
						<div><strong><i class="ti ti-broadcast"></i> {{ i18n.ts._calls.createRoom }}</strong><small>{{ scheduledAt === '' ? i18n.ts._calls.startsImmediately : i18n.ts._calls.createsSchedule }}</small></div>
						<button type="button" class="_button" :class="$style.closeButton" @click="closeCreateForm"><i class="ti ti-x"></i></button>
					</header>

					<MkInput v-model="title" required maxlength="256">
						<template #label>{{ i18n.ts._calls.roomTitle }}</template>
					</MkInput>
					<MkTextarea v-model="description" :class="$style.descriptionInput">
						<template #label>{{ i18n.ts._calls.roomDescription }}</template>
					</MkTextarea>

					<div :class="$style.fieldGroup">
						<div :class="$style.fieldLabel">{{ i18n.ts._calls.attachmentType }}</div>
						<div :class="$style.choiceGrid">
							<button type="button" class="_button" :class="[$style.choice, attachmentType === 'personal' && $style.choiceActive]" @click="attachmentType = 'personal'">
								<i class="ti ti-user"></i><span><strong>{{ i18n.ts._calls.personalRoom }}</strong><small>{{ i18n.ts._calls.personalRoomDescription }}</small></span>
							</button>
							<button type="button" class="_button" :class="[$style.choice, attachmentType === 'chatRoom' && $style.choiceActive]" @click="attachmentType = 'chatRoom'">
								<i class="ti ti-messages"></i><span><strong>{{ i18n.ts._calls.chatRoom }}</strong><small>{{ i18n.ts._calls.chatRoomDescription }}</small></span>
							</button>
						</div>
					</div>

					<MkInput v-if="attachmentType === 'chatRoom'" v-model="chatRoomId" required>
						<template #label>{{ i18n.ts._calls.chatRoomId }}</template>
					</MkInput>

					<button type="button" class="_button" :class="$style.advancedToggle" @click="advancedOpen = !advancedOpen">
						<i class="ti ti-adjustments"></i><span>{{ i18n.ts._calls.advancedSettings }}</span><i :class="advancedOpen ? 'ti ti-chevron-up' : 'ti ti-chevron-down'"></i>
					</button>
					<div v-if="advancedOpen" :class="$style.advancedFields">
						<MkSelect v-if="attachmentType === 'personal'" v-model="visibility" :items="visibilityItems">
							<template #label>{{ i18n.ts._calls.visibility }}</template>
						</MkSelect>
						<MkTextarea v-if="attachmentType === 'personal' && visibility === 'specified'" v-model="specifiedUserIds">
							<template #label>{{ i18n.ts._calls.specifiedUserIds }}</template>
							<template #caption>{{ i18n.ts._calls.specifiedUserIdsDescription }}</template>
						</MkTextarea>
						<MkInput v-model="scheduledAt" type="datetime-local">
							<template #label>{{ i18n.ts._calls.scheduledAt }}</template>
							<template #caption>{{ i18n.ts._calls.scheduledAtDescription }}</template>
						</MkInput>
					</div>

					<footer :class="$style.createActions">
						<MkButton type="button" rounded @click="closeCreateForm">{{ i18n.ts.cancel }}</MkButton>
						<MkButton type="submit" primary gradate rounded :disabled="creating || title.trim() === ''">
							<i :class="scheduledAt === '' ? 'ti ti-phone-call' : 'ti ti-calendar-plus'"></i>
							{{ scheduledAt === '' ? i18n.ts._calls.startCall : i18n.ts._calls.scheduleCall }}
						</MkButton>
					</footer>
				</form>
			</section>

			<section class="_panel" :class="$style.roomsPanel">
				<header :class="$style.roomsHeader"><div><i class="ti ti-broadcast"></i><strong>{{ i18n.ts._calls.activeRooms }}</strong></div><span>{{ activeRooms.length }}</span></header>
				<MkLoading v-if="loading"/>
				<MkResult v-else-if="loadFailed" type="error"/>
				<div v-else-if="activeRooms.length === 0" :class="$style.empty"><i class="ti ti-phone-off"></i><span>{{ i18n.ts._calls.noActiveRooms }}</span></div>
				<div v-else :class="$style.roomList">
					<MkA v-for="room in activeRooms" :key="room.id" :to="`/calls/${room.id}`" :class="$style.roomCard">
						<div :class="$style.roomLive">● {{ i18n.ts._calls.live }}</div>
						<div :class="$style.roomBody"><strong>{{ room.title }}</strong><small>{{ room.description || i18n.ts._calls.noDescription }}</small></div>
						<div :class="$style.roomMeta"><span><i :class="room.attachment.type === 'personal' ? 'ti ti-user' : 'ti ti-messages'"></i> {{ i18n.ts._calls[room.attachment.type === 'personal' ? 'personalRoom' : 'chatRoom'] }}</span><i class="ti ti-chevron-right"></i></div>
					</MkA>
				</div>
			</section>

			<section v-if="scheduledRooms.length > 0" class="_panel" :class="$style.roomsPanel">
				<header :class="$style.roomsHeader"><div><i class="ti ti-calendar-event"></i><strong>{{ i18n.ts._calls.scheduledRooms }}</strong></div><span>{{ scheduledRooms.length }}</span></header>
				<div :class="$style.roomList">
					<MkA v-for="room in scheduledRooms" :key="room.id" :to="`/calls/${room.id}`" :class="$style.roomCard">
						<div :class="$style.scheduledIcon"><i class="ti ti-calendar"></i></div>
						<div :class="$style.roomBody"><strong>{{ room.title }}</strong><small>{{ room.scheduledAt == null ? i18n.ts._calls.scheduled : new Date(room.scheduledAt).toLocaleString() }}</small></div>
						<div :class="$style.roomMeta"><span>{{ i18n.ts._calls[room.visibility] }}</span><i class="ti ti-chevron-right"></i></div>
					</MkA>
				</div>
			</section>
		</div>
	</div>
</MkStickyContainer>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import type { MkSelectItem } from '@/components/MkSelect.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { useCallsSession } from '@/utility/calls-session.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const router = useRouter();
const session = useCallsSession();
const rooms = ref<Misskey.entities.CallsRoom[]>([]);
const loading = ref(true);
const loadFailed = ref(false);
const creating = ref(false);
const createFormOpen = ref(false);
const advancedOpen = ref(false);
const title = ref('');
const description = ref('');
const attachmentType = ref<'personal' | 'chatRoom'>('personal');
const chatRoomId = ref('');
const visibility = ref<'public' | 'followers' | 'specified'>('public');
const specifiedUserIds = ref('');
const scheduledAt = ref('');
const activeRooms = computed(() => rooms.value.filter(room => room.state === 'open'));
const scheduledRooms = computed(() => rooms.value.filter(room => room.state === 'scheduled'));
const visibilityItems: MkSelectItem<'public' | 'followers' | 'specified'>[] = [
	{ label: i18n.ts._calls.public, value: 'public' },
	{ label: i18n.ts._calls.followers, value: 'followers' },
	{ label: i18n.ts._calls.specified, value: 'specified' },
];
let refreshTimer: number | null = null;

async function reload(showLoading = true): Promise<void> {
	if (showLoading) loading.value = true;
	loadFailed.value = false;
	try {
		rooms.value = await misskeyApi('calls/rooms/list', { limit: 50 });
	} catch {
		loadFailed.value = true;
	} finally {
		loading.value = false;
	}
}

function openCreateForm(): void { createFormOpen.value = true; }

function closeCreateForm(): void {
	createFormOpen.value = false;
	advancedOpen.value = false;
	title.value = '';
	description.value = '';
	attachmentType.value = 'personal';
	chatRoomId.value = '';
	visibility.value = 'public';
	specifiedUserIds.value = '';
	scheduledAt.value = '';
}

async function createRoom(): Promise<void> {
	if (creating.value || title.value.trim() === '') return;
	creating.value = true;
	try {
		let room = await misskeyApi('calls/rooms/create', {
			attachmentType: attachmentType.value,
			chatRoomId: attachmentType.value === 'chatRoom' ? chatRoomId.value : undefined,
			title: title.value.trim(),
			description: description.value.trim(),
			visibility: attachmentType.value === 'personal' ? visibility.value : undefined,
			visibleUserIds: attachmentType.value === 'personal' && visibility.value === 'specified' ? [...new Set(specifiedUserIds.value.split(/[\s,]+/).filter(Boolean))] : undefined,
			scheduledAt: scheduledAt.value === '' ? undefined : new Date(scheduledAt.value).getTime(),
		});
		if (scheduledAt.value === '') {
			room = await misskeyApi('calls/rooms/open', { roomId: room.id, expectedRevision: room.revision });
			closeCreateForm();
			router.push('/calls/:roomId', { params: { roomId: room.id } });
			try {
				await session.join(room.id, true);
			} catch (error) {
				await os.alert({ type: 'error', text: error instanceof Error ? error.message : i18n.ts.somethingHappened });
			}
			return;
		}
		closeCreateForm();
		router.push('/calls/:roomId', { params: { roomId: room.id } });
	} catch (error) {
		await os.alert({ type: 'error', text: error instanceof Error ? error.message : i18n.ts.somethingHappened });
	} finally {
		creating.value = false;
	}
}

onMounted(() => {
	void reload();
	refreshTimer = window.setInterval(() => void reload(false), 10_000);
});
onActivated(() => void reload(false));
onUnmounted(() => { if (refreshTimer != null) window.clearInterval(refreshTimer); });

definePage(() => ({ title: i18n.ts._calls.title, icon: 'ti ti-phone' }));
</script>

<style lang="scss" module>
.createPanel, .roomsPanel { padding: 18px; }
.createPrompt { display: flex; align-items: center; gap: 14px; }
.createPromptIcon { display: grid; width: 48px; height: 48px; flex: 0 0 48px; place-items: center; border-radius: 16px; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); font-size: 1.35rem; }
.createPrompt > div:nth-child(2) { min-width: 0; flex: 1; }
.createPrompt strong { font-size: 1.05rem; }
.createPrompt p { margin: 4px 0 0; opacity: 0.68; }
.createForm { display: flex; flex-direction: column; gap: 16px; }
.createHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.createHeader strong, .createHeader small { display: block; }
.createHeader strong { font-size: 1.08rem; }
.createHeader small { margin-top: 5px; opacity: 0.65; }
.closeButton { width: 36px; height: 36px; border-radius: 50%; }
.descriptionInput { min-height: 80px; }
.fieldGroup { display: flex; flex-direction: column; gap: 8px; }
.fieldLabel { font-size: 0.9rem; font-weight: 700; opacity: 0.8; }
.choiceGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.choice { display: flex; align-items: center; gap: 10px; padding: 12px; border: solid 1px var(--MI_THEME-divider); border-radius: 14px; text-align: left; }
.choice > i { font-size: 1.2rem; }
.choice span, .choice strong, .choice small { display: block; }
.choice span { min-width: 0; }
.choice small { margin-top: 3px; opacity: 0.62; }
.choiceActive { border-color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); }
.advancedToggle { display: flex; align-items: center; gap: 9px; padding: 10px 2px; color: var(--MI_THEME-fg); }
.advancedToggle span { flex: 1; text-align: left; }
.advancedFields { display: flex; flex-direction: column; gap: 14px; padding: 14px; border-radius: 14px; background: color(from var(--MI_THEME-bg) srgb r g b / 0.45); }
.createActions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
.roomsHeader { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: solid 1px var(--MI_THEME-divider); }
.roomsHeader > div { display: flex; align-items: center; gap: 9px; }
.roomsHeader > span { min-width: 30px; padding: 3px 9px; border-radius: 999px; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); text-align: center; }
.roomList { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; }
.roomCard { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px; border-radius: 16px; background: color(from var(--MI_THEME-bg) srgb r g b / 0.38); color: var(--MI_THEME-fg); transition: background 0.15s ease, transform 0.15s ease; }
.roomCard:hover { background: var(--MI_THEME-buttonHoverBg); transform: translateY(-1px); }
.roomLive { padding: 5px 8px; border-radius: 999px; background: color(from var(--MI_THEME-error) srgb r g b / 0.12); color: var(--MI_THEME-error); font-size: 0.7rem; font-weight: 800; letter-spacing: 0.05em; }
.scheduledIcon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 12px; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); }
.roomBody { min-width: 0; }
.roomBody strong, .roomBody small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.roomBody small { margin-top: 4px; opacity: 0.64; }
.roomMeta { display: flex; align-items: center; gap: 12px; font-size: 0.8rem; opacity: 0.72; }
.empty { display: grid; justify-items: center; gap: 8px; padding: 30px 12px 18px; opacity: 0.58; }
.empty i { font-size: 1.5rem; }

@media (max-width: 600px) {
	.createPrompt { align-items: stretch; flex-direction: column; }
	.createPromptIcon { display: none; }
	.choiceGrid { grid-template-columns: 1fr; }
	.createActions { flex-direction: column-reverse; }
	.roomCard { grid-template-columns: auto minmax(0, 1fr); }
	.roomMeta { grid-column: 1 / -1; justify-content: space-between; }
}
</style>
