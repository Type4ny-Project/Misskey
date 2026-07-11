<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader/></template>
	<MkSpacer :contentMax="720">
		<div class="_gaps">
			<form class="_panel _gaps" :class="$style.form" @submit.prevent="createRoom">
				<h2>{{ i18n.ts._calls.createRoom }}</h2>
				<MkInput v-model="title" required><template #label>{{ i18n.ts._calls.roomTitle }}</template></MkInput>
				<MkTextarea v-model="description"><template #label>{{ i18n.ts._calls.roomDescription }}</template></MkTextarea>
				<MkSelect v-model="attachmentType" :items="attachmentTypeItems">
					<template #label>{{ i18n.ts._calls.attachmentType }}</template>
				</MkSelect>
				<MkInput v-if="attachmentType === 'chatRoom'" v-model="chatRoomId" required><template #label>{{ i18n.ts._calls.chatRoomId }}</template></MkInput>
				<MkSelect v-else v-model="visibility" :items="visibilityItems">
					<template #label>{{ i18n.ts._calls.visibility }}</template>
				</MkSelect>
				<MkButton type="submit" primary :disabled="creating">{{ i18n.ts._calls.createRoom }}</MkButton>
			</form>

			<MkLoading v-if="loading"/>
			<MkResult v-else-if="rooms.length === 0" type="empty"/>
			<MkA v-for="room in rooms" :key="room.id" :to="`/calls/${room.id}`" class="_panel" :class="$style.room">
				<strong>{{ room.title }}</strong>
				<span>{{ i18n.ts._calls[room.state] }}</span>
				<small>{{ room.description }}</small>
			</MkA>
		</div>
	</MkSpacer>
</MkStickyContainer>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import type { MkSelectItem } from '@/components/MkSelect.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useRouter } from '@/router.js';

const router = useRouter();
const rooms = ref<Misskey.entities.CallsRoom[]>([]);
const loading = ref(true);
const creating = ref(false);
const title = ref('');
const description = ref('');
const attachmentType = ref<'personal' | 'chatRoom'>('personal');
const chatRoomId = ref('');
const visibility = ref<'public' | 'followers' | 'specified'>('public');
const attachmentTypeItems: MkSelectItem<'personal' | 'chatRoom'>[] = [
	{ label: i18n.ts._calls.personalRoom, value: 'personal' },
	{ label: i18n.ts._calls.chatRoom, value: 'chatRoom' },
];
const visibilityItems: MkSelectItem<'public' | 'followers' | 'specified'>[] = [
	{ label: i18n.ts._calls.public, value: 'public' },
	{ label: i18n.ts._calls.followers, value: 'followers' },
	{ label: i18n.ts._calls.specified, value: 'specified' },
];

async function reload() {
	loading.value = true;
	rooms.value = await misskeyApi('calls/rooms/list', { limit: 50 });
	loading.value = false;
}

async function createRoom() {
	creating.value = true;
	try {
		const room = await misskeyApi('calls/rooms/create', {
			attachmentType: attachmentType.value,
			chatRoomId: attachmentType.value === 'chatRoom' ? chatRoomId.value : undefined,
			title: title.value, description: description.value,
			visibility: attachmentType.value === 'personal' ? visibility.value : undefined,
		});
		router.push('/calls/:roomId', { params: { roomId: room.id } });
	} finally { creating.value = false; }
}

onMounted(reload);

definePage(() => ({ title: i18n.ts._calls.title, icon: 'ti ti-phone' }));
</script>

<style lang="scss" module>
.form { padding: 24px; }
.room { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 16px; color: var(--MI_THEME-fg); }
.room small { grid-column: 1 / -1; opacity: 0.7; }
</style>
