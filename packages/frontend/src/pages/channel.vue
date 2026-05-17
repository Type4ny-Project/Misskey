<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<div class="_spacer" :style="spacerStyle">
		<div v-if="channel && tab === 'overview'" class="_gaps">
			<div class="_panel" :class="$style.bannerContainer">
				<XChannelFollowButton :channel="channel" :full="true" :class="$style.subscribe"/>
				<MkButton v-if="favorited" v-tooltip="i18n.ts.unfavorite" asLike class="button" rounded primary :class="$style.favorite" @click="unfavorite()"><i class="ti ti-star"></i></MkButton>
				<MkButton v-else v-tooltip="i18n.ts.favorite" asLike class="button" rounded :class="$style.favorite" @click="favorite()"><i class="ti ti-star"></i></MkButton>
				<div :style="{ backgroundImage: channel.bannerUrl ? `url(${channel.bannerUrl})` : undefined }" :class="$style.banner">
					<div :class="$style.bannerStatus">
						<div><i class="ti ti-users ti-fw"></i><I18n :src="i18n.ts._channel.usersCount" tag="span" style="margin-left: 4px;"><template #n><b>{{ channel.usersCount }}</b></template></I18n></div>
						<div><i class="ti ti-pencil ti-fw"></i><I18n :src="i18n.ts._channel.notesCount" tag="span" style="margin-left: 4px;"><template #n><b>{{ channel.notesCount }}</b></template></I18n></div>
						<div v-if="$i != null && channel != null && $i.id === channel.userId" style="color: var(--MI_THEME-warn)"><i class="ti ti-user-star ti-fw"></i><span style="margin-left: 4px;">{{ i18n.ts.youAreAdmin }}</span></div>
					</div>
					<div v-if="channel.isSensitive" :class="$style.sensitiveIndicator">{{ i18n.ts.sensitive }}</div>
					<div :class="$style.bannerFade"></div>
				</div>
				<div v-if="channel.description" :class="$style.description">
					<Mfm :text="channel.description" :isNote="false"/>
				</div>
			</div>

			<MkFoldableSection>
				<template #header><i class="ti ti-pin ti-fw" style="margin-right: 0.5em;"></i>{{ i18n.ts.pinnedNotes }}</template>
				<div v-if="channel.pinnedNotes && channel.pinnedNotes.length > 0" class="_gaps">
					<MkNote v-for="note in channel.pinnedNotes" :key="note.id" class="_panel" :note="note"/>
				</div>
			</MkFoldableSection>
		</div>
		<div v-if="channel && tab === 'timeline'" class="_gaps">
			<MkInfo v-if="channel.isArchived" warn>{{ i18n.ts.thisChannelArchived }}</MkInfo>

			<!-- スマホ・タブレットの場合、キーボードが表示されると投稿が見づらくなるので、デスクトップ場合のみ自動でフォーカスを当てる -->
			<MkPostForm v-if="$i && prefer.r.showFixedPostFormInChannel.value" :channel="channel" class="post-form _panel" fixed :autofocus="deviceKind === 'desktop'"/>

			<MkStreamingNotesTimeline :key="channelId" src="channel" :channel="channelId"/>
		</div>
		<div v-else-if="tab === 'featured'">
			<MkNotesTimeline :paginator="featuredPaginator"/>
		</div>
		<div v-else-if="tab === 'search'">
			<div v-if="notesSearchAvailable" class="_gaps">
				<div>
					<MkInput v-model="searchQuery" @enter="search()">
						<template #prefix><i class="ti ti-search"></i></template>
					</MkInput>
					<MkButton primary rounded style="margin-top: 8px;" @click="search()">{{ i18n.ts.search }}</MkButton>
				</div>
				<MkNotesTimeline v-if="searchPaginator" :key="searchKey" :paginator="searchPaginator"/>
			</div>
			<div v-else>
				<MkInfo warn>{{ i18n.ts.notesSearchNotAvailable }}</MkInfo>
			</div>
		</div>
		<div v-else-if="tab === 'events'" class="_gaps">
			<div :class="$style.eventsContainer">
				<MkEventCalendar
					v-model:selectedDate="selectedEventDate"
					:events="channelCalendarEvents"
					:allowCreate="!!$i"
					:defaultChannelId="channelId"
					:defaultChannelName="channel?.name ?? null"
					@rangeChange="onChannelRangeChange"
					@eventCreated="refreshManagedChannelEvents"
				/>
			</div>
		</div>
		<div v-else-if="tab === 'manage' && canManageChannelEvents" class="_gaps">
			<div :class="$style.managePanel">
				<div :class="$style.toolbar">
					<div :class="$style.statusSummary">
						<span :class="$style.summaryLabel">{{ i18n.ts.manage }}</span>
						<span :class="$style.summaryCount">{{ managedChannelEvents.length }}</span>
					</div>
					<div :class="$style.filters">
						<MkSelect v-model="channelManageStatus" :items="channelManageStatusItems">
							<template #label>{{ i18n.ts.filter }}</template>
						</MkSelect>
					</div>
				</div>

				<div :class="$style.eventsActions">
					<MkButton primary rounded @click="router.push('/channels/:channelId/events/new', { params: { channelId } })">
						<i class="ti ti-plus"></i> {{ i18n.ts._events.createEvent }}
					</MkButton>
				</div>

				<MkLoading v-if="channelManageLoading"/>

				<div v-else-if="managedChannelEvents.length === 0" class="_fullInfo">
					<span>{{ i18n.ts._events.noEvents }}</span>
				</div>

				<div v-else :class="$style.eventList">
					<div v-for="event in managedChannelEvents" :key="event.id" class="_panel" :class="$style.eventCard">
						<div :class="$style.headerRow">
							<div>
								<div :class="$style.eventDate">
									<i class="ti ti-calendar"></i>
									{{ formatEventDate(event.startAt) }}
									<template v-if="event.endAt">〜 {{ formatEventDate(event.endAt) }}</template>
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
						</div>

						<div :class="$style.actions">
							<MkButton @click="openEvent(event.id)">
								<i class="ti ti-external-link"></i> {{ i18n.ts.details }}
							</MkButton>
							<MkButton v-if="event.status !== 'approved'" primary @click="approveChannelEvent(event.id)">
								<i class="ti ti-check"></i> {{ i18n.ts._events.approve }}
							</MkButton>
							<MkButton v-if="event.status !== 'rejected'" danger @click="rejectChannelEvent(event.id)">
								<i class="ti ti-x"></i> {{ i18n.ts._events.reject }}
							</MkButton>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
	<template #footer>
		<div :class="$style.footer">
			<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 16px;">
				<div class="_buttonsCenter">
					<MkButton inline rounded primary gradate @click="openPostForm()"><i class="ti ti-pencil"></i> {{ i18n.ts.postToTheChannel }}</MkButton>
				</div>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, watch, ref, markRaw, shallowRef } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { useInterval } from '@@/js/use-interval.js';
