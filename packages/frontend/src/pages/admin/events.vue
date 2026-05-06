<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="scope" :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 1040px;">
		<div class="_gaps">
			<div :class="$style.toolbar">
				<div :class="$style.statusSummary">
					<span :class="$style.summaryLabel">{{ activeScopeTitle }}</span>
					<span :class="$style.summaryCount">{{ events.length }}</span>
				</div>
				<div :class="$style.filters">
					<MkSelect v-model="status" :items="statusItems">
						<template #label>{{ i18n.ts.filter }}</template>
					</MkSelect>
				</div>
			</div>

			<MkLoading v-if="loading"/>

			<div v-else-if="events.length === 0" class="_fullInfo">
				<span>{{ i18n.ts._events.noEvents }}</span>
			</div>

			<div v-else :class="$style.eventList">
				<div v-for="event in events" :key="event.id" class="_panel" :class="$style.eventCard">
					<div :class="$style.headerRow">
						<div>
							<div :class="$style.eventDate">
								<i class="ti ti-calendar"></i>
								{{ formatDate(event.startAt) }}
								<template v-if="event.endAt">〜 {{ formatDate(event.endAt) }}</template>
							</div>
							<div :class="$style.eventTitle">{{ event.title }}</div>
						</div>
						<span :class="[$style.statusBadge, $style[`status_${event.status}`]]">{{ i18n.ts._events[event.status] }}</span>
					</div>

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
						<MkButton v-if="event.status !== 'approved'" primary @click="approveEvent(event.id)">
							<i class="ti ti-check"></i> {{ i18n.ts._events.approve }}
						</MkButton>
						<MkButton v-if="event.status !== 'rejected'" danger @click="rejectEvent(event.id)">
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
import { computed, watch, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import type { GetMkSelectValueTypesFromDef, MkSelectItem } from '@/components/MkSelect.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';

type EventAdminStatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const scopeItems = [
	{ label: i18n.ts.all, value: 'all' },
	{ label: i18n.ts.channel, value: 'channel' },
	{ label: i18n.ts.instance, value: 'server' },
] as const satisfies MkSelectItem[];

type EventAdminScopeFilter = GetMkSelectValueTypesFromDef<typeof scopeItems>;

const statusItems = [
	{ label: i18n.ts._events.pending, value: 'pending' },
	{ label: i18n.ts._events.approved, value: 'approved' },
	{ label: i18n.ts._events.rejected, value: 'rejected' },
	{ label: i18n.ts.all, value: 'all' },
] as const satisfies MkSelectItem[];

const router = useRouter();

const status = ref<EventAdminStatusFilter>('pending');
const scope = ref<EventAdminScopeFilter>('all');
const loading = ref(true);
const events = ref<Misskey.entities.Event[]>([]);

async function fetchEvents() {
	loading.value = true;

	try {
		events.value = await misskeyApi<Misskey.entities.Event[]>(('admin/events/list' as keyof Misskey.Endpoints), {
			limit: 100,
			status: status.value,
			scope: scope.value,
		} as never);
	} catch (error) {
		console.error(error);
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
	fetchEvents();
}

async function rejectEvent(eventId: string) {
	await misskeyApi('events/reject', { eventId });
	os.alert({ type: 'success', text: i18n.ts._events.eventRejected });
	fetchEvents();
}

const headerActions = computed(() => [{
	icon: 'ti ti-refresh',
	text: i18n.ts.reload,
	handler: () => fetchEvents(),
}]);

const headerTabs = computed(() => [
	{ key: 'all', title: i18n.ts.all, icon: 'ti ti-list' },
	{ key: 'channel', title: i18n.ts.channel, icon: 'ti ti-device-tv' },
	{ key: 'server', title: i18n.ts.instance, icon: 'ti ti-server' },
]);

const activeScopeTitle = computed(() => {
	return headerTabs.value.find(item => item.key === scope.value)?.title ?? i18n.ts.all;
});

watch([status, scope], () => {
	fetchEvents();
}, { immediate: true });

definePage(() => ({
	title: i18n.ts._events.approvalQueue,
	icon: 'ti ti-checklist',
}));
</script>

<style lang="scss" module>
.toolbar {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}

.filters {
	min-width: 220px;
	max-width: 280px;
	width: 100%;
}

.statusSummary {
	display: inline-flex;
	align-items: center;
	gap: 10px;
	padding: 10px 14px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 6%, transparent);
}

.summaryLabel {
	font-weight: 700;
	color: var(--MI_THEME-fg);
}

.summaryCount {
	min-width: 26px;
	height: 26px;
	padding: 0 8px;
	border-radius: 999px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-size: 0.82rem;
	font-weight: 800;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
}

.eventList {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.eventCard {
	padding: 16px;
	border-radius: 16px;
}

.headerRow {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 12px;
	margin-bottom: 8px;
}

.eventDate {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparent);
	margin-bottom: 4px;
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
}

.eventTitle {
	font-size: 1.1em;
	font-weight: 700;
	word-break: break-word;
}

.statusBadge {
	flex-shrink: 0;
	padding: 4px 10px;
	border-radius: 999px;
	font-size: 0.78rem;
	font-weight: 800;
}

.status_pending {
	background: color-mix(in srgb, #f59e0b 18%, transparent);
	color: #f59e0b;
}

.status_approved {
	background: color-mix(in srgb, #22c55e 18%, transparent);
	color: #22c55e;
}

.status_rejected {
	background: color-mix(in srgb, #ef4444 18%, transparent);
	color: #ef4444;
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
