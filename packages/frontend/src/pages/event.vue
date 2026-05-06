<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="[]">
	<div v-if="event" :class="$style.root">
		<MkButton :class="$style.backButton" @click="router.push('/events')">
			<i class="ti ti-arrow-left"></i>
			{{ i18n.ts.goBack }}
		</MkButton>

		<section :class="$style.hero" :style="heroStyle">
			<div :class="$style.heroHead">
				<div :class="$style.dateCard">
					<div :class="$style.dateMonth">{{ startMonthLabel }}</div>
					<div :class="$style.dateDay">{{ startDayLabel }}</div>
					<div :class="$style.dateWeekday">{{ startWeekdayLabel }}</div>
					<div :class="$style.dateYear">{{ startYearLabel }}</div>
				</div>

				<div :class="$style.heroSummary">
					<div :class="$style.heroTop">
						<span v-if="event.status !== 'approved'" :class="[$style.statusBadge, $style['status_' + event.status]]">
							{{ i18n.ts._events[event.status] }}
						</span>
					</div>

					<h1 :class="$style.title">{{ event.title || i18n.ts.untitled }}</h1>

					<div :class="$style.timeRange">
						<i class="ti ti-clock"></i>
						<MkTime :time="event.startAt" mode="detail"/>
						<span v-if="event.endAt">〜</span>
						<MkTime v-if="event.endAt" :time="event.endAt" mode="detail"/>
					</div>
				</div>
			</div>

			<div :class="$style.infoGrid">
				<button v-if="event.channel" class="_button" :class="$style.infoCard" @click="openChannel">
					<span :class="$style.infoIcon"><i class="ti ti-device-tv"></i></span>
					<span :class="$style.infoBody">
						<span :class="$style.infoLabel">{{ i18n.ts._events.channel }}</span>
						<span :class="$style.infoValue">{{ event.channel.name }}</span>
					</span>
					<i class="ti ti-chevron-right" :class="$style.infoArrow"></i>
				</button>

				<div v-if="event.url" :class="$style.infoCard">
					<span :class="$style.infoIcon"><i class="ti ti-link"></i></span>
					<span :class="$style.infoBody">
						<span :class="$style.infoLabel">{{ i18n.ts._events.url }}</span>
						<a :href="event.url" target="_blank" rel="noopener noreferrer" :class="$style.url">
							{{ event.url }}
						</a>
					</span>
				</div>
			</div>
		</section>

		<section v-if="event.description" :class="$style.section">
			<div :class="$style.sectionTitle">
				<i class="ti ti-file-description"></i>
				{{ i18n.ts._events.description }}
			</div>
			<div :class="$style.sectionBody">
				<div :class="$style.description">
					<Mfm :text="event.description"/>
				</div>
			</div>
		</section>

		<section v-if="event.tags && event.tags.length > 0" :class="$style.section">
			<div :class="$style.sectionTitle">
				<i class="ti ti-tag"></i>
				{{ i18n.ts._events.tags }}
			</div>
			<div :class="$style.sectionBody">
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
		</section>

		<section :class="$style.section">
			<div :class="$style.sectionTitle">
				<i class="ti ti-users"></i>
				{{ i18n.ts.author }}
			</div>
			<div :class="$style.sectionBody">
				<div :class="$style.createdByCard">
					<MkAvatar :user="event.createdBy" :class="$style.avatar"/>
					<div :class="$style.createdByBody">
						<div :class="$style.createdByName">{{ event.createdBy.name || event.createdBy.username }}</div>
						<div :class="$style.createdByMeta">@{{ event.createdBy.username }}</div>
					</div>
				</div>
			</div>
		</section>

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
import { ref, computed, onMounted, toRef } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import MkButton from '@/components/MkButton.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
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
const eventId = toRef(props, 'eventId');
const event = ref<Misskey.entities.Event | null>(null);
const canManagePendingEvent = ref(false);

const isOwner = computed(() => {
	if (!$i || !event.value) return false;
	return event.value.createdById === $i.id;
});

async function fetchEvent() {
	event.value = await misskeyApi('events/show', { eventId: eventId.value });
	await updateManagePermission();
}

function formatDatePart(date: Date, options: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat(undefined, options).format(date);
}

const startAtDate = computed(() => event.value ? new Date(event.value.startAt) : null);
const startMonthLabel = computed(() => startAtDate.value ? formatDatePart(startAtDate.value, { month: 'short' }) : '');
const startDayLabel = computed(() => startAtDate.value ? formatDatePart(startAtDate.value, { day: '2-digit' }) : '');
const startWeekdayLabel = computed(() => startAtDate.value ? formatDatePart(startAtDate.value, { weekday: 'short' }) : '');
const startYearLabel = computed(() => startAtDate.value ? formatDatePart(startAtDate.value, { year: 'numeric' }) : '');
const heroStyle = computed(() => ({
	'--event-accent': event.value?.color ?? 'var(--MI_THEME-accent)',
}));

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
	router.push('/events/:eventId/edit', { params: { eventId: eventId.value } });
}

