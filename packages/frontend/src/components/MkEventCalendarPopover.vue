<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" v-slot="{ type }" :zPriority="'high'" :anchorElement="anchorElement" :transparentBg="true" @click="modal?.close()" @closed="emit('closed')" @esc="modal?.close()">
	<div :class="[$style.root, { [$style.asDrawer]: type === 'drawer' }]">
		<div :class="$style.header">
			<div :class="$style.title">{{ props.events?.length ? props.title : event.title || i18n.ts.untitled }}</div>
			<div v-if="!props.events?.length && !props.createForm" :class="$style.time">{{ event.timeLabel }}</div>
		</div>

		<template v-if="props.events?.length">
			<div :class="$style.list">
				<button v-for="listEvent in props.events" :key="listEvent.id ?? `${listEvent.title}:${listEvent.timeLabel}`" class="_button" :class="$style.listItem" @click="openEvent(listEvent)">
					<div :class="$style.listItemTitle">{{ listEvent.title || i18n.ts.untitled }}</div>
					<div :class="$style.listItemTime">{{ listEvent.timeLabel }}</div>
				</button>
			</div>
		</template>

		<template v-else-if="props.createForm">
			<div :class="$style.form">
				<MkInput v-model="formTitle" :class="$style.field">
					<template #label>{{ i18n.ts._events.title }}</template>
				</MkInput>

				<MkInput v-model="startAtStr" type="datetime-local" :class="$style.field">
					<template #label>{{ i18n.ts._events.startAt }}</template>
				</MkInput>

				<MkTextarea v-model="description" :class="$style.field">
					<template #label>{{ i18n.ts._events.description }}</template>
				</MkTextarea>

				<MkInput v-model="url" type="url" :class="$style.field">
					<template #label>{{ i18n.ts._events.url }}</template>
				</MkInput>

				<div :class="$style.field">
					<div :class="$style.channelLabel">{{ i18n.ts._events.channel }}</div>
					<div :class="$style.channelActions">
						<MkButton @click="chooseChannel($event)">
							<i class="ti ti-device-tv"></i>
							{{ selectedChannelName ?? i18n.ts._events.channel }}
						</MkButton>
						<MkButton v-if="selectedChannelId != null" @click="clearChannel">
							{{ i18n.ts.clear }}
						</MkButton>
					</div>
				</div>

				<div :class="$style.actions">
					<MkButton primary :disabled="!canCreate" @click="createEvent">
						<i class="ti ti-plus"></i>
						{{ i18n.ts._events.createEvent }}
					</MkButton>
				</div>
			</div>
		</template>

		<template v-else>
			<div v-if="event.description" :class="$style.description">{{ event.description }}</div>

			<div v-if="event.durationLabel || event.channelName || (event.tags?.length ?? 0) > 0" :class="$style.meta">
				<div v-if="event.durationLabel">{{ event.durationLabel }}</div>
				<div v-if="event.channelName">#{{ event.channelName }}</div>
				<div v-if="(event.tags?.length ?? 0) > 0">{{ event.tags?.map(tag => `#${tag}`).join(' ') }}</div>
			</div>

			<button v-if="event.id" class="_button" :class="$style.detailsButton" @click="openDetails">
				<i class="ti ti-external-link"></i>
				{{ i18n.ts.details }}
			</button>
		</template>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkModal from '@/components/MkModal.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { favoritedChannelsCache, userChannelsCache, userChannelFollowingsCache } from '@/cache.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import { misskeyApi } from '@/utility/misskey-api.js';

type CalendarPopoverEvent = {
	id?: string;
	title: string;
	description?: string | null;
	timeLabel: string;
	durationLabel?: string | null;
	channelName?: string | null;
	tags?: string[] | null;
};

type CalendarCreateForm = {
	date: string;
	defaultChannelId?: string | null;
	defaultChannelName?: string | null;
};

const props = defineProps<{
	event: CalendarPopoverEvent;
	events?: CalendarPopoverEvent[];
	title?: string;
	createForm?: CalendarCreateForm;
	anchorElement?: HTMLElement | null;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
	(ev: 'created'): void;
}>();

const modal = useTemplateRef('modal');
const router = useRouter();
const createForm = computed(() => props.createForm);

