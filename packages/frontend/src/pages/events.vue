<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<div :class="$style.root">
		<template v-if="tab === 'upcoming'">
			<div :class="$style.calendarSection">
				<div :class="$style.filters">
					<MkSelect v-model="eventScope" :items="eventScopeItems">
						<template #label>{{ i18n.ts.filter }}</template>
					</MkSelect>

					<MkSelect
						v-if="eventScope === 'channel'"
						v-model="selectedChannelId"
						:items="channelSelectItems"
						:disabled="isLoadingChannels"
					>
						<template #label>{{ i18n.ts.channel }}</template>
					</MkSelect>
				</div>

				<MkEventCalendar
					v-model:selectedDate="selectedDate"
					:events="calendarEvents"
					:allowCreate="!!$i"
					@rangeChange="onRangeChange"
					@eventCreated="refreshEventsData"
				/>

				<section v-if="$i && myPendingOrRejectedEvents.length > 0" :class="$style.pendingSection">
					<div :class="$style.pendingHeader">
						<h2 :class="$style.pendingTitle">{{ i18n.ts._events.mySubmissions }}</h2>
						<span :class="$style.pendingCount">{{ myPendingOrRejectedEvents.length }}</span>
					</div>

					<div :class="$style.pendingList">
						<button
							v-for="event in myPendingOrRejectedEvents"
							:key="event.id"
							class="_button"
							:class="$style.pendingCard"
							@click="router.push('/events/:eventId', { params: { eventId: event.id } })"
						>
						<div :class="$style.pendingDate">{{ formatDate(event.startAt) }}</div>
						<div :class="$style.pendingEventTitle">{{ event.title }}</div>
						<div v-if="event.status !== 'approved'" :class="$style.pendingStatus">{{ i18n.ts._events[event.status] }}</div>
						<div v-if="event.description" :class="$style.pendingDescription">{{ event.description }}</div>
					</button>
					</div>
				</section>
			</div>
		</template>

		<section v-else-if="$i" :class="$style.pendingSection">
			<div :class="$style.pendingHeader">
				<h2 :class="$style.pendingTitle">{{ i18n.ts._events.mySubmissions }}</h2>
				<span :class="$style.pendingCount">{{ myEvents.length }}</span>
			</div>

			<div v-if="myEvents.length === 0" :class="$style.empty">
				{{ i18n.ts._events.noEvents }}
			</div>

			<div v-else :class="$style.pendingList">
				<button
					v-for="event in myEvents"
					:key="event.id"
					class="_button"
					:class="$style.pendingCard"
					@click="router.push('/events/:eventId', { params: { eventId: event.id } })"
				>
					<div :class="$style.pendingDate">{{ formatDate(event.startAt) }}</div>
					<div :class="$style.pendingEventTitle">{{ event.title }}</div>
					<div :class="$style.pendingStatus">{{ i18n.ts._events[event.status] }}</div>
					<div v-if="event.description" :class="$style.pendingDescription">{{ event.description }}</div>
				</button>
			</div>
		</section>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkEventCalendar from '@/components/MkEventCalendar.vue';
import type { MkSelectItem, GetMkSelectValueTypesFromDef } from '@/components/MkSelect.vue';
import MkSelect from '@/components/MkSelect.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { $i } from '@/i.js';

const router = useRouter();

const tab = ref('upcoming');
const selectedDate = ref<string | null>(null);
const approvedEvents = ref<Misskey.entities.Event[]>([]);
const myEvents = ref<Misskey.entities.Event[]>([]);
const availableChannels = ref<Misskey.entities.Channel[]>([]);
const isLoadingChannels = ref(false);

const eventScopeItems = [
	{ label: i18n.ts.instance, value: 'server' },
	{ label: i18n.ts.all, value: 'all' },
	{ label: i18n.ts.channel, value: 'channel' },
] as const satisfies MkSelectItem[];

type EventScope = GetMkSelectValueTypesFromDef<typeof eventScopeItems>;

const eventScope = ref<EventScope>('server');
const selectedChannelId = ref<string | null>(null);

const rangeStart = ref<number>(0);
const rangeEnd = ref<number>(0);

const channelSelectItems = computed<MkSelectItem<string | null>[]>(() => {
	return availableChannels.value
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name))
		.map(channel => ({
			label: channel.name,
			value: channel.id,
		}));
});

function onRangeChange(range: { startAt: number; endAt: number; view: 'month' | 'week' | 'schedule' }) {
	rangeStart.value = range.startAt;
	rangeEnd.value = range.endAt;
	fetchEvents();
}

