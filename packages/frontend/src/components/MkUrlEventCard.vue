<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<article :class="$style.root" :style="cardStyle">
	<div :class="$style.head">
		<div :class="$style.dateCard">
			<div :class="$style.dateMonth">{{ startMonthLabel }}</div>
			<div :class="$style.dateDay">{{ startDayLabel }}</div>
			<div :class="$style.dateWeekday">{{ startWeekdayLabel }}</div>
			<div :class="$style.dateYear">{{ startYearLabel }}</div>
		</div>

		<div :class="$style.summary">
			<div :class="$style.summaryTop">
				<div :class="$style.kicker">
					<i class="ti ti-calendar-event"></i>
					<span>{{ i18n.ts._events.eventDetail }}</span>
				</div>
				<div
					v-if="eventData.status !== 'approved'"
					:class="[
						$style.statusBadge,
						{
							[$style.status_pending]: eventData.status === 'pending',
							[$style.status_rejected]: eventData.status === 'rejected',
						},
					]"
				>
					{{ i18n.ts._events[eventData.status] }}
				</div>
			</div>

			<h1 :class="$style.title">{{ eventData.title || i18n.ts.untitled }}</h1>

			<div :class="$style.timeRange">
				<i class="ti ti-clock"></i>
				<MkTime :time="eventData.startAt" mode="detail"/>
				<span v-if="eventData.endAt">~</span>
				<MkTime v-if="eventData.endAt" :time="eventData.endAt" mode="detail"/>
			</div>
		</div>
	</div>

	<div v-if="channelName || eventData.url" :class="$style.metaList">
		<button v-if="channelName" class="_button" :class="$style.metaRow" @click="gotoChannel">
			<span :class="$style.metaIcon"><i class="ti ti-device-tv"></i></span>
			<span :class="$style.metaBody">
				<span :class="$style.metaKey">{{ i18n.ts._events.channel }}</span>
				<span :class="$style.metaText">{{ channelName }}</span>
			</span>
			<i class="ti ti-chevron-right" :class="$style.metaArrow"></i>
		</button>
		<div v-if="eventData.url" :class="$style.metaRow">
			<span :class="$style.metaIcon"><i class="ti ti-link"></i></span>
			<span :class="$style.metaBody">
				<span :class="$style.metaKey">{{ i18n.ts._events.url }}</span>
				<span :class="$style.metaTextLink">
					<MkLink :url="eventData.url" target="_blank">{{ eventData.url }}</MkLink>
				</span>
			</span>
		</div>
	</div>

	<div v-if="eventData.description" :class="$style.section">
		<div :class="$style.sectionTitle">
			<i class="ti ti-file-description"></i>
			{{ i18n.ts._events.description }}
		</div>
		<p :class="$style.description">{{ eventData.description }}</p>
	</div>

	<div v-if="(eventData.tags?.length ?? 0) > 0" :class="$style.section">
		<div :class="$style.sectionTitle">
			<i class="ti ti-tag"></i>
			{{ i18n.ts._events.tags }}
		</div>
		<div :class="$style.tags">
			<button
				v-for="tag in eventData.tags"
				:key="tag"
				class="_button"
				:class="$style.tag"
				@click="openTag(tag)"
			>
				#{{ tag }}
			</button>
		</div>
	</div>

	<div :class="$style.actions">
		<MkButton primary @click="gotoEvent">
			<i class="ti ti-external-link"></i>
			{{ i18n.ts.details }}
		</MkButton>
	</div>
</article>
</template>

<script lang="ts" setup>
import { computed, toRef } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkLink from '@/components/MkLink.vue';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{
	eventId: string;
}>();

const router = useRouter();
const eventId = toRef(props, 'eventId');

const eventData = await misskeyApi('events/show', {
	eventId: eventId.value,
});

const channelName = eventData.channelId
	? (await misskeyApi('channels/show', { channelId: eventData.channelId }).then(channel => channel.name).catch(() => null))
	: null;

function formatDatePart(date: Date, options: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat(undefined, options).format(date);
}

const startAtDate = computed(() => new Date(eventData.startAt));
const startMonthLabel = computed(() => formatDatePart(startAtDate.value, { month: 'short' }));
const startDayLabel = computed(() => formatDatePart(startAtDate.value, { day: '2-digit' }));
const startWeekdayLabel = computed(() => formatDatePart(startAtDate.value, { weekday: 'short' }));
const startYearLabel = computed(() => formatDatePart(startAtDate.value, { year: 'numeric' }));

const cardStyle = computed(() => ({
	'--event-accent': eventData.color ?? 'var(--MI_THEME-accent)',
}));

const gotoChannel = (): void => {
	if (eventData.channelId == null) return;
	router.push('/channels/:channelId', { params: { channelId: eventData.channelId } });
};

const gotoEvent = (): void => {
	router.push('/events/:eventId', { params: { eventId: eventData.id } });
};

