<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="[]" :tabs="[]">
	<div :class="$style.root">
		<div :class="$style.form">
			<MkInput v-model="title" :class="$style.field">
				<template #label>{{ i18n.ts._events.title }} *</template>
			</MkInput>

			<MkInput v-model="startAtStr" type="datetime-local" :class="$style.field">
				<template #label>{{ i18n.ts._events.startAt }} *</template>
			</MkInput>

			<MkInput v-model="endAtStr" type="datetime-local" :class="$style.field">
				<template #label>{{ i18n.ts._events.endAt }}</template>
			</MkInput>

			<MkTextarea v-model="description" :class="$style.field">
				<template #label>{{ i18n.ts._events.description }}</template>
			</MkTextarea>

			<MkInput v-model="url" type="url" :class="$style.field">
				<template #label>{{ i18n.ts._events.url }}</template>
			</MkInput>

			<MkInput v-model="tagsStr" :class="$style.field">
				<template #label>{{ i18n.ts._events.tags }}</template>
				<template #caption>{{ i18n.ts._events.tagsCaption }}</template>
			</MkInput>

			<div :class="$style.actions">
				<MkButton primary :disabled="!canSubmit" @click="submit">
					<i class="ti ti-check"></i>
					{{ isEdit ? i18n.ts._events.editEvent : i18n.ts._events.submitEvent }}
				</MkButton>
				<MkButton @click="cancel">
					{{ i18n.ts.cancel }}
				</MkButton>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';

const props = defineProps<{
	eventId?: string;
	channelId?: string;
}>();

const router = useRouter();
const isEdit = computed(() => !!props.eventId);

const title = ref('');
const startAtStr = ref('');
const endAtStr = ref('');
const description = ref('');
const url = ref('');
const tagsStr = ref('');

const canSubmit = computed(() => {
	return title.value.length > 0 && startAtStr.value.length > 0;
});

async function loadEvent() {
	if (!props.eventId) return;
	const event = await misskeyApi('events/show', { eventId: props.eventId });
	title.value = event.title;
	startAtStr.value = toLocalDatetime(event.startAt);
	if (event.endAt) endAtStr.value = toLocalDatetime(event.endAt);
	description.value = event.description ?? '';
	url.value = event.url ?? '';
	tagsStr.value = event.tags?.join(', ') ?? '';
}

function toLocalDatetime(isoStr: string): string {
	const d = new Date(isoStr);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function submit() {
	const tags = tagsStr.value
		.split(',')
		.map(t => t.trim())
		.filter(t => t.length > 0);

	try {
		if (isEdit.value) {
			await misskeyApi('events/update', {
				eventId: props.eventId!,
				title: title.value,
				startAt: new Date(startAtStr.value).getTime(),
				endAt: endAtStr.value ? new Date(endAtStr.value).getTime() : null,
				description: description.value || null,
				url: url.value || null,
				tags,
			});
			os.alert({ type: 'success', text: i18n.ts._events.eventUpdated });
			router.push('/events/:eventId', { params: { eventId: props.eventId! } });
		} else {
			const event = await misskeyApi('events/create', {
				title: title.value,
				startAt: new Date(startAtStr.value).getTime(),
				endAt: endAtStr.value ? new Date(endAtStr.value).getTime() : null,
				description: description.value || null,
				url: url.value || null,
				tags,
				...(props.channelId ? { channelId: props.channelId } : {}),
			});
			os.alert({ type: 'success', text: i18n.ts._events.eventSubmitted });
			router.push('/events/:eventId', { params: { eventId: event.id } });
		}
	} catch (e: any) {
		if (e.code === 'TOO_MANY_EVENTS') {
			os.alert({ type: 'error', text: i18n.ts._events.rateLimitReached });
		} else {
			os.alert({ type: 'error', text: e.message || i18n.ts._events.unknownError });
		}
	}
}

function cancel() {
	if (isEdit.value && props.eventId) {
		router.push('/events/:eventId', { params: { eventId: props.eventId } });
	} else {
		router.push('/events');
	}
}

onMounted(() => {
	if (isEdit.value) loadEvent();
});

definePage(() => ({
	title: isEdit.value ? i18n.ts._events.editEvent : i18n.ts._events.createEvent,
	icon: 'ti ti-calendar-plus',
}));
</script>

<style lang="scss" module>
.root {
	padding: 24px;
	max-width: 600px;
	margin: 0 auto;
}

.form {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.field {
	width: 100%;
}

.actions {
	display: flex;
	gap: 8px;
	margin-top: 8px;
}
</style>