const formTitle = ref('');
const description = ref('');
const url = ref('');
const selectedChannelId = ref<string | null>(createForm.value?.defaultChannelId ?? null);
const selectedChannelName = ref<string | null>(createForm.value?.defaultChannelName ?? null);
const startAtStr = ref(createForm.value ? `${createForm.value.date}T09:00` : '');
const canCreate = computed(() => formTitle.value.trim().length > 0 && startAtStr.value.length > 0);

function openDetails(): void {
	if (!props.event.id) return;
	router.push('/events/:eventId', { params: { eventId: props.event.id } });
	modal.value?.close();
}

function openEvent(event: CalendarPopoverEvent): void {
	if (!event.id) return;
	router.push('/events/:eventId', { params: { eventId: event.id } });
	modal.value?.close();
}

async function chooseChannel(ev?: Event): Promise<void> {
	const [ownedChannels, followedChannels, favoritedChannels] = await Promise.all([
		userChannelsCache.fetch(),
		userChannelFollowingsCache.fetch(),
		favoritedChannelsCache.fetch(),
	]);

	const channels = [...ownedChannels, ...followedChannels, ...favoritedChannels]
		.filter((channel, index, array) => array.findIndex(x => x.id === channel.id) === index)
		.sort((a, b) => a.name.localeCompare(b.name));

	os.popupMenu([
		...channels.map(channel => ({
			type: 'button' as const,
			text: channel.name,
			action: () => {
				selectedChannelId.value = channel.id;
				selectedChannelName.value = channel.name;
			},
		})),
		(channels.length === 0 ? undefined : { type: 'divider' as const }),
		{
			type: 'button' as const,
			text: i18n.ts.clear,
			action: () => clearChannel(),
		},
	].filter(item => item != null), (ev?.currentTarget ?? ev?.target ?? undefined) as HTMLElement | undefined);
}

function clearChannel(): void {
	selectedChannelId.value = null;
	selectedChannelName.value = null;
}

async function createEvent(): Promise<void> {
	if (!canCreate.value) return;

	try {
		await misskeyApi('events/create', {
			title: formTitle.value.trim(),
			startAt: new Date(startAtStr.value).getTime(),
			endAt: null,
			description: description.value.trim() || null,
			url: url.value.trim() || null,
			color: null,
			tags: [],
			channelId: selectedChannelId.value,
		});
		os.alert({ type: 'success', text: i18n.ts._events.eventSubmitted });
		emit('created');
		modal.value?.close();
	} catch (error) {
		const text = error instanceof Error ? error.message : i18n.ts._events.unknownError;
		os.alert({ type: 'error', text });
	}
}
</script>

<style lang="scss" module>
.root {
	min-width: 320px;
	max-width: 420px;
	padding: 14px;
	border-radius: 16px;
	-webkit-backdrop-filter: none;
	backdrop-filter: none;
	background: var(--MI_THEME-panel);

	&.asDrawer {
		width: 100%;
		max-width: none;
		border-radius: 24px;
		border-bottom-right-radius: 0;
		border-bottom-left-radius: 0;
		padding-bottom: max(env(safe-area-inset-bottom, 0px), 16px);
	}
}

.header {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin-bottom: 10px;
}

.title {
	font-size: 1rem;
	font-weight: 700;
	word-break: break-word;
}

.time {
	font-size: 0.85rem;
	color: var(--MI_THEME-fgTransparent);
}

.form {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.field {
	margin: 0;
}

.channelLabel {
	font-size: 0.9rem;
	font-weight: 700;
	margin-bottom: 8px;
}

.channelActions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.actions {
	display: flex;
	justify-content: flex-end;
}

.description {
	margin-bottom: 10px;
	font-size: 0.92rem;
	line-height: 1.5;
	white-space: pre-wrap;
	word-break: break-word;
}

.meta {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-bottom: 12px;
	font-size: 0.82rem;
	color: var(--MI_THEME-fgTransparent);
}

.detailsButton {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 8px 10px;
	border-radius: 10px;
	font-weight: 700;
	color: var(--MI_THEME-accent);

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	}
}

.list {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.listItem {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 4px;
	padding: 10px 12px;
	border-radius: 10px;
	text-align: left;
	background: color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	}
}

.listItemTitle {
	font-weight: 700;
	word-break: break-word;
}

.listItemTime {
	font-size: 0.82rem;
	color: var(--MI_THEME-fgTransparent);
}
</style>