const openTag = (tag: string): void => {
	router.push('/tags/:tag', { params: { tag } });
};
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 14px;
	width: 100%;
	max-width: min(100%, 640px);
	padding: 14px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 16px;
	background: var(--MI_THEME-panel);
	vertical-align: baseline;
	overflow: hidden;
	container-type: inline-size;
}

.head {
	display: grid;
	grid-template-columns: 68px minmax(0, 1fr);
	gap: 14px;
	align-items: start;
}

.dateCard {
	display: flex;
	flex-direction: column;
	align-items: center;
	overflow: hidden;
	border-radius: 12px;
	border: 1px solid color-mix(in srgb, var(--event-accent) 16%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-bg) 52%, var(--MI_THEME-panel));
}

.dateMonth {
	width: 100%;
	padding: 5px 6px;
	text-align: center;
	font-size: 0.66rem;
	font-weight: 800;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--event-accent);
	background: color-mix(in srgb, var(--event-accent) 12%, transparent);
}

.dateDay {
	padding-top: 8px;
	font-size: clamp(1.05rem, 1rem + 0.2vw, 1.2rem);
	font-weight: 900;
	line-height: 0.95;
}

.dateWeekday {
	margin-top: 3px;
	font-size: 0.68rem;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparent);
}

.dateYear {
	margin-top: auto;
	padding: 8px 6px 6px;
	font-size: 0.62rem;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparent);
}

.summary {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
}

.summaryTop {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.kicker {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	align-self: flex-start;
	padding: 4px 10px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--event-accent) 12%, transparent);
	color: var(--event-accent);
	font-size: 0.76rem;
	font-weight: 700;
}

.statusBadge {
	display: inline-flex;
	align-items: center;
	padding: 4px 10px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 800;
	color: var(--MI_THEME-fgTransparent);
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
}

.status_pending {
	color: var(--MI_THEME-warn);
	background: color-mix(in srgb, var(--MI_THEME-warn) 16%, transparent);
}

.status_rejected {
	color: var(--MI_THEME-error);
	background: color-mix(in srgb, var(--MI_THEME-error) 14%, transparent);
}

.title {
	margin: 0;
	font-size: clamp(1.08rem, 0.98rem + 0.35vw, 1.28rem);
	font-weight: 800;
	line-height: 1.3;
	word-break: break-word;
}

.timeRange {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	font-size: 0.88rem;
	color: var(--MI_THEME-fgTransparent);
}

.metaList {
	display: flex;
	flex-direction: column;
	border-radius: 12px;
	overflow: hidden;
	background: color-mix(in srgb, var(--MI_THEME-bg) 45%, var(--MI_THEME-panel));
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 80%, transparent);
}

.metaRow {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px;
	min-width: 0;
	text-align: left;

	& + & {
		border-top: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 75%, transparent);
	}
}

.metaIcon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	border-radius: 999px;
	flex-shrink: 0;
	background: color-mix(in srgb, var(--event-accent) 14%, transparent);
	color: var(--event-accent);
}

.metaBody {
	display: flex;
	flex-direction: column;
	min-width: 0;
	gap: 2px;
	flex: 1;
}

.metaKey {
	font-size: 0.72rem;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparent);
}

.metaText {
	font-size: 0.92rem;
	font-weight: 600;
	line-height: 1.35;
	word-break: break-word;
}

.metaTextLink {
	font-size: 0.86rem;
	line-height: 1.4;
	word-break: break-all;
}

.metaArrow {
	color: var(--MI_THEME-fgTransparent);
}

.section {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
}

.sectionTitle {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-size: 0.76rem;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparent);

	> i {
		color: var(--event-accent);
	}
}

.description {
	margin: 0;
	font-size: 0.92rem;
	line-height: 1.7;
	white-space: pre-wrap;
	word-break: break-word;
}

.tags {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.tag {
	display: inline-flex;
	align-items: center;
	padding: 7px 10px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--event-accent) 12%, transparent);
	color: var(--event-accent);
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.8rem;
	font-weight: 700;

	&:hover {
		background: color-mix(in srgb, var(--event-accent) 18%, transparent);
	}
}

.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

@container (max-width: 480px) {
	.head {
		grid-template-columns: 1fr;
	}

	.dateCard {
		flex-direction: row;
		align-items: stretch;
	}

	.dateMonth,
	.dateYear {
		writing-mode: vertical-rl;
		text-orientation: mixed;
		width: auto;
		padding: 6px 5px;
	}

	.dateDay {
		padding: 0;
		align-self: center;
		margin: 0 8px;
		font-size: 1rem;
	}

	.dateWeekday {
		align-self: center;
		margin: 0 8px 0 0;
		font-size: 0.64rem;
	}

	.actions {
		> * {
			flex: 1 1 100%;
		}
	}
}

@media (max-width: 500px) {
	.root {
		padding: 14px;
		border-radius: 14px;
	}
}
</style>
