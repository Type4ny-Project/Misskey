<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.header">
		<div :class="$style.headerNav">
			<MkButton :class="$style.navBtn" class="_button" @click="prevPeriod">
				<i class="ti ti-chevron-left"></i>
			</MkButton>
			<MkButton ref="monthLabelEl" :class="$style.monthLabel" class="_button" @click="showMonthPicker">
				{{ currentRangeLabel }}
			</MkButton>
			<MkButton :class="$style.navBtn" class="_button" @click="nextPeriod">
				<i class="ti ti-chevron-right"></i>
			</MkButton>
		</div>

		<div :class="$style.viewSwitcher">
			<MkButton
				v-for="viewOption in viewOptions"
				:key="viewOption.key"
				:class="[$style.viewButton, { [$style.viewButtonActive]: view === viewOption.key }]"
				class="_button"
				@click="changeView(viewOption.key)"
			>
				<i :class="viewOption.icon"></i>
				<span>{{ viewOption.label }}</span>
			</MkButton>
		</div>
	</div>

	<template v-if="view === 'month'">
		<div :class="$style.weekdays">
			<div v-for="day in weekdays" :key="day" :class="$style.weekday">{{ day }}</div>
		</div>
		<div :class="$style.weeks">
			<div
				v-for="week in calendarWeeks"
				:key="week.key"
				:class="$style.weekRow"
				:style="{
					'--all-day-height': `${week.allDayHeight}px`,
					'--timed-events-offset': `${week.timedEventsOffset}px`,
				}"
			>
				<div :class="$style.weekGrid">
					<div
						v-for="(cell, cellIndex) in week.cells"
						:key="cell.key"
						:ref="cellIndex === 0 ? (el) => setWeekCellRef(week.key, el) : undefined"
						:style="{
							'--cell-all-day-height': `${cell.allDayHeight}px`,
							'--cell-timed-events-offset': `${cell.timedEventsOffset}px`,
						}"
						:class="[
							$style.cell,
							{ [$style.otherMonth]: !cell.isCurrentMonth },
							{ [$style.today]: cell.isToday },
							{ [$style.selected]: cell.isSelected },
						]"
						@click="onMonthCellClick(cell, $event)"
					>
						<span :class="$style.cellDate">{{ cell.day }}</span>
						<div :class="$style.cellBody">
							<div v-if="cell.timedEvents.length > 0 || cell.moreCount > 0" :class="$style.timedEvents">
								<button
									v-for="timedEvent in cell.timedEvents"
									:key="timedEvent.key"
									:class="$style.timedEvent"
									class="_button"
									@click.stop="showEventPopover(timedEvent.sourceEvent, $event)"
								>
									<span :class="$style.timedEventDot" :style="{ backgroundColor: timedEvent.color }"></span>
									<span :class="$style.timedEventLabel">{{ timedEvent.title }}</span>
								</button>
								<button v-if="cell.moreCount > 0" class="_button" :class="$style.moreEvents" @click.stop="showMorePopover(cell.date, cell.hiddenEvents, $event)">{{ formatMoreEventsLabel(cell.moreCount) }}</button>
							</div>
						</div>
					</div>
				</div>
				<div v-if="week.bars.length > 0" :class="$style.weekBars">
					<button
						v-for="bar in week.bars"
						:key="bar.key"
						:class="[
							$style.eventBar,
							{ [$style.startCap]: bar.startsInWeek },
							{ [$style.endCap]: bar.endsInWeek },
						]"
						class="_button"
						:style="{
							left: `calc(${(bar.startIndex / 7) * 100}% + ${bar.startsInWeek ? 3 : 0}px)`,
							width: `calc(${((bar.endIndex - bar.startIndex + 1) / 7) * 100}% - ${(bar.startsInWeek ? 3 : 0) + (bar.endsInWeek ? 3 : 0)}px)`,
							top: `${bar.lane * EVENT_BAR_HEIGHT}px`,
							backgroundColor: bar.color,
							color: bar.textColor,
						}"
						@click.stop="showEventPopover(bar.sourceEvent, $event)"
					>
						<span v-if="bar.title" :class="$style.eventBarLabel">{{ bar.title }}</span>
					</button>
				</div>
			</div>
		</div>
	</template>

	<div v-else-if="view === 'week'" :class="$style.weekViewScroller">
		<div :class="$style.weekView">
			<div
				v-for="day in weekViewDays"
				:key="day.key"
				:class="[$style.weekColumn, { [$style.weekColumnSelected]: day.isSelected }]"
			>
				<div :class="[$style.weekColumnHeader, { [$style.todayHeader]: day.isToday }]">
					<span :class="$style.weekColumnWeekday">{{ day.weekday }}</span>
					<span :class="$style.weekColumnDate">{{ day.day }}</span>
				</div>
				<div :class="$style.weekColumnBody">
					<div v-if="day.events.length === 0" :class="$style.weekEmpty">{{ i18n.ts._events.noEvents }}</div>
					<button
						v-for="event in day.events"
						:key="event.key"
						:class="[$style.weekEvent, { [$style.weekEventAllDay]: event.isAllDayLike }]"
						class="_button"
						@click.stop="showEventPopover(event.sourceEvent, $event)"
					>
						<div :class="$style.weekEventTime">{{ event.timeLabel }}</div>
						<div :class="$style.weekEventTitle">{{ event.title }}</div>
					</button>
				</div>
			</div>
		</div>
	</div>

	<div v-else :class="$style.scheduleView">
		<div
			v-for="day in weekViewDays"
			:key="day.key"
			:class="[$style.scheduleDay, { [$style.scheduleDaySelected]: day.isSelected }]"
		>
			<div :class="[$style.scheduleDayHeader, { [$style.todayHeader]: day.isToday }]">
				<span :class="$style.scheduleDayWeekday">{{ day.weekdayFull }}</span>
				<span :class="$style.scheduleDayDate">{{ formatScheduleDate(day.date) }}</span>
			</div>
			<div :class="$style.scheduleDayBody">
				<div v-if="day.events.length === 0" :class="$style.scheduleEmpty">{{ i18n.ts._events.noEvents }}</div>
				<button
					v-for="event in day.events"
					:key="event.key"
					:class="[$style.scheduleEvent, { [$style.scheduleEventAllDay]: event.isAllDayLike }]"
					class="_button"
					:style="{ borderLeftColor: event.color }"
					@click.stop="showEventPopover(event.sourceEvent, $event)"
				>
					<div :class="$style.scheduleEventTime">{{ event.timeLabel }}</div>
					<div :class="$style.scheduleEventMain">
						<div :class="$style.scheduleEventTitle">{{ event.title }}</div>
						<div v-if="event.durationLabel" :class="$style.scheduleEventDuration">{{ event.durationLabel }}</div>
					</div>
				</button>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { lang } from '@@/js/config.js';
