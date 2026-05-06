<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="[]">
		<div v-if="event" :class="$style.root">
			<div :class="$style.header">
				<MkButton :class="$style.backButton" @click="router.push('/events')">
					<i class="ti ti-arrow-left"></i>
					{{ i18n.ts.goBack }}
				</MkButton>
				<div :class="$style.titleRow">
					<span v-if="event.color" :class="$style.colorSwatch" :style="{ backgroundColor: event.color }"></span>
					<div :class="$style.title">{{ event.title }}</div>
				</div>
				<div :class="$style.date">
					<i class="ti ti-calendar"></i>
					{{ formatDate(event.startAt) }}
				<template v-if="event.endAt">〜 {{ formatDate(event.endAt) }}</template>
			</div>
			<span v-if="event.status !== 'approved'" :class="[$style.statusBadge, $style['status_' + event.status]]">
				{{ i18n.ts._events[event.status] }}
			</span>
		</div>

		<div v-if="event.description" :class="$style.section">
			<div :class="$style.sectionTitle">{{ i18n.ts._events.description }}</div>
			<div :class="$style.description">
				<Mfm :text="event.description"/>
			</div>
		</div>

		<div v-if="event.url" :class="$style.section">
			<div :class="$style.sectionTitle">{{ i18n.ts._events.url }}</div>
			<a :href="event.url" target="_blank" rel="noopener noreferrer" :class="$style.url">
				{{ event.url }}
			</a>
		</div>

		<div v-if="event.tags && event.tags.length > 0" :class="$style.section">
			<div :class="$style.sectionTitle">{{ i18n.ts._events.tags }}</div>
			<div :class="$style.tags">
				<button
					v-for="tag in event.tags"
					:key="tag"
					class="_button"
					:class="$style.tag"
					@click="openTag(tag)"
				>
					#{{ tag }}
				</button>
			</div>
		</div>

		<div v-if="event.channel" :class="$style.section">
			<div :class="$style.sectionTitle">{{ i18n.ts._events.channel }}</div>
			<MkButton :class="$style.channelButton" @click="openChannel">
				<i class="ti ti-device-tv"></i> {{ event.channel.name }}
			</MkButton>
		</div>

		<div :class="$style.section">
			<div :class="$style.createdBy">
				<MkAvatar :user="event.createdBy" :class="$style.avatar"/>
				<span>{{ event.createdBy.name || event.createdBy.username }}</span>
			</div>
		</div>

		<div :class="$style.actions">
			<MkButton primary @click="noteIt">
				<i class="ti ti-pencil"></i> {{ i18n.ts._events.noteIt }}
			</MkButton>
			<MkButton v-if="canManagePendingEvent && event.status !== 'approved'" primary @click="approveEvent">
				<i class="ti ti-check"></i> {{ i18n.ts._events.approve }}
			</MkButton>
			<MkButton v-if="canManagePendingEvent && event.status !== 'rejected'" danger @click="rejectEvent">
				<i class="ti ti-x"></i> {{ i18n.ts._events.reject }}
			</MkButton>
			<MkButton v-if="isOwner" @click="editEvent">
				<i class="ti ti-edit"></i> {{ i18n.ts._events.editEvent }}
			</MkButton>
			<MkButton v-if="isOwner || iAmModerator" danger @click="deleteEvent">
				<i class="ti ti-trash"></i> {{ i18n.ts.delete }}
			</MkButton>
		</div>
	</div>
	<div v-else :class="$style.loading">
		<MkLoading/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { $i, iAmModerator } from '@/i.js';
import * as os from '@/os.js';

const props = defineProps<{
	eventId: string;
}>();

const router = useRouter();
const event = ref<Misskey.entities.Event | null>(null);
const canManagePendingEvent = ref(false);

const isOwner = computed(() => {
	if (!$i || !event.value) return false;
	return event.value.createdById === $i.id;
});

async function fetch() {
	event.value = await misskeyApi('events/show', { eventId: props.eventId });
	await updateManagePermission();
}

