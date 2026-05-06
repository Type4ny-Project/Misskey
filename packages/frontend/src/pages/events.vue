<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<div :class="$style.root">
		<template v-if="tab === 'upcoming'">
			<MkEventCalendar
				v-model:selectedDate="selectedDate"
				:events="calendarEvents"
				:allowCreate="!!$i"
				@rangeChange="onRangeChange"
				@eventCreated="refreshEventsData"
			/>
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
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkEventCalendar from '@/components/MkEventCalendar.vue';
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

const rangeStart = ref<number>(0);
const rangeEnd = ref<number>(0);

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

	try {
		const res = await misskeyApi('events/list', {
			limit: 100,
			sinceDate: rangeStart.value,
			untilDate: rangeEnd.value,
		});
		approvedEvents.value = res;
	} catch (error) {
		console.error(error);
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