import type { ComponentPublicInstance } from 'vue';
import MkEventCalendarMonthPicker from '@/components/MkEventCalendarMonthPicker.vue';
import MkEventCalendarPopover from '@/components/MkEventCalendarPopover.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import MkButton from '@/components/MkButton.vue';

type CalendarView = 'month' | 'week' | 'schedule';
type CalendarEvent = {
	id?: string;
	title?: string;
	description?: string | null;
	startAt: string;
	endAt?: string | null;
	color?: string | null;
	channelName?: string | null;
	tags?: string[] | null;
};

type CalendarRange = {
	startAt: number;
	endAt: number;
	view: CalendarView;
};

const props = withDefaults(defineProps<{
	selectedDate?: string | null;
	events?: CalendarEvent[];
	defaultView?: CalendarView;
	allowCreate?: boolean;
	defaultChannelId?: string | null;
	defaultChannelName?: string | null;
}>(), {
	selectedDate: null,
	events: () => [],
	defaultView: 'month',
	allowCreate: false,
	defaultChannelId: null,
	defaultChannelName: null,
});

const emit = defineEmits<{
	(ev: 'update:selectedDate', date: string | null): void;
	(ev: 'rangeChange', range: CalendarRange): void;
	(ev: 'eventCreated'): void;
}>();

const EVENT_BAR_HEIGHT = 18;
const EVENT_ITEM_HEIGHT = 20;
const EVENT_ITEM_GAP = 3;
const EVENT_BAR_BOTTOM_PADDING = 2;
const EVENT_AREA_TOP_OFFSET = 36;
const TIMED_EVENTS_LAYOUT_OFFSET_WITH_BARS = 10;
const TIMED_EVENTS_LAYOUT_OFFSET_WITHOUT_BARS = 5;
const TIMED_EVENTS_CAPACITY_OFFSET_WITH_BARS = 12;
const TIMED_EVENTS_CAPACITY_OFFSET_WITHOUT_BARS = 2;
const DEFAULT_CELL_MIN_HEIGHT = 124;
const DEFAULT_CELL_PADDING_BOTTOM = 6;

const isJapaneseLanguage = lang.startsWith('ja');
const todayDateStr = formatDateStr(new Date());
const defaultWeekEventAreaHeight = DEFAULT_CELL_MIN_HEIGHT - EVENT_AREA_TOP_OFFSET - DEFAULT_CELL_PADDING_BOTTOM;

const defaultBarColor = ref('#3b82f6');
const activeDate = ref(todayDateStr);
const currentYear = ref(parseDateStr(todayDateStr).getFullYear());
const currentMonth = ref(parseDateStr(todayDateStr).getMonth());
const view = ref<CalendarView>('month');
const monthLabelEl = useTemplateRef('monthLabelEl');

const weekEventAreaHeights = ref<Record<string, number>>({});
const weekCellElements = new Map<string, HTMLElement>();
const observedWeekCellElements = new Map<string, HTMLElement>();

let weekCellResizeObserver: ResizeObserver | null = null;

const weekdays = computed(() => [
	i18n.ts._events.sun,
	i18n.ts._events.mon,
	i18n.ts._events.tue,
	i18n.ts._events.wed,
	i18n.ts._events.thu,
	i18n.ts._events.fri,
	i18n.ts._events.sat,
]);

const weekdayLabels = computed(() => [
	i18n.ts._weekday.sunday,
	i18n.ts._weekday.monday,
	i18n.ts._weekday.tuesday,
	i18n.ts._weekday.wednesday,
	i18n.ts._weekday.thursday,
	i18n.ts._weekday.friday,
	i18n.ts._weekday.saturday,
]);

const viewOptions = computed(() => [
	{ key: 'month' as const, label: isJapaneseLanguage ? '月' : 'Month', icon: 'ti ti-layout-grid' },
	{ key: 'week' as const, label: isJapaneseLanguage ? '週' : 'Week', icon: 'ti ti-columns-3' },
	{ key: 'schedule' as const, label: isJapaneseLanguage ? '予定' : 'Schedule', icon: 'ti ti-list' },
]);