import type { PageHeaderItem } from '@/types/page-header.js';
import MkPostForm from '@/components/MkPostForm.vue';
import MkStreamingNotesTimeline from '@/components/MkStreamingNotesTimeline.vue';
import XChannelFollowButton from '@/components/MkChannelFollowButton.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i, iAmModerator } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { deviceKind } from '@/utility/device-kind.js';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import { favoritedChannelsCache } from '@/cache.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import type { GetMkSelectValueTypesFromDef, MkSelectItem } from '@/components/MkSelect.vue';
import MkSelect from '@/components/MkSelect.vue';
import { prefer } from '@/preferences.js';
import MkNote from '@/components/MkNote.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkEventCalendar from '@/components/MkEventCalendar.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { isSupportShare } from '@/utility/navigator.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { notesSearchAvailable } from '@/utility/check-permissions.js';
import { miLocalStorage } from '@/local-storage.js';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';

const router = useRouter();

const props = defineProps<{
	channelId: string;
}>();

type EventManageStatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const channelManageStatusItems = [
	{ label: i18n.ts._events.pending, value: 'pending' },
	{ label: i18n.ts._events.approved, value: 'approved' },
	{ label: i18n.ts._events.rejected, value: 'rejected' },
	{ label: i18n.ts.all, value: 'all' },
] as const satisfies MkSelectItem[];