async function deleteEvent() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._events.confirmDelete,
	});
	if (canceled) return;

	await misskeyApi('events/delete', { eventId: eventId.value });
	os.alert({ type: 'success', text: i18n.ts._events.eventDeleted });
	router.push('/events');
}

async function approveEvent() {
	await misskeyApi('events/approve', { eventId: eventId.value });
	os.alert({ type: 'success', text: i18n.ts._events.eventApproved });
	await fetchEvent();
}

async function rejectEvent() {
	await misskeyApi('events/reject', { eventId: eventId.value });
	os.alert({ type: 'success', text: i18n.ts._events.eventRejected });
	await fetchEvent();
}

const headerActions = computed(() => []);

onMounted(() => {
	fetchEvent();
});

definePage(computed(() => ({
	title: event.value?.title ?? i18n.ts._events.eventDetail,
	icon: 'ti ti-calendar-event',
})));
</script>

<style lang="scss" module>
.root {
	padding: 24px;
	max-width: 880px;
	margin: 0 auto;
}

.loading {
	padding: 32px;
}

.backButton {
	margin-bottom: 16px;
}

.hero {
	padding: 18px;
	border-radius: 20px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	margin-bottom: 20px;
}

.heroHead {
	display: grid;
	grid-template-columns: 80px minmax(0, 1fr);
	gap: 16px;
	align-items: start;
	margin-bottom: 16px;
}

.dateCard {
	display: flex;
	flex-direction: column;
	align-items: center;
	overflow: hidden;
	border-radius: 14px;
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
	font-size: clamp(1.15rem, 1rem + 0.25vw, 1.35rem);
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

.heroSummary {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
}

.heroTop {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.kicker {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 4px 10px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--event-accent) 12%, transparent);
	color: var(--event-accent);
	font-size: 0.76rem;
	font-weight: 700;
}

.title {
	margin: 0;
	font-size: clamp(1.3rem, 1.1rem + 0.6vw, 1.9rem);
	font-weight: 800;
	line-height: 1.2;
	word-break: break-word;
}

.timeRange {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
	font-size: 0.94rem;
	color: var(--MI_THEME-fgTransparent);
}

.infoGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 10px;
}

.infoCard {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px;
	min-width: 0;
	text-align: left;
	border-radius: 14px;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 80%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-bg) 45%, var(--MI_THEME-panel));
}

.infoIcon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 34px;
	height: 34px;
	border-radius: 999px;
	flex-shrink: 0;
	background: color-mix(in srgb, var(--event-accent) 14%, transparent);
	color: var(--event-accent);
}

.infoBody {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
	flex: 1;
}

.infoLabel {
	font-size: 0.72rem;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparent);
}

.infoValue {
	font-size: 0.95rem;
	font-weight: 600;
	word-break: break-word;
}

.infoArrow {
	color: var(--MI_THEME-fgTransparent);
}

.section {
	margin-bottom: 20px;
}

.sectionTitle {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 8px;
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparent);
}

.sectionBody {
	padding: 16px;
	border-radius: 16px;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 80%, transparent);
	background: var(--MI_THEME-panel);
}

.description {
	line-height: 1.8;
	font-size: 0.97rem;
}

.url {
	display: inline-block;
	font-size: 0.9rem;
	line-height: 1.5;
	word-break: break-all;
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

.createdByCard {
	display: flex;
	align-items: center;
	gap: 12px;
}

.avatar {
	width: 44px;
	height: 44px;
}

.createdByBody {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.createdByName {
	font-size: 0.98rem;
	font-weight: 700;
	word-break: break-word;
}

.createdByMeta {
	font-size: 0.82rem;
	color: var(--MI_THEME-fgTransparent);
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

.status_approved {
	color: var(--MI_THEME-success);
	background: color-mix(in srgb, var(--MI_THEME-success) 14%, transparent);
}

.status_rejected {
	color: var(--MI_THEME-error);
	background: color-mix(in srgb, var(--MI_THEME-error) 14%, transparent);
}

.actions {
	display: flex;
	gap: 8px;
	margin-top: 24px;
	flex-wrap: wrap;
}

@media (max-width: 720px) {
	.root {
		padding: 16px;
	}

	.hero {
		padding: 14px;
		border-radius: 18px;
	}

	.heroHead {
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
		font-size: 1.1rem;
	}

	.dateWeekday {
		align-self: center;
		margin: 0 8px 0 0;
	}

	.infoGrid {
		grid-template-columns: 1fr;
	}

	.actions > * {
		flex: 1 1 100%;
	}
}
</style>