function parseDateStr(dateStr: string): Date {
	const [year, month, day] = dateStr.split('-').map(Number);
	return new Date(year, month - 1, day);
}

function formatDateStr(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
	const date = parseDateStr(dateStr);
	date.setDate(date.getDate() + days);
	return formatDateStr(date);
}

function startOfWeek(dateStr: string): string {
	const date = parseDateStr(dateStr);
	return addDays(dateStr, -date.getDay());
}

function endOfWeek(dateStr: string): string {
	return addDays(startOfWeek(dateStr), 6);
}

function diffDays(from: string, to: string): number {
	return Math.round((parseDateStr(to).getTime() - parseDateStr(from).getTime()) / 86400000);
}

function toLocalDateStr(isoStr: string): string {
	return formatDateStr(new Date(isoStr));
}

function formatDateTime(dateStr: string): string {
	const date = new Date(dateStr);
	return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatScheduleDate(dateStr: string): string {
	const date = parseDateStr(dateStr);
	return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function setActiveDate(dateStr: string): void {
	activeDate.value = dateStr;
	const date = parseDateStr(dateStr);
	currentYear.value = date.getFullYear();
	currentMonth.value = date.getMonth();
}

function setDisplayedMonth(year: number, month: number): void {
	const date = new Date(year, month, 1);
	currentYear.value = date.getFullYear();
	currentMonth.value = date.getMonth();
	activeDate.value = formatDateStr(date);
}

function formatRangeLabel(from: string, to: string): string {
	const fromDate = parseDateStr(from);
	const toDate = parseDateStr(to);

	if (fromDate.getFullYear() === toDate.getFullYear()) {
		if (fromDate.getMonth() === toDate.getMonth()) {
			return `${fromDate.getFullYear()}${i18n.ts._events.year || '年'} ${fromDate.getMonth() + 1}${i18n.ts._events.month || '月'} ${fromDate.getDate()}-${toDate.getDate()}`;
		}

		return `${fromDate.getFullYear()}${i18n.ts._events.year || '年'} ${fromDate.getMonth() + 1}${i18n.ts._events.month || '月'} ${fromDate.getDate()} - ${toDate.getMonth() + 1}${i18n.ts._events.month || '月'} ${toDate.getDate()}`;
	}

	return `${fromDate.getFullYear()}/${fromDate.getMonth() + 1}/${fromDate.getDate()} - ${toDate.getFullYear()}/${toDate.getMonth() + 1}/${toDate.getDate()}`;
}

function formatMoreEventsLabel(count: number): string {
	return isJapaneseLanguage ? `他${count}件` : `+${count}`;
}

function isMidnight(date: Date): boolean {
	return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
}

function isAllDayEvent(event: CalendarEvent): boolean {
	const start = new Date(event.startAt);
	const end = event.endAt ? new Date(event.endAt) : null;
	if (!isMidnight(start)) return false;
	if (end == null) return true;
	return isMidnight(end);
}

function isBarEvent(event: CalendarEvent): boolean {
	if (isAllDayEvent(event)) return true;
	if (!event.endAt) return false;
	return toLocalDateStr(event.startAt) !== toLocalDateStr(event.endAt);
}

function getEventColor(event: CalendarEvent): string {
	return event.color ?? defaultBarColor.value;
}

function getContrastTextColor(color: string): '#000000' | '#ffffff' {
	const normalized = color.trim();
	const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;
	if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff';

	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

	return luminance > 0.62 ? '#000000' : '#ffffff';
}

function getTimeLabel(event: CalendarEvent, dayDate: string): string {
	const startDate = toLocalDateStr(event.startAt);
	const endDate = event.endAt ? toLocalDateStr(event.endAt) : startDate;

	if (isAllDayEvent(event)) {
		return i18n.ts.all;
	}

	if (startDate !== endDate) {
		if (startDate < dayDate && endDate > dayDate) return i18n.ts.all;
		if (startDate < dayDate) return `~ ${formatDateTime(event.endAt ?? event.startAt)}`;
		if (endDate > dayDate) return `${formatDateTime(event.startAt)} ~`;
	}

	if (event.endAt && startDate === endDate) {
		return `${formatDateTime(event.startAt)} - ${formatDateTime(event.endAt)}`;
	}

	return formatDateTime(event.startAt);
}

function getDurationLabel(event: CalendarEvent): string | null {
	if (!event.endAt) return null;
	if (toLocalDateStr(event.startAt) !== toLocalDateStr(event.endAt)) return null;

	const duration = Math.max(0, new Date(event.endAt).getTime() - new Date(event.startAt).getTime());
	const hours = Math.floor(duration / 3600000);
	const minutes = Math.floor((duration % 3600000) / 60000);

	if (hours === 0 && minutes === 0) return null;
	if (hours === 0) return `${minutes}m`;
	if (minutes === 0) return `${hours}h`;
	return `${hours}h ${minutes}m`;
}

function showEventPopover(event: CalendarEvent, domEvent: MouseEvent): void {
	const anchorElement = createPointAnchor(domEvent.clientX, domEvent.clientY);

	const { dispose } = os.popup(MkEventCalendarPopover, {
		event: {
			id: event.id,
			title: event.title ?? '',
			description: event.description ?? null,
			timeLabel: getTimeLabel(event, toLocalDateStr(event.startAt)),
			durationLabel: getDurationLabel(event),
			channelName: event.channelName ?? null,
			tags: event.tags ?? null,
		},
		anchorElement,
	}, {
		closed: () => {
			dispose();
			anchorElement.remove();
		},
	});
}

function toPopoverEvent(event: CalendarEvent, dayDate: string) {
	return {
		id: event.id,
		title: event.title ?? '',
		description: event.description ?? null,
		timeLabel: getTimeLabel(event, dayDate),
		durationLabel: getDurationLabel(event),
		channelName: event.channelName ?? null,
		tags: event.tags ?? null,
	};
}

function showMorePopover(date: string, hiddenSourceEvents: CalendarEvent[], domEvent: MouseEvent): void {
	const anchorElement = createPointAnchor(domEvent.clientX, domEvent.clientY);

	const hiddenEvents = hiddenSourceEvents
		.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
		.map(event => toPopoverEvent(event, date));

	const { dispose } = os.popup(MkEventCalendarPopover, {
		event: hiddenEvents[0] ?? {
			title: '',
			timeLabel: '',
		},
		events: hiddenEvents,
		title: `${formatScheduleDate(date)} ${formatMoreEventsLabel(hiddenEvents.length)}`,
		anchorElement,
	}, {
		closed: () => {
			dispose();
			anchorElement.remove();
		},
	});
}

function showCreatePopover(date: string, domEvent: MouseEvent): void {
	const anchorElement = createPointAnchor(domEvent.clientX, domEvent.clientY);

	const { dispose } = os.popup(MkEventCalendarPopover, {
		event: {
			title: '',
			timeLabel: formatScheduleDate(date),
		},
		title: formatScheduleDate(date),
		createForm: {
			date,
			defaultChannelId: props.defaultChannelId,
			defaultChannelName: props.defaultChannelName,
		},
		anchorElement,
	}, {
		created: () => emit('eventCreated'),
		closed: () => {
			dispose();
			anchorElement.remove();
		},
	});
}

function onMonthCellClick(cell: { date: string; timedEvents: unknown[]; moreCount: number; }, domEvent: MouseEvent): void {
	if (!props.allowCreate) return;
	const target = domEvent.target;
	if (!(target instanceof HTMLElement)) return;
	if (target.closest('button')) return;
	showCreatePopover(cell.date, domEvent);
}

function createPointAnchor(clientX: number, clientY: number): HTMLElement {
	const anchorElement = window.document.createElement('div');
	anchorElement.style.position = 'fixed';
	anchorElement.style.left = `${clientX}px`;
	anchorElement.style.top = `${clientY}px`;
	anchorElement.style.width = '1px';
	anchorElement.style.height = '1px';
	anchorElement.style.pointerEvents = 'none';
	window.document.body.appendChild(anchorElement);
	return anchorElement;
}

function changeView(nextView: CalendarView): void {
	view.value = nextView;
	if (props.selectedDate != null) {
		setActiveDate(props.selectedDate);
	}
}

function setWeekCellRef(weekKey: string, element: Element | ComponentPublicInstance | null): void {
	if (!(element instanceof HTMLElement)) {
		weekCellElements.delete(weekKey);
		return;
	}

	weekCellElements.set(weekKey, element);
}

function measureWeekEventAreaHeight(element: HTMLElement): number {
	const style = window.getComputedStyle(element);
	const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
	return Math.max(0, element.clientHeight - EVENT_AREA_TOP_OFFSET - paddingBottom);
}

function measureWeekEventAreaHeights(): void {
	const nextHeights: Record<string, number> = {};

	for (const [weekKey, element] of weekCellElements) {
		nextHeights[weekKey] = measureWeekEventAreaHeight(element);
	}

	const currentKeys = Object.keys(weekEventAreaHeights.value);
	const nextKeys = Object.keys(nextHeights);
	const changed = currentKeys.length !== nextKeys.length || nextKeys.some(key => weekEventAreaHeights.value[key] !== nextHeights[key]);

	if (changed) {
		weekEventAreaHeights.value = nextHeights;
	}
}

function syncWeekCellObservers(): void {
	if (weekCellResizeObserver == null) return;

	for (const [weekKey, element] of observedWeekCellElements) {
		if (weekCellElements.get(weekKey) === element) continue;
		weekCellResizeObserver.unobserve(element);
		observedWeekCellElements.delete(weekKey);
	}

	for (const [weekKey, element] of weekCellElements) {
		if (observedWeekCellElements.get(weekKey) === element) continue;
		const previousElement = observedWeekCellElements.get(weekKey);
		if (previousElement != null) {
			weekCellResizeObserver.unobserve(previousElement);
		}
		weekCellResizeObserver.observe(element);
		observedWeekCellElements.set(weekKey, element);
	}
}

const visibleRange = computed<CalendarRange & { startDate: string; endDate: string }>(() => {
	if (view.value === 'month') {
		const start = new Date(currentYear.value, currentMonth.value, 1, 0, 0, 0, 0);
		const end = new Date(currentYear.value, currentMonth.value + 1, 0, 23, 59, 59, 999);
		return {
			startDate: formatDateStr(start),
			endDate: formatDateStr(end),
			startAt: start.getTime(),
			endAt: end.getTime(),
			view: view.value,
		};
	}

	const startDate = startOfWeek(activeDate.value);
	const endDate = endOfWeek(activeDate.value);
	const start = parseDateStr(startDate);
	const end = parseDateStr(endDate);
	start.setHours(0, 0, 0, 0);
	end.setHours(23, 59, 59, 999);

	return {
		startDate,
		endDate,
		startAt: start.getTime(),
		endAt: end.getTime(),
		view: view.value,
	};
});

const currentRangeLabel = computed(() => {
	if (view.value === 'month') {
		return `${currentYear.value}${i18n.ts._events.year || '年'} ${currentMonth.value + 1}${i18n.ts._events.month || '月'}`;
	}

	return formatRangeLabel(visibleRange.value.startDate, visibleRange.value.endDate);
});

const weekViewDays = computed(() => {
	return Array.from({ length: 7 }, (_, index) => {
		const date = addDays(visibleRange.value.startDate, index);
		const dayDate = parseDateStr(date);
		const events = props.events
			.filter(event => {
				const start = toLocalDateStr(event.startAt);
				const end = event.endAt ? toLocalDateStr(event.endAt) : start;
				return date >= start && date <= end;
			})
			.map((event, eventIndex) => ({
				key: `${eventIndex}:${date}:${event.startAt}`,
				title: event.title ?? '',
				color: getEventColor(event),
				timeLabel: getTimeLabel(event, date),
				durationLabel: getDurationLabel(event),
				isAllDayLike: isAllDayEvent(event) || isBarEvent(event),
				startAt: event.startAt,
				sourceEvent: event,
			}))
			.sort((a, b) => {
				if (a.isAllDayLike !== b.isAllDayLike) {
					return a.isAllDayLike ? -1 : 1;
				}
				return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
			});

		return {
			key: date,
			date,
			day: dayDate.getDate(),
			weekday: weekdays.value[dayDate.getDay()],
			weekdayFull: weekdayLabels.value[dayDate.getDay()],
			isToday: date === todayDateStr,
			isSelected: props.selectedDate === date,
			events,
		};
	});
});

const calendarCells = computed(() => {
	const firstDay = new Date(currentYear.value, currentMonth.value, 1);
	const startDayOfWeek = firstDay.getDay();
	const daysInMonth = new Date(currentYear.value, currentMonth.value + 1, 0).getDate();
	const selectedStr = props.selectedDate;

	const cells: {
		key: string;
		date: string;
		day: number;
		isCurrentMonth: boolean;
		isToday: boolean;
		isSelected: boolean;
	}[] = [];

	const prevMonthDays = new Date(currentYear.value, currentMonth.value, 0).getDate();
	for (let index = startDayOfWeek - 1; index >= 0; index--) {
		const date = new Date(currentYear.value, currentMonth.value - 1, prevMonthDays - index);
		const dateStr = formatDateStr(date);
		cells.push({
			key: dateStr,
			date: dateStr,
			day: prevMonthDays - index,
			isCurrentMonth: false,
			isToday: dateStr === todayDateStr,
			isSelected: dateStr === selectedStr,
		});
	}

	for (let day = 1; day <= daysInMonth; day++) {
		const date = new Date(currentYear.value, currentMonth.value, day);
		const dateStr = formatDateStr(date);
		cells.push({
			key: dateStr,
			date: dateStr,
			day,
			isCurrentMonth: true,
			isToday: dateStr === todayDateStr,
			isSelected: dateStr === selectedStr,
		});
	}

	const remaining = 7 - (cells.length % 7);
	if (remaining < 7) {
		for (let day = 1; day <= remaining; day++) {
			const date = new Date(currentYear.value, currentMonth.value + 1, day);
			const dateStr = formatDateStr(date);
			cells.push({
				key: dateStr,
				date: dateStr,
				day,
				isCurrentMonth: false,
				isToday: dateStr === todayDateStr,
				isSelected: dateStr === selectedStr,
			});
		}
	}

	return cells;
});

const calendarWeeks = computed(() => {
	const weeks: {
		key: string;
		cells: Array<typeof calendarCells.value[number] & {
			timedEvents: {
				key: string;
				title: string;
				color: string;
				sourceEvent: CalendarEvent;
			}[];
			moreCount: number;
			hiddenEvents: CalendarEvent[];
			allDayHeight: number;
			timedEventsOffset: number;
		}>;
		bars: {
			key: string;
			title: string;
			startIndex: number;
			endIndex: number;
			lane: number;
			startsInWeek: boolean;
			endsInWeek: boolean;
			color: string;
			textColor: '#000000' | '#ffffff';
			sourceEvent: CalendarEvent;
		}[];
		allDayHeight: number;
		timedEventsOffset: number;
	}[] = [];

	for (let index = 0; index < calendarCells.value.length; index += 7) {
		const cells = calendarCells.value.slice(index, index + 7);
		const weekStart = cells[0].date;
		const weekEnd = cells[6].date;

		const allDaySegments = props.events
			.map((event, eventIndex) => {
				if (!isBarEvent(event)) return null;

				const start = toLocalDateStr(event.startAt);
				const end = event.endAt ? toLocalDateStr(event.endAt) : start;
				if (end < weekStart || start > weekEnd) return null;

				const startIndex = Math.max(0, diffDays(weekStart, start));
				const endIndex = Math.min(6, diffDays(weekStart, end));
				if (endIndex < startIndex) return null;

				const color = getEventColor(event);
				return {
					key: `${eventIndex}:${start}:${end}:${weekStart}`,
					title: event.title ?? '',
					startIndex,
					endIndex,
					startsInWeek: start >= weekStart,
					endsInWeek: end <= weekEnd,
					color,
					textColor: getContrastTextColor(color),
					sourceEvent: event,
				};
			})
			.filter((segment): segment is NonNullable<typeof segment> => segment != null)
			.sort((a, b) => {
				if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
				return (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex);
			});

		const laneEnds: number[] = [];
		const bars = allDaySegments.map(segment => {
			let lane = 0;
			while (lane < laneEnds.length && laneEnds[lane] >= segment.startIndex) {
				lane++;
			}
			laneEnds[lane] = segment.endIndex;
			return { ...segment, lane };
		});

		const timedEventsByDate = new Map<string, {
			key: string;
			title: string;
			color: string;
			startAt: string;
			sourceEvent: CalendarEvent;
		}[]>();

		for (const cell of cells) {
			timedEventsByDate.set(cell.date, []);
		}

		for (const [eventIndex, event] of props.events.entries()) {
			if (isBarEvent(event)) continue;

			const start = toLocalDateStr(event.startAt);
			const end = event.endAt ? toLocalDateStr(event.endAt) : start;
			const color = getEventColor(event);

			for (const cell of cells) {
				if (cell.date < start || cell.date > end) continue;
				const list = timedEventsByDate.get(cell.date);
				if (!list) continue;
				list.push({
					key: `${eventIndex}:${cell.date}:${event.startAt}`,
					title: event.title ?? '',
					color,
					startAt: event.startAt,
					sourceEvent: event,
				});
			}
		}

		const eventAreaHeight = weekEventAreaHeights.value[weekStart] ?? defaultWeekEventAreaHeight;
		const visibleLaneCount = Math.min(
			laneEnds.length,
			Math.max(0, Math.floor((eventAreaHeight - EVENT_BAR_BOTTOM_PADDING) / EVENT_BAR_HEIGHT)),
		);
		const visibleBars = bars.filter(bar => bar.lane < visibleLaneCount);
		const visibleBarCountsByDate = new Map<string, number>();
		const hiddenBarCountsByDate = new Map<string, number>();
		const hiddenBarEventsByDate = new Map<string, CalendarEvent[]>();

		for (const cell of cells) {
			visibleBarCountsByDate.set(cell.date, 0);
			hiddenBarCountsByDate.set(cell.date, 0);
			hiddenBarEventsByDate.set(cell.date, []);
		}

		for (const bar of visibleBars) {
			for (let dateIndex = bar.startIndex; dateIndex <= bar.endIndex; dateIndex++) {
				const date = cells[dateIndex].date;
				visibleBarCountsByDate.set(date, (visibleBarCountsByDate.get(date) ?? 0) + 1);
			}
		}

		for (const bar of bars) {
			if (bar.lane < visibleLaneCount) continue;
			for (let dateIndex = bar.startIndex; dateIndex <= bar.endIndex; dateIndex++) {
				const date = cells[dateIndex].date;
				hiddenBarCountsByDate.set(date, (hiddenBarCountsByDate.get(date) ?? 0) + 1);
				hiddenBarEventsByDate.get(date)?.push(bar.sourceEvent);
			}
		}

		const cellsWithTimedEvents = cells.map(cell => {
			const timedEvents = (timedEventsByDate.get(cell.date) ?? [])
				.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
			const visibleBarCount = visibleBarCountsByDate.get(cell.date) ?? 0;
			const timedEventsOffset = visibleBarCount > 0 ? TIMED_EVENTS_LAYOUT_OFFSET_WITH_BARS : TIMED_EVENTS_LAYOUT_OFFSET_WITHOUT_BARS;
			const timedEventsCapacityOffset = visibleBarCount > 0 ? TIMED_EVENTS_CAPACITY_OFFSET_WITH_BARS : TIMED_EVENTS_CAPACITY_OFFSET_WITHOUT_BARS;
			const availableTimedContentHeight = eventAreaHeight
				- (visibleBarCount > 0 ? visibleBarCount * EVENT_BAR_HEIGHT + EVENT_BAR_BOTTOM_PADDING : 0)
				- timedEventsCapacityOffset;
			const visibleTimedRowsBase = Math.max(0, Math.floor((availableTimedContentHeight + EVENT_ITEM_GAP) / (EVENT_ITEM_HEIGHT + EVENT_ITEM_GAP)));
			const hiddenBarCount = hiddenBarCountsByDate.get(cell.date) ?? 0;
			const needsMoreLabel = hiddenBarCount > 0 || timedEvents.length > visibleTimedRowsBase;
			const visibleTimedEventLimit = needsMoreLabel ? Math.max(0, visibleTimedRowsBase - 1) : visibleTimedRowsBase;
			const hiddenTimedEventCount = Math.max(0, timedEvents.length - visibleTimedEventLimit);
			const hiddenEvents = [
				...(hiddenBarEventsByDate.get(cell.date) ?? []),
				...timedEvents.slice(visibleTimedEventLimit).map(timedEvent => timedEvent.sourceEvent),
			];

			return {
				...cell,
				timedEvents: timedEvents
					.slice(0, visibleTimedEventLimit)
					.map(({ key, title, color, sourceEvent }) => ({ key, title, color, sourceEvent })),
				moreCount: hiddenBarCount + hiddenTimedEventCount,
				hiddenEvents,
				allDayHeight: visibleBarCount > 0 ? visibleBarCount * EVENT_BAR_HEIGHT + EVENT_BAR_BOTTOM_PADDING : 0,
				timedEventsOffset,
			};
		});

		weeks.push({
			key: weekStart,
			cells: cellsWithTimedEvents,
			bars: visibleBars,
			allDayHeight: visibleBars.length > 0 ? visibleLaneCount * EVENT_BAR_HEIGHT + EVENT_BAR_BOTTOM_PADDING : 0,
			timedEventsOffset: visibleLaneCount > 0 ? TIMED_EVENTS_LAYOUT_OFFSET_WITH_BARS : TIMED_EVENTS_LAYOUT_OFFSET_WITHOUT_BARS,
		});
	}

	return weeks;
});

function prevPeriod(): void {
	if (view.value === 'month') {
		setDisplayedMonth(currentMonth.value === 0 ? currentYear.value - 1 : currentYear.value, currentMonth.value === 0 ? 11 : currentMonth.value - 1);
		return;
	}

	setActiveDate(addDays(activeDate.value, -7));
}

function nextPeriod(): void {
	if (view.value === 'month') {
		setDisplayedMonth(currentMonth.value === 11 ? currentYear.value + 1 : currentYear.value, currentMonth.value === 11 ? 0 : currentMonth.value + 1);
		return;
	}

	setActiveDate(addDays(activeDate.value, 7));
}

function goToday(): void {
	setActiveDate(todayDateStr);
	if (view.value !== 'month') {
		emit('update:selectedDate', todayDateStr);
	}
}

async function showMonthPicker(): Promise<void> {
	const anchor = monthLabelEl.value?.$el;
	if (!(anchor instanceof HTMLElement)) return;

	const { dispose } = os.popup(MkEventCalendarMonthPicker, {
		anchorElement: anchor,
		year: currentYear.value,
		currentMonth: currentMonth.value,
	}, {
		select: ({ year, month }: { year: number; month: number }) => {
			setDisplayedMonth(year, month);
		},
		closed: () => {
			dispose();
		},
	});
}

watch(() => props.defaultView, (value) => {
	view.value = value;
}, { immediate: true });

watch(() => props.selectedDate, (date) => {
	if (date != null) {
		setActiveDate(date);
	}
}, { immediate: true });

watch(visibleRange, (range) => {
	emit('rangeChange', {
		startAt: range.startAt,
		endAt: range.endAt,
		view: range.view,
	});
}, { immediate: true });

watch(() => view.value === 'month' ? calendarWeeks.value.map(week => week.key).join(',') : '', async () => {
	await nextTick();
	syncWeekCellObservers();
	measureWeekEventAreaHeights();
}, { immediate: true });

onMounted(() => {
	const accent = window.getComputedStyle(window.document.documentElement).getPropertyValue('--MI_THEME-accent').trim();
	if (accent) {
		defaultBarColor.value = accent;
	}

	weekCellResizeObserver = new ResizeObserver(() => {
		measureWeekEventAreaHeights();
	});

	syncWeekCellObservers();
	measureWeekEventAreaHeights();
});

onBeforeUnmount(() => {
	weekCellResizeObserver?.disconnect();
	weekCellResizeObserver = null;
	observedWeekCellElements.clear();
	weekCellElements.clear();
});
</script>

<style lang="scss" module>
.root {
	background: var(--MI_THEME-panel);
	border-radius: 16px;
	padding: 16px;
	user-select: none;
	overflow: hidden;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 12px;
	flex-wrap: wrap;
}

.headerNav {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.navBtn {
	padding: 8px;
	border-radius: 8px;
	color: var(--MI_THEME-fg);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.monthLabel {
	font-size: 1.05em;
	font-weight: 700;
	color: var(--MI_THEME-fg);
	padding: 4px 12px;
	border-radius: 8px;
	white-space: nowrap;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.viewSwitcher {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 6%, transparent);
}

.viewButton {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 32px;
	padding: 0 12px;
	border-radius: 999px;
	font-size: 0.85em;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparent);

	&:hover {
		color: var(--MI_THEME-fg);
	}
}

.viewButtonActive {
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
}

.weekdays {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	margin-bottom: 0;
	padding-bottom: 6px;
}

.weekday {
	text-align: left;
	font-size: 0.75em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparent);
	padding: 4px 10px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.weeks {
	display: flex;
	flex-direction: column;
	gap: 0;
	border-top: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
}

.weekRow {
	position: relative;
	border-bottom: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
}

.weekGrid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 0;
}

.cell {
	min-height: 124px;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	justify-content: flex-start;
	border-radius: 0;
	padding: 8px 8px 6px;
	position: relative;
	cursor: default;
	transition: background 0.15s;
	border-right: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);

	&:last-child {
		border-right: none;
	}
}

.cellBody {
	width: 100%;
	flex: 1;
	padding-top: calc(var(--cell-all-day-height) + var(--cell-timed-events-offset));
	min-height: 0;
}

.timedEvents {
	display: flex;
	flex-direction: column;
	gap: 3px;
	width: 100%;
	padding-right: 2px;
}

.timedEvent {
	display: flex;
	align-items: center;
	gap: 6px;
	width: 100%;
	min-height: 20px;
	min-width: 0;
	padding: 0 4px 0 0;
	box-sizing: border-box;
	font-size: 11px;
	font-weight: 700;
	line-height: 20px;
	color: var(--MI_THEME-fg);
	text-align: left;
	border-radius: 6px;
	cursor: pointer;
	transition: background-color 0.12s ease;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	}
}