type ChannelManageStatus = GetMkSelectValueTypesFromDef<typeof channelManageStatusItems>;

const tab = ref('overview');

const channel = ref<Misskey.entities.Channel | null>(null);
const canManageChannelEvents = computed(() => hasChannelEventManagePermission(channel.value));
const favorited = ref(false);
const searchQuery = ref('');
const searchPaginator = shallowRef();
const searchKey = ref('');
const featuredPaginator = markRaw(new Paginator('notes/featured', {
	limit: 10,
	computedParams: computed(() => ({
		channelId: props.channelId,
	})),
}));

useInterval(() => {
	if (channel.value == null) return;
	miLocalStorage.setItemAsJson(`channelLastReadedAt:${channel.value.id}`, Date.now());
}, 3000, {
	immediate: true,
	afterMounted: true,
});

watch(() => props.channelId, async () => {
	const _channel = await misskeyApi('channels/show', {
		channelId: props.channelId,
	});

	favorited.value = _channel.isFavorited ?? false;
	if (favorited.value || _channel.isFollowing) {
		tab.value = 'timeline';
	}

	if ((favorited.value || _channel.isFollowing) && _channel.lastNotedAt) {
		const lastReadedAt: number = miLocalStorage.getItemAsJson(`channelLastReadedAt:${_channel.id}`) ?? 0;
		const lastNotedAt = Date.parse(_channel.lastNotedAt);

		if (lastNotedAt > lastReadedAt) {
			miLocalStorage.setItemAsJson(`channelLastReadedAt:${_channel.id}`, lastNotedAt);
		}
	}

	channel.value = _channel;
}, { immediate: true });

watch(tab, (newTab) => {
	if ((newTab === 'events' || newTab === 'manage') && channelEvents.value.length === 0) {
		fetchChannelEvents();
	}

	if (newTab === 'manage' && canManageChannelEvents.value) {
		fetchManagedChannelEvents();
	}
});

function edit() {
	router.push('/channels/:channelId/edit', {
		params: {
			channelId: props.channelId,
		},
	});
}

function openPostForm() {
	os.post({
		channel: channel.value,
	});
}

function favorite() {
	if (!channel.value) return;

	os.apiWithDialog('channels/favorite', {
		channelId: channel.value.id,
	}).then(() => {
		favorited.value = true;
		favoritedChannelsCache.delete();
	});
}

async function unfavorite() {
	if (!channel.value) return;

	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.unfavoriteConfirm,
	});
	if (confirm.canceled) return;
	os.apiWithDialog('channels/unfavorite', {
		channelId: channel.value.id,
	}).then(() => {
		favorited.value = false;
		favoritedChannelsCache.delete();
	});
}

async function mute() {
	if (!channel.value) return;
	const _channel = channel.value;

	const { canceled, result: period } = await os.select({
		title: i18n.ts.mutePeriod,
		items: [{
			value: 'indefinitely', label: i18n.ts.indefinitely,
		}, {
			value: 'tenMinutes', label: i18n.ts.tenMinutes,
		}, {
			value: 'oneHour', label: i18n.ts.oneHour,
		}, {
			value: 'oneDay', label: i18n.ts.oneDay,
		}, {
			value: 'oneWeek', label: i18n.ts.oneWeek,
		}],
		default: 'indefinitely',
	});
	if (canceled) return;

	const expiresAt = period === 'indefinitely' ? null
		: period === 'tenMinutes' ? Date.now() + (1000 * 60 * 10)
		: period === 'oneHour' ? Date.now() + (1000 * 60 * 60)
		: period === 'oneDay' ? Date.now() + (1000 * 60 * 60 * 24)
		: period === 'oneWeek' ? Date.now() + (1000 * 60 * 60 * 24 * 7)
		: null;

	os.apiWithDialog('channels/mute/create', {
		channelId: _channel.id,
		expiresAt,
	}).then(() => {
		_channel.isMuting = true;
	});
}

