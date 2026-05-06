<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div class="_gaps">
			<MkLoading v-if="loading"/>

			<div v-else-if="pendingEvents.length === 0" class="_fullInfo">
				<span>{{ i18n.ts._events.noEvents }}</span>
			</div>

			<div v-else :class="$style.eventList">
				<div v-for="event in pendingEvents" :key="event.id" class="_panel" :class="$style.eventCard">
					<div :class="$style.eventDate">
						<i class="ti ti-calendar"></i>
						{{ formatDate(event.startAt) }}
						<template v-if="event.endAt">〜 {{ formatDate(event.endAt) }}</template>
					</div>
					<div :class="$style.eventTitle">{{ event.title }}</div>
					<div v-if="event.color" :class="$style.colorRow">
						<span :class="$style.colorSwatch" :style="{ backgroundColor: event.color }"></span>
						<span>{{ event.color }}</span>
					</div>
					<div v-if="event.description" :class="$style.eventDesc">{{ event.description }}</div>
					<div v-if="event.url" :class="$style.eventUrl">
						<a :href="event.url" target="_blank" rel="noopener noreferrer">{{ event.url }}</a>
					</div>
					<div :class="$style.eventMeta">
						<MkAvatar :user="event.createdBy" :class="$style.avatar"/>
						<span>{{ event.createdBy.name || event.createdBy.username }}</span>
						<span v-if="event.channel">
							<i class="ti ti-device-tv"></i> {{ event.channel.name }}
						</span>
					</div>
					<div :class="$style.actions">
						<MkButton @click="openEvent(event.id)">
							<i class="ti ti-external-link"></i> {{ i18n.ts.details }}
						</MkButton>
						<MkButton primary @click="approveEvent(event.id)">
							<i class="ti ti-check"></i> {{ i18n.ts._events.approve }}
						</MkButton>
						<MkButton danger @click="rejectEvent(event.id)">
							<i class="ti ti-x"></i> {{ i18n.ts._events.reject }}
						</MkButton>
					</div>
				</div>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';

const router = useRouter();

const loading = ref(true);
const pendingEvents = ref<Misskey.entities.Event[]>([]);

async function fetchPendingEvents() {
	loading.value = true;
	try {
		pendingEvents.value = await misskeyApi('events/pending', {
			limit: 100,
		});
	} catch (e) {
		console.error(e);
	} finally {
		loading.value = false;
	}
}

function formatDate(dateStr: string): string {
	const d = new Date(dateStr);
	return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function openEvent(eventId: string) {
	router.push('/events/:eventId', { params: { eventId } });
}

async function approveEvent(eventId: string) {
	await misskeyApi('events/approve', { eventId });
	os.alert({ type: 'success', text: i18n.ts._events.eventApproved });
	pendingEvents.value = pendingEvents.value.filter(e => e.id !== eventId);
}

async function rejectEvent(eventId: string) {
	await misskeyApi('events/reject', { eventId });
	os.alert({ type: 'success', text: i18n.ts._events.eventRejected });
	pendingEvents.value = pendingEvents.value.filter(e => e.id !== eventId);
}

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

onMounted(() => {
	fetchPendingEvents();
});

definePage(() => ({
	title: i18n.ts._events.approvalQueue,
	icon: 'ti ti-checklist',
}));
</script>

<style lang="scss" module>
.eventList {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.eventCard {
	padding: 16px;
}

.eventDate {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparent);
	margin-bottom: 4px;
	display: flex;
	align-items: center;
	gap: 6px;
}

.eventTitle {
	font-size: 1.1em;
	font-weight: 700;
	margin-bottom: 6px;
}

.eventDesc {
	white-space: pre-wrap;
	word-break: break-word;
	margin-bottom: 8px;
}

.colorRow {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparent);
	margin-bottom: 8px;
}

.colorSwatch {
	width: 12px;
	height: 12px;
	border-radius: 999px;
	box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
}

.eventUrl {
	margin-bottom: 8px;

	a {
		color: var(--MI_THEME-link);
	}
}

.eventMeta {
	display: flex;
	align-items: center;
	gap: 12px;
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparent);
	margin-bottom: 12px;
	flex-wrap: wrap;
}

.avatar {
	width: 24px;
	height: 24px;
}

.actions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
</style>