function formatDate(dateStr: string): string {
	const d = new Date(dateStr);
	return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function fetchEvents() {
	if (rangeStart.value === 0 || rangeEnd.value === 0) return;
	if (eventScope.value === 'channel' && selectedChannelId.value == null) {
		approvedEvents.value = [];
		return;
	}

	try {
		const request = {
			limit: 100,
			sinceDate: rangeStart.value,
			untilDate: rangeEnd.value,
			includeChannelEvents: eventScope.value === 'all',
			channelId: eventScope.value === 'channel' ? selectedChannelId.value : null,
		} satisfies Misskey.entities.EventsListRequest;

		const res = await misskeyApi('events/list', request);
		approvedEvents.value = res;
	} catch (error) {
		console.error(error);
	}
}

async function fetchAvailableChannels() {
	if (isLoadingChannels.value || availableChannels.value.length > 0) return;

	isLoadingChannels.value = true;

	try {
		const channels = await misskeyApi('channels/search', {
			query: '',
			type: 'nameOnly',
			limit: 100,
		});
		availableChannels.value = channels;

		if (selectedChannelId.value == null && channels.length > 0) {
			const [firstChannel] = channels.slice().sort((a, b) => a.name.localeCompare(b.name));
			selectedChannelId.value = firstChannel?.id ?? null;
		}
	} catch (error) {
		console.error(error);
	} finally {
		isLoadingChannels.value = false;
	}
}

async function fetchMyEvents() {
	if (!$i) return;

	try {
		const res = await misskeyApi('events/my-submissions', {
			limit: 50,
		});
		myEvents.value = res;
	} catch (error) {
		console.error(error);
	}
}

function refreshEventsData() {
	fetchEvents();
	fetchMyEvents();
}

watch(eventScope, () => {
	if (eventScope.value === 'channel') {
		fetchAvailableChannels();
	}

	if (rangeStart.value !== 0 && rangeEnd.value !== 0) {
		fetchEvents();
	}
});

watch(selectedChannelId, () => {
	if (eventScope.value === 'channel' && rangeStart.value !== 0 && rangeEnd.value !== 0) {
		fetchEvents();
	}
});

const calendarEvents = computed(() => {
	return approvedEvents.value.map(ev => ({
		id: ev.id,
		title: ev.title,
		description: ev.description,
		startAt: ev.startAt,
		endAt: ev.endAt,
		color: ev.color,
		channelName: ev.channel?.name ?? null,
		tags: ev.tags,
	}));
});

const myPendingOrRejectedEvents = computed(() => {
	return myEvents.value.filter(event => event.status === 'pending' || event.status === 'rejected');
});

const headerActions = computed(() => {
	const actions: { icon: string; text: string; handler: () => void }[] = [];
	if ($i) {
		actions.push({
			icon: 'ti ti-plus',
			text: i18n.ts._events.createEvent,
			handler: () => router.push('/events/new'),
		});
	}
	return actions;
});

const headerTabs = computed(() => {
	const tabs = [
		{ key: 'upcoming', title: i18n.ts._events.allEvents, icon: 'ti ti-calendar-event' },
	];

	if ($i) {
		tabs.push({ key: 'mySubmissions', title: i18n.ts._events.mySubmissions, icon: 'ti ti-send' });
	}

	return tabs;
});

if ($i) {
	fetchMyEvents();
}

definePage(() => ({
	title: i18n.ts._events.eventCalendar,
	icon: 'ti ti-calendar-event',
	needWideArea: true,
}));
</script>

<style lang="scss" module>
.root {
	padding: 16px;
	max-width: 1200px;
	margin: 0 auto;
}

.calendarSection {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.filters {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 280px));
	gap: 12px;
	align-items: start;
}

.pendingSection {
	margin-top: 20px;
	padding: 18px;
	border-radius: 16px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 48%, transparent);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
}

.pendingHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 14px;
}

.pendingTitle {
	margin: 0;
	font-size: 1rem;
	font-weight: 800;
	color: var(--MI_THEME-fg);
}

.pendingCount {
	min-width: 28px;
	height: 28px;
	padding: 0 8px;
	border-radius: 999px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-size: 0.82rem;
	font-weight: 800;
	color: var(--MI_THEME-fgOnAccent);
	background: var(--MI_THEME-accent);
}

.pendingList {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 10px;
}

.pendingCard {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 6px;
	padding: 14px;
	border-radius: 14px;
	text-align: left;
	background: var(--MI_THEME-panel);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
}

.pendingDate {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparent);
}

.pendingEventTitle {
	font-size: 0.96rem;
	font-weight: 800;
	color: var(--MI_THEME-fg);
	word-break: break-word;
}

.pendingStatus {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--MI_THEME-accent);
}

.pendingDescription {
	font-size: 0.88rem;
	line-height: 1.45;
	color: var(--MI_THEME-fgTransparent);
	word-break: break-word;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.eventList {
	margin-top: 16px;
}

.selectedDateLabel {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 700;
	font-size: 1.1em;
	margin-bottom: 12px;
	color: var(--MI_THEME-fg);
}

.clearDate {
	color: var(--MI_THEME-fgTransparent);
	&:hover {
		color: var(--MI_THEME-fg);
	}
}

.empty {
	text-align: center;
	padding: 32px 16px;
	color: var(--MI_THEME-fgTransparent);
}

.eventCard {
	background: var(--MI_THEME-panel);
	border-radius: 12px;
	padding: 16px;
	margin-bottom: 8px;
	cursor: pointer;
	transition: background 0.15s;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
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
	color: var(--MI_THEME-fg);
	margin-bottom: 4px;
}

.eventDesc {
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparent);
	margin-bottom: 8px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.eventMeta {
	display: flex;
	align-items: center;
	gap: 12px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparent);
}

.eventChannel {
	display: flex;
	align-items: center;
	gap: 4px;
}

.eventTags {
	display: flex;
	gap: 6px;
}

.tag {
	color: var(--MI_THEME-accent);
}

.statusBadge {
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

</style>