async function unmute() {
	if (!channel.value) return;
	const _channel = channel.value;

	os.apiWithDialog('channels/mute/delete', {
		channelId: _channel.id,
	}).then(() => {
		_channel.isMuting = false;
	});
}

async function search() {
	if (!channel.value) return;

	const query = searchQuery.value.toString().trim();

	if (query == null) return;

	searchPaginator.value = markRaw(new Paginator('notes/search', {
		limit: 10,
		params: {
			query: query,
			channelId: channel.value.id,
		},
	}));

	searchKey.value = query;
}

function hasChannelEventManagePermission(targetChannel: Misskey.entities.Channel | null): boolean {
	if (!$i || targetChannel == null) return false;
	if (iAmModerator) return true;

	return $i.id === targetChannel.userId || isChannelCollaborator(targetChannel, $i.id);
}

function isChannelCollaborator(targetChannel: Misskey.entities.Channel, userId: string): boolean {
	return Array.isArray(targetChannel.collaboratorIds) && targetChannel.collaboratorIds.includes(userId);
}

// Channel events
const selectedEventDate = ref<string | null>(null);
const channelEvents = ref<Misskey.entities.Event[]>([]);
const managedChannelEvents = ref<Misskey.entities.Event[]>([]);
const channelManageLoading = ref(false);
const channelManageStatus = ref<ChannelManageStatus>('pending');
const channelRangeStart = ref<number>(0);
const channelRangeEnd = ref<number>(0);

watch(channelManageStatus, () => {
	if (tab.value === 'manage' && canManageChannelEvents.value) {
		fetchManagedChannelEvents();
	}
});

function onChannelRangeChange(range: { startAt: number; endAt: number; view: 'month' | 'week' | 'schedule' }) {
	channelRangeStart.value = range.startAt;
	channelRangeEnd.value = range.endAt;
	fetchChannelEvents();
}

async function fetchChannelEvents() {
	if (channelRangeStart.value === 0 || channelRangeEnd.value === 0) return;

	try {
		const res = await misskeyApi('events/list', {
			limit: 100,
			sinceDate: channelRangeStart.value,
			untilDate: channelRangeEnd.value,
			channelId: props.channelId,
		});
		channelEvents.value = res;
	} catch (error) {
		console.error(error);
	}
}

async function fetchManagedChannelEvents() {
	if (!hasChannelEventManagePermission(channel.value)) {
		managedChannelEvents.value = [];
		return;
	}

	channelManageLoading.value = true;

	try {
		managedChannelEvents.value = await misskeyApi('events/pending', {
			limit: 100,
			channelId: props.channelId,
			status: channelManageStatus.value,
		});
	} catch (error) {
		console.error(error);
		managedChannelEvents.value = [];
	} finally {
		channelManageLoading.value = false;
	}
}