.timedEventDot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	flex-shrink: 0;
	margin-left: 2px;
}

.timedEventLabel {
	min-width: 0;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.moreEvents {
	display: inline-flex;
	align-items: center;
	width: 100%;
	min-height: 20px;
	font-size: 11px;
	font-weight: 700;
	line-height: 20px;
	color: var(--MI_THEME-fgTransparent);
	padding-left: 15px;
	padding-right: 4px;
	padding-top: 0;
	padding-bottom: 0;
	box-sizing: border-box;
	white-space: nowrap;
	overflow: visible;
	text-overflow: clip;
	text-align: left;

	/* no hover highlight */
}

.otherMonth {
	background: color-mix(in srgb, var(--MI_THEME-bg) 55%, transparent);

	.cellDate {
		color: var(--MI_THEME-fgTransparent);
	}
}

.today {
	.cellDate {
		background: var(--MI_THEME-accent);
		color: var(--MI_THEME-fgOnAccent);
		border-radius: 50%;
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-left: 0;
	}
}

.selected {
	background: color-mix(in srgb, var(--MI_THEME-accent) 15%, transparent) !important;
	box-shadow: inset 0 0 0 2px var(--MI_THEME-accent);
}

.cellDate {
	font-size: 0.85em;
	font-weight: 600;
	line-height: 1;
	color: var(--MI_THEME-fg);
	margin-left: 2px;
	flex-shrink: 0;
}

.weekBars {
	position: absolute;
	left: 0;
	right: 0;
	top: 36px;
	height: var(--all-day-height);
	pointer-events: none;
	z-index: 1;
}

.eventBar {
	position: absolute;
	pointer-events: auto;
	height: 14px;
	border-radius: 999px;
	opacity: 0.96;
	display: flex;
	align-items: center;
	padding: 0 5px;
	box-sizing: border-box;
	box-shadow: inset 0 0 0 1px color-mix(in srgb, black 10%, transparent);
	overflow: hidden;
	text-align: left;
	transition: filter 0.15s ease, opacity 0.15s ease;

	&:hover {
		filter: brightness(1.08) saturate(1.05);
		opacity: 1;
	}
}

.eventBarLabel {
	display: block;
	width: 100%;
	font-size: 10px;
	font-weight: 900;
	line-height: 1;
	color: inherit;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.startCap {
	border-top-left-radius: 999px;
	border-bottom-left-radius: 999px;
}

.endCap {
	border-top-right-radius: 999px;
	border-bottom-right-radius: 999px;
}

.weekViewScroller {
	overflow-x: auto;
	padding-bottom: 2px;
}

.weekView {
	display: grid;
	grid-template-columns: repeat(7, minmax(140px, 1fr));
	gap: 12px;
	min-width: 980px;
}

.weekColumn,
.scheduleDay {
	background: color-mix(in srgb, var(--MI_THEME-bg) 45%, transparent);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	border-radius: 14px;
	overflow: hidden;
}

.weekColumnSelected,
.scheduleDaySelected {
	box-shadow: inset 0 0 0 2px var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 9%, transparent);
}

.weekColumnHeader,
.scheduleDayHeader {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px 14px;
	font-weight: 700;
	color: var(--MI_THEME-fg);
	border-bottom: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 6%, transparent);
	}
}

