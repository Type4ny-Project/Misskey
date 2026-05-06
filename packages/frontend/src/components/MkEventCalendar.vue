<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.header">
		<button :class="$style.navBtn" class="_button" @click="prevMonth">
			<i class="ti ti-chevron-left"></i>
		</button>
		<button :class="$style.monthLabel" class="_button" @click="goToday">
			{{ currentYear }}{{ i18n.ts._events.year || '年' }} {{ currentMonth + 1 }}{{ i18n.ts._events.month || '月' }}
		</button>
		<button :class="$style.navBtn" class="_button" @click="nextMonth">
			<i class="ti ti-chevron-right"></i>
		</button>
	</div>
	<div :class="$style.weekdays">
		<div v-for="day in weekdays" :key="day" :class="$style.weekday">{{ day }}</div>
	</div>
	<div :class="$style.weeks">
		<div
			v-for="week in calendarWeeks"
			:key="week.key"
			:class="$style.weekRow"
			:style="{ '--all-day-height': `${week.allDayHeight}px` }"
		>
			<div :class="$style.weekGrid">
				<button
					v-for="cell in week.cells"
					:key="cell.key"
					:class="[
						$style.cell,
						{ [$style.otherMonth]: !cell.isCurrentMonth },
						{ [$style.today]: cell.isToday },
						{ [$style.selected]: cell.isSelected },
					]"
					class="_button"
					@click="onDateClick(cell.date)"
				>
					<span :class="$style.cellDate">{{ cell.day }}</span>
					<div :class="$style.cellBody">
						<div v-if="cell.timedEvents.length > 0" :class="$style.timedEvents">
							<div
								v-for="timedEvent in cell.timedEvents"
								:key="timedEvent.key"
								:class="$style.timedEvent"
							>
								<span :class="$style.timedEventDot" :style="{ backgroundColor: timedEvent.color }"></span>
								<span :class="$style.timedEventLabel">{{ timedEvent.title }}</span>
							</div>
						</div>
					</div>
				</button>
			</div>
			<div v-if="week.bars.length > 0" :class="$style.weekBars">
				<div
					v-for="bar in week.bars"
					:key="bar.key"
					:class="[
						$style.eventBar,
						{ [$style.startCap]: bar.startsInWeek },
						{ [$style.endCap]: bar.endsInWeek },
					]"
					:style="{
						left: `calc(${(bar.startIndex / 7) * 100}% + ${bar.startsInWeek ? 3 : 0}px)`,
						width: `calc(${((bar.endIndex - bar.startIndex + 1) / 7) * 100}% - ${(bar.startsInWeek ? 3 : 0) + (bar.endsInWeek ? 3 : 0)}px)`,
						top: `${bar.lane * 18}px`,
						backgroundColor: bar.color,
						color: bar.textColor,
					}"
				>
					<span v-if="bar.title" :class="$style.eventBarLabel">{{ bar.title }}</span>
				</div>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted } from 'vue';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	selectedDate?: string | null;
	events?: { title?: string; startAt: string; endAt?: string | null; color?: string | null }[];
}>(), {
	selectedDate: null,
	events: () => [],
});

const emit = defineEmits<{
	(ev: 'update:selectedDate', date: string | null): void;
	(ev: 'monthChange', year: number, month: number): void;
}>();

// Default accent color resolved from CSS variable (inline style cannot use CSS vars/color-mix)
const defaultBarColor = ref('#3b82f6');

onMounted(() => {
	// Try to read the accent color from CSS custom property
	const accent = getComputedStyle(document.documentElement).getPropertyValue('--MI_THEME-accent').trim();
	if (accent) {
		defaultBarColor.value = accent;
	}
});

const now = new Date();
const currentYear = ref(now.getFullYear());
const currentMonth = ref(now.getMonth());