function formatEventDate(dateStr: string): string {
	const d = new Date(dateStr);
	return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function openEvent(eventId: string) {
	router.push('/events/:eventId', { params: { eventId } });
}

async function approveChannelEvent(eventId: string) {
	await misskeyApi('events/approve', { eventId });
	os.alert({ type: 'success', text: i18n.ts._events.eventApproved });
	await Promise.all([fetchManagedChannelEvents(), fetchChannelEvents()]);
}

async function rejectChannelEvent(eventId: string) {
	await misskeyApi('events/reject', { eventId });
	os.alert({ type: 'success', text: i18n.ts._events.eventRejected });
	await Promise.all([fetchManagedChannelEvents(), fetchChannelEvents()]);
}

async function refreshManagedChannelEvents() {
	await Promise.all([fetchManagedChannelEvents(), fetchChannelEvents()]);
}

const channelCalendarEvents = computed(() => {
	return channelEvents.value.map(ev => ({
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
	if (channel.value) {
		const headerItems: PageHeaderItem[] = [];

		headerItems.push({
			icon: 'ti ti-link',
			text: i18n.ts.copyUrl,
			handler: async (): Promise<void> => {
				if (!channel.value) {
					console.warn('failed to copy channel URL. channel.value is null.');
					return;
				}
				copyToClipboard(`${url}/channels/${channel.value.id}`);
			},
		});

		if (isSupportShare()) {
			headerItems.push({
				icon: 'ti ti-share',
				text: i18n.ts.share,
				handler: async (): Promise<void> => {
					if (!channel.value) {
						console.warn('failed to share channel. channel.value is null.');
						return;
					}

					navigator.share({
						title: channel.value.name,
						text: channel.value.description ?? undefined,
						url: `${url}/channels/${channel.value.id}`,
					});
				},
			});
		}

		if (!channel.value.isMuting) {
			headerItems.push({
				icon: 'ti ti-volume',
				text: i18n.ts.mute,
				handler: async (): Promise<void> => {
					await mute();
				},
			});
		} else {
			headerItems.push({
				icon: 'ti ti-volume-off',
				text: i18n.ts.unmute,
				handler: async (): Promise<void> => {
					await unmute();
				},
			});
		}

		if (($i && $i.id === channel.value.userId) || iAmModerator || ($i && isChannelCollaborator(channel.value, $i.id))) {
			headerItems.push({
				icon: 'ti ti-settings',
				text: i18n.ts.edit,
				handler: edit,
			});
		}

		return headerItems.length > 0 ? headerItems : null;
	} else {
		return null;
	}
});

const headerTabs = computed(() => [{
	key: 'overview',
	title: i18n.ts.overview,
	icon: 'ti ti-info-circle',
}, {
	key: 'timeline',
	title: i18n.ts.timeline,
	icon: 'ti ti-home',
}, {
	key: 'featured',
	title: i18n.ts.featured,
	icon: 'ti ti-bolt',
}, {
	key: 'events',
	title: i18n.ts._events.eventCalendar,
	icon: 'ti ti-calendar-event',
	}, ...(canManageChannelEvents.value ? [{
		key: 'manage',
		title: i18n.ts.manage,
		icon: 'ti ti-settings',
	}] : []), {
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}]);

const spacerStyle = computed(() => {
	const wide = tab.value === 'events' || tab.value === 'manage';
	return {
		'--MI_SPACER-w': wide ? '1040px' : '700px',
	};
});

definePage(() => ({
	title: channel.value ? channel.value.name : i18n.ts.channel,
	icon: 'ti ti-device-tv',
}));
</script>

<style lang="scss" module>
.footer {
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.5);
	border-top: solid 0.5px var(--MI_THEME-divider);
}

.bannerContainer {
	position: relative;
}

.subscribe {
	position: absolute;
	z-index: 1;
	top: 16px;
	left: 16px;
}

.favorite {
	position: absolute;
	z-index: 1;
	top: 16px;
	right: 16px;
}

.banner {
	position: relative;
	height: 200px;
	background-position: center;
	background-size: cover;
}

.bannerFade {
	position: absolute;
	bottom: 0;
	left: 0;
	width: 100%;
	height: 64px;
	background: linear-gradient(0deg, var(--MI_THEME-panel), color(from var(--MI_THEME-panel) srgb r g b / 0));
}

.bannerStatus {
	position: absolute;
	z-index: 1;
	bottom: 16px;
	right: 16px;
	padding: 8px 12px;
	font-size: 80%;
	background: rgba(0, 0, 0, 0.7);
	border-radius: 6px;
	color: #fff;
}

.description {
	padding: 16px;
}

.sensitiveIndicator {
	position: absolute;
	z-index: 1;
	bottom: 16px;
	left: 16px;
	background: rgba(0, 0, 0, 0.7);
	color: var(--MI_THEME-warn);
	border-radius: 6px;
	font-weight: bold;
	font-size: 1em;
	padding: 4px 7px;
}

.eventsContainer {
	padding: 16px;
}

.managePanel {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

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

.eventsActions {
	display: flex;
	justify-content: flex-end;
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
	width: 28px;
	height: 28px;
}

.actions {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}
</style>
