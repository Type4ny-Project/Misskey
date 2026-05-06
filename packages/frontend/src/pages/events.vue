<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<div :class="$style.root">
		<MkEventCalendar
			v-model:selectedDate="selectedDate"
			:events="calendarEvents"
			@monthChange="onMonthChange"
		/>

		<div v-if="tab === 'upcoming'" :class="$style.eventList">
			<div v-if="selectedDate" :class="$style.selectedDateLabel">
				{{ selectedDate }}
				<button class="_button" :class="$style.clearDate" @click="selectedDate = null">
					<i class="ti ti-x"></i>
				</button>
			</div>
			<div v-if="filteredEvents.length === 0" :class="$style.empty">
				{{ selectedDate ? i18n.ts._events.noEventsOnThisDay : i18n.ts._events.noEvents }}
			</div>
			<div v-for="event in filteredEvents" :key="event.id" :class="$style.eventCard" @click="showEvent(event.id)">
				<div :class="$style.eventDate">
					<i class="ti ti-calendar"></i>
					{{ formatDate(event.startAt) }}
					<template v-if="event.endAt">〜 {{ formatDate(event.endAt) }}</template>
				</div>
				<div :class="$style.eventTitle">{{ event.title }}</div>
				<div v-if="event.description" :class="$style.eventDesc">{{ event.description?.substring(0, 100) }}</div>
				<div :class="$style.eventMeta">
					<span v-if="event.channel" :class="$style.eventChannel">
						<i class="ti ti-device-tv"></i> {{ event.channel.name }}
					</span>
					<span v-if="event.tags && event.tags.length > 0" :class="$style.eventTags">
						<span v-for="tag in event.tags" :key="tag" :class="$style.tag">#{{ tag }}</span>
					</span>
				</div>
			</div>
		</div>

		<div v-if="tab === 'mySubmissions'" :class="$style.eventList">
			<div v-if="myEvents.length === 0" :class="$style.empty">
				{{ i18n.ts._events.noEvents }}
			</div>
			<div v-for="event in myEvents" :key="event.id" :class="$style.eventCard" @click="showEvent(event.id)">
				<div :class="$style.eventDate">
					<i class="ti ti-calendar"></i>
					{{ formatDate(event.startAt) }}
					<span :class="[$style.statusBadge, $style['status_' + event.status]]">
						{{ i18n.ts._events[event.status] }}
					</span>
				</div>
				<div :class="$style.eventTitle">{{ event.title }}</div>
			</div>
		</div>

	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
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

// Current month boundaries for calendar event fetching
const monthStart = ref<number>(0);
const monthEnd = ref<number>(0);

function onMonthChange(year: number, month: number) {
	const start = new Date(year, month, 1);
	const end = new Date(year, month + 1, 0, 23, 59, 59);
	monthStart.value = start.getTime();
	monthEnd.value = end.getTime();
	fetchEvents();
}

async function fetchEvents() {
	try {
		const res = await misskeyApi('events/list', {
			limit: 100,
			sinceDate: monthStart.value,
			untilDate: monthEnd.value,
		});
		approvedEvents.value = res;
	} catch (e) {
		console.error(e);
	}
}

async function fetchMyEvents() {
	if (!$i) return;
	try {
		const res = await misskeyApi('events/my-submissions', {
			limit: 50,
		});
		myEvents.value = res;
	} catch (e) {
		console.error(e);
	}
}

const calendarEvents = computed(() => {
	return approvedEvents.value.map(ev => ({
		title: ev.title,
		startAt: ev.startAt,
		endAt: ev.endAt,
		color: ev.color,
	}));
});

function toLocalDateStr(dateStr: string): string {
	const d = new Date(dateStr);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const filteredEvents = computed(() => {
	if (!selectedDate.value) return approvedEvents.value;
	return approvedEvents.value.filter(ev => {
		const startDate = toLocalDateStr(ev.startAt);
		const endDate = ev.endAt ? toLocalDateStr(ev.endAt) : startDate;
		return selectedDate.value! >= startDate && selectedDate.value! <= endDate;
	});
});

function formatDate(dateStr: string): string {
	const d = new Date(dateStr);
	return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function showEvent(eventId: string) {
	router.push('/events/:eventId', { params: { eventId } });
}

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

onMounted(() => {
	fetchEvents();
	if ($i) fetchMyEvents();
});

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