const weekdays = computed(() => [
	i18n.ts._events.sun,
	i18n.ts._events.mon,
	i18n.ts._events.tue,
	i18n.ts._events.wed,
	i18n.ts._events.thu,
	i18n.ts._events.fri,
	i18n.ts._events.sat,
]);

function parseDateStr(dateStr: string): Date {
	const [year, month, day] = dateStr.split('-').map(Number);
	return new Date(year, month - 1, day);
}

function diffDays(from: string, to: string): number {
	return Math.round((parseDateStr(to).getTime() - parseDateStr(from).getTime()) / 86400000);
}

function formatDateStr(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Convert ISO datetime string to local date string "YYYY-MM-DD"
function toLocalDateStr(isoStr: string): string {
	const d = new Date(isoStr);
	return formatDateStr(d);
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

function isMidnight(d: Date): boolean {
	return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
}

function isAllDayEvent(event: { startAt: string; endAt?: string | null }): boolean {
	const start = new Date(event.startAt);
	const end = event.endAt ? new Date(event.endAt) : null;
	if (!isMidnight(start)) return false;
	if (end == null) return true;
	return isMidnight(end);
}

function isBarEvent(event: { startAt: string; endAt?: string | null }): boolean {
	if (isAllDayEvent(event)) return true;
	if (!event.endAt) return false;
	return toLocalDateStr(event.startAt) !== toLocalDateStr(event.endAt);
}

const calendarCells = computed(() => {
	const year = currentYear.value;
	const month = currentMonth.value;
	const firstDay = new Date(year, month, 1);
	const startDayOfWeek = firstDay.getDay();
	const daysInMonth = new Date(year, month + 1, 0).getDate();

	const today = new Date();
	const todayStr = formatDateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
	const selectedStr = props.selectedDate;

	const cells: {
		key: string;
		date: string;
		day: number;
		isCurrentMonth: boolean;
		isToday: boolean;
		isSelected: boolean;
	}[] = [];

	// Previous month fill
	const prevMonthDays = new Date(year, month, 0).getDate();
	for (let i = startDayOfWeek - 1; i >= 0; i--) {
		const d = new Date(year, month - 1, prevMonthDays - i);
		const ds = formatDateStr(d);
		cells.push({
			key: ds,
			date: ds,
			day: prevMonthDays - i,
			isCurrentMonth: false,
			isToday: ds === todayStr,
			isSelected: ds === selectedStr,
		});
	}

	// Current month
	for (let day = 1; day <= daysInMonth; day++) {
		const d = new Date(year, month, day);
		const ds = formatDateStr(d);
		cells.push({
			key: ds,
			date: ds,
			day,
			isCurrentMonth: true,
			isToday: ds === todayStr,
			isSelected: ds === selectedStr,
		});
	}

	// Next month fill
	const remaining = 7 - (cells.length % 7);
	if (remaining < 7) {
		for (let day = 1; day <= remaining; day++) {
			const d = new Date(year, month + 1, day);
			const ds = formatDateStr(d);
			cells.push({
				key: ds,
				date: ds,
				day,
				isCurrentMonth: false,
				isToday: ds === todayStr,
				isSelected: ds === selectedStr,
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
			}[];
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
		}[];
		laneCount: number;
		allDayHeight: number;
	}[] = [];

	for (let i = 0; i < calendarCells.value.length; i += 7) {
		const cells = calendarCells.value.slice(i, i + 7);
		const weekStart = cells[0].date;
		const weekEnd = cells[6].date;

		const allDaySegments = props.events.map((event, index) => {
			if (!isBarEvent(event)) return null;
			const start = toLocalDateStr(event.startAt);
			const end = event.endAt ? toLocalDateStr(event.endAt) : start;

			if (end < weekStart || start > weekEnd) return null;

			const startIndex = Math.max(0, diffDays(weekStart, start));
			const endIndex = Math.min(6, diffDays(weekStart, end));

			if (endIndex < startIndex) return null;
			const color = event.color ?? defaultBarColor.value;

			return {
				key: `${index}:${start}:${end}:${weekStart}`,
				title: event.title ?? '',
				startIndex,
				endIndex,
				startsInWeek: start >= weekStart,
				endsInWeek: end <= weekEnd,
				color,
				textColor: getContrastTextColor(color),
			};
		}).filter((segment): segment is NonNullable<typeof segment> => segment != null)
			.sort((a, b) => {
				if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
				return (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex);
			});

		const laneEnds: number[] = [];
		const bars = allDaySegments.map(segment => {
			let lane = 0;
			while (laneEnds[lane] != null && laneEnds[lane] >= segment.startIndex) {
				lane++;
			}
			laneEnds[lane] = segment.endIndex;

			return {
				...segment,
				lane,
			};
		});

		const timedEventsByDate = new Map<string, {
			key: string;
			title: string;
			color: string;
			startAt: string;
		}[]>();

		for (const cell of cells) {
			timedEventsByDate.set(cell.date, []);
		}

		for (const [index, event] of props.events.entries()) {
			if (isBarEvent(event)) continue;
			const start = toLocalDateStr(event.startAt);
			const end = event.endAt ? toLocalDateStr(event.endAt) : start;
			const color = event.color ?? defaultBarColor.value;

			for (const cell of cells) {
				if (cell.date < start || cell.date > end) continue;
				const list = timedEventsByDate.get(cell.date);
				if (!list) continue;
				list.push({
					key: `${index}:${cell.date}:${event.startAt}`,
					title: event.title ?? '',
					color,
					startAt: event.startAt,
				});
			}
		}

		const cellsWithTimedEvents = cells.map(cell => ({
			...cell,
			timedEvents: (timedEventsByDate.get(cell.date) ?? [])
				.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
				.slice(0, 4)
				.map(({ key, title, color }) => ({ key, title, color })),
		}));

		const allDayHeight = bars.length > 0 ? laneEnds.length * 18 + 2 : 0;

		weeks.push({
			key: weekStart,
			cells: cellsWithTimedEvents,
			bars,
			laneCount: laneEnds.length,
			allDayHeight,
		});
	}

	return weeks;
});

function prevMonth() {
	if (currentMonth.value === 0) {
		currentYear.value--;
		currentMonth.value = 11;
	} else {
		currentMonth.value--;
	}
}

function nextMonth() {
	if (currentMonth.value === 11) {
		currentYear.value++;
		currentMonth.value = 0;
	} else {
		currentMonth.value++;
	}
}

function goToday() {
	const today = new Date();
	currentYear.value = today.getFullYear();
	currentMonth.value = today.getMonth();
}

function onDateClick(dateStr: string) {
	if (props.selectedDate === dateStr) {
		emit('update:selectedDate', null);
	} else {
		emit('update:selectedDate', dateStr);
	}
}

watch([currentYear, currentMonth], () => {
	emit('monthChange', currentYear.value, currentMonth.value);
}, { immediate: true });
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
	margin-bottom: 12px;
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
	font-size: 1.1em;
	font-weight: 700;
	color: var(--MI_THEME-fg);
	padding: 4px 12px;
	border-radius: 8px;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
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
	cursor: pointer;
	transition: background 0.15s;
	border-right: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 6%, transparent);
	}

	&:last-child {
		border-right: none;
	}
}

.cellBody {
	width: 100%;
	flex: 1;
	padding-top: calc(var(--all-day-height) + 2px);
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
	min-width: 0;
	font-size: 11px;
	font-weight: 700;
	line-height: 1.2;
	color: var(--MI_THEME-fg);
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
	height: 14px;
	border-radius: 999px;
	opacity: 0.96;
	display: flex;
	align-items: center;
	padding: 0 5px;
	box-sizing: border-box;
	box-shadow: inset 0 0 0 1px color-mix(in srgb, black 10%, transparent);
	overflow: hidden;
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
</style>
