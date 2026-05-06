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
	<div :class="$style.grid">
		<button
			v-for="cell in calendarCells"
			:key="cell.key"
			:class="[
				$style.cell,
				{ [$style.otherMonth]: !cell.isCurrentMonth },
				{ [$style.today]: cell.isToday },
				{ [$style.selected]: cell.isSelected },
				{ [$style.hasEvents]: cell.eventCount > 0 },
			]"
			class="_button"
			@click="onDateClick(cell.date)"
		>
			<span :class="$style.cellDate">{{ cell.day }}</span>
			<span v-if="cell.eventCount > 0" :class="$style.eventDots">
				<span
					v-for="n in Math.min(cell.eventCount, 3)"
					:key="n"
					:class="$style.dot"
				></span>
			</span>
		</button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	selectedDate?: string | null;
	events?: { startAt: string; endAt?: string | null }[];
}>(), {
	selectedDate: null,
	events: () => [],
});

const emit = defineEmits<{
	(ev: 'update:selectedDate', date: string | null): void;
	(ev: 'monthChange', year: number, month: number): void;
}>();

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

function getEventCountForDate(date: Date): number {
	const dateStr = formatDateStr(date);
	let count = 0;
	for (const ev of props.events) {
		const startDate = formatDateStr(new Date(ev.startAt));
		const endDate = ev.endAt ? formatDateStr(new Date(ev.endAt)) : startDate;
		if (dateStr >= startDate && dateStr <= endDate) {
			count++;
		}
	}
	return count;
}

function formatDateStr(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const calendarCells = computed(() => {
	const year = currentYear.value;
	const month = currentMonth.value;
	const firstDay = new Date(year, month, 1);
	const startDayOfWeek = firstDay.getDay();
	const daysInMonth = new Date(year, month + 1, 0).getDate();

	const today = new Date();
	const todayStr = formatDateStr(today);
	const selectedStr = props.selectedDate;

	const cells: {
		key: string;
		date: string;
		day: number;
		isCurrentMonth: boolean;
		isToday: boolean;
		isSelected: boolean;
		eventCount: number;
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
			eventCount: getEventCountForDate(d),
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
			eventCount: getEventCountForDate(d),
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
				eventCount: getEventCountForDate(d),
			});
		}
	}

	return cells;
});

function prevMonth() {
	if (currentMonth.value === 0) {
		currentYear.value--;
		currentMonth.value = 11;
	} else {
		currentMonth.value--;
	}
	emit('monthChange', currentYear.value, currentMonth.value);
}

function nextMonth() {
	if (currentMonth.value === 11) {
		currentYear.value++;
		currentMonth.value = 0;
	} else {
		currentMonth.value++;
	}
	emit('monthChange', currentYear.value, currentMonth.value);
}

function goToday() {
	const today = new Date();
	currentYear.value = today.getFullYear();
	currentMonth.value = today.getMonth();
	emit('monthChange', currentYear.value, currentMonth.value);
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
	border-radius: 12px;
	padding: 16px;
	user-select: none;
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
	gap: 2px;
	margin-bottom: 4px;
}

.weekday {
	text-align: center;
	font-size: 0.8em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparent);
	padding: 4px 0;
}

.grid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 2px;
}

.cell {
	aspect-ratio: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	border-radius: 8px;
	padding: 2px;
	min-height: 36px;
	position: relative;
	transition: background 0.15s;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.otherMonth {
	opacity: 0.3;
}

.today {
	.cellDate {
		background: var(--MI_THEME-accent);
		color: var(--MI_THEME-fgOnAccent);
		border-radius: 50%;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
}

.selected {
	background: color-mix(in srgb, var(--MI_THEME-accent) 15%, transparent);
	outline: 2px solid var(--MI_THEME-accent);
	outline-offset: -2px;
}

.hasEvents {
	font-weight: 700;
}

.cellDate {
	font-size: 0.85em;
	line-height: 1;
}

.eventDots {
	display: flex;
	gap: 2px;
	margin-top: 2px;
}

.dot {
	width: 4px;
	height: 4px;
	border-radius: 50%;
	background: var(--MI_THEME-accent);
}
</style>