async function updateManagePermission() {
	if (!$i || event.value == null || event.value.status === 'approved') {
		canManagePendingEvent.value = false;
		return;
	}

	if (iAmModerator) {
		canManagePendingEvent.value = true;
		return;
	}

	if (event.value.channelId == null) {
		canManagePendingEvent.value = false;
		return;
	}

	try {
		const channel = await misskeyApi('channels/show', { channelId: event.value.channelId });
		canManagePendingEvent.value = channel.userId === $i.id || channel.collaboratorIds?.includes($i.id) === true;
	} catch {
		canManagePendingEvent.value = false;
	}
}

function formatDate(dateStr: string): string {
	const d = new Date(dateStr);
	return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function noteIt() {
	if (!event.value) return;
	os.post({ initialText: `${url}/events/${event.value.id}` });
}

function openTag(tag: string) {
	router.push('/tags/:tag', { params: { tag } });
}

function openChannel() {
	if (event.value?.channelId == null) return;
	router.push('/channels/:channelId', { params: { channelId: event.value.channelId } });
}

function editEvent() {
	router.push('/events/:eventId/edit', { params: { eventId: props.eventId } });
}

async function deleteEvent() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._events.confirmDelete,
	});
	if (canceled) return;

	await misskeyApi('events/delete', { eventId: props.eventId });
	os.alert({ type: 'success', text: i18n.ts._events.eventDeleted });
	router.push('/events');
}

async function approveEvent() {
	await misskeyApi('events/approve', { eventId: props.eventId });
	os.alert({ type: 'success', text: i18n.ts._events.eventApproved });
	await fetch();
}

async function rejectEvent() {
	await misskeyApi('events/reject', { eventId: props.eventId });
	os.alert({ type: 'success', text: i18n.ts._events.eventRejected });
	await fetch();
}

const headerActions = computed(() => []);

onMounted(() => {
	fetch();
});

definePage(computed(() => ({
	title: event.value?.title ?? i18n.ts._events.eventDetail,
	icon: 'ti ti-calendar-event',
})));
</script>

<style lang="scss" module>
.root {
	padding: 24px;
	max-width: 700px;
	margin: 0 auto;
}

.loading {
	padding: 32px;
}

.header {
	margin-bottom: 24px;
}

.backButton {
	margin-bottom: 12px;
}

.titleRow {
	display: flex;
	align-items: center;
	gap: 10px;
}

.title {
	font-size: 1.5em;
	font-weight: 700;
	margin-bottom: 8px;
	color: var(--MI_THEME-fg);
}

.colorSwatch {
	width: 14px;
	height: 14px;
	border-radius: 999px;
	flex-shrink: 0;
	box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
}

.date {
	font-size: 1em;
	color: var(--MI_THEME-fgTransparent);
	display: flex;
	align-items: center;
	gap: 6px;
	margin-bottom: 8px;
}

.section {
	margin-bottom: 20px;
}

.sectionTitle {
	font-size: 0.85em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparent);
	margin-bottom: 6px;
}

.channelButton {
	display: inline-flex;
	align-items: center;
	gap: 8px;
}

.description {
	background: var(--MI_THEME-panel);
	border-radius: 8px;
	padding: 12px;
	line-height: 1.7;
}

.url {
	color: var(--MI_THEME-link);
	text-decoration: none;
	&:hover {
		text-decoration: underline;
	}
}

.tags {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.tag {
	color: var(--MI_THEME-accent);
	font-weight: 600;
}

.channel {
	display: flex;
	align-items: center;
	gap: 6px;
}

.createdBy {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparent);
}

.avatar {
	width: 28px;
	height: 28px;
}

.statusBadge {
	display: inline-block;
	font-size: 0.75em;
	padding: 2px 8px;
	border-radius: 12px;
	font-weight: 600;
}

.status_pending {
	background: var(--MI_THEME-warn);
	color: #fff;
}

.status_approved {
	background: var(--MI_THEME-success);
	color: #fff;
}

.status_rejected {
	background: var(--MI_THEME-error);
	color: #fff;
}

.actions {
	display: flex;
	gap: 8px;
	margin-top: 24px;
	flex-wrap: wrap;
}
</style>