.todayHeader {
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	color: var(--MI_THEME-accent);
}

.weekColumnWeekday,
.scheduleDayWeekday {
	font-size: 0.82em;
	color: var(--MI_THEME-fgTransparent);
	min-width: 0;
}

.todayHeader .weekColumnWeekday,
.todayHeader .scheduleDayWeekday {
	color: inherit;
	opacity: 0.9;
}

.weekColumnDate,
.scheduleDayDate {
	font-size: 0.95em;
	flex-shrink: 0;
	white-space: nowrap;
}

.weekColumnBody,
.scheduleDayBody {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px;
}

.weekEvent,
.scheduleEvent {
	display: flex;
	flex-direction: column;
	gap: 4px;
	width: 100%;
	padding: 10px 12px;
	border-radius: 10px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 82%, transparent);
	text-align: left;
}

.weekEventAllDay,
.scheduleEventAllDay {
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
}

.weekEventTime,
.scheduleEventTime {
	font-size: 0.78em;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparent);
}

.weekEventTitle,
.scheduleEventTitle {
	font-size: 0.93em;
	font-weight: 700;
	color: var(--MI_THEME-fg);
	word-break: break-word;
}

.scheduleEvent {
	flex-direction: row;
	align-items: flex-start;
	gap: 12px;
}

.scheduleEventTime {
	width: 96px;
	flex-shrink: 0;
	padding-top: 1px;
}

.scheduleEventMain {
	min-width: 0;
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.scheduleEventDuration {
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparent);
}

.weekEmpty,
.scheduleEmpty {
	padding: 18px 12px;
	text-align: center;
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparent);
	border-radius: 10px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
}

.scheduleView {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

@media (max-width: 700px) {
	.root {
		padding: 12px;
	}

	.header {
		align-items: stretch;
	}

	.headerNav {
		justify-content: space-between;
	}

	.viewSwitcher {
		width: 100%;
		justify-content: stretch;
	}

	.viewButton {
		flex: 1;
		justify-content: center;
		padding: 0 8px;
	}

	.scheduleEvent {
		flex-direction: column;
		gap: 6px;
	}

	.scheduleEventTime {
		width: auto;
	}
	}
</style>
