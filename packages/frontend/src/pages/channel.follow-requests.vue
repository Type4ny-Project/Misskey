<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkPagination :paginator="requestsPaginator">
	<template #empty><MkResult type="empty" :text="i18n.ts.noFollowRequests"/></template>
	<template #default="{ items }">
		<div class="_gaps">
			<div v-for="request in items" :key="request.id" class="_panel" :class="$style.userItem">
				<MkUserCardMini :user="request.user"/>
				<div :class="$style.actions">
					<MkButton primary rounded @click="approve(request.user)"><i class="ti ti-check"></i> {{ i18n.ts.approve }}</MkButton>
					<MkButton danger rounded @click="reject(request.user)"><i class="ti ti-x"></i> {{ i18n.ts.reject }}</MkButton>
				</div>
			</div>
		</div>
	</template>
</MkPagination>
</template>

<script setup lang="ts">
import { markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{
	channelId: string;
}>();
const emit = defineEmits<{
	resolved: [approved: boolean];
}>();

const requestsPaginator = markRaw(new Paginator('channels/follow-requests/list', {
	limit: 10,
	params: { channelId: props.channelId },
}));

async function approve(user: Misskey.entities.UserLite) {
	await os.apiWithDialog('channels/follow-requests/approve', {
		channelId: props.channelId,
		userId: user.id,
	});
	await requestsPaginator.reload();
	emit('resolved', true);
}

async function reject(user: Misskey.entities.UserLite) {
	const { canceled } = await os.confirm({
		type: 'question',
		text: i18n.tsx.rejectFollowRequestConfirm({ name: user.name || user.username }),
	});
	if (canceled) return;

	await os.apiWithDialog('channels/follow-requests/reject', {
		channelId: props.channelId,
		userId: user.id,
	});
	await requestsPaginator.reload();
	emit('resolved', false);
}
</script>

<style lang="scss" module>
.userItem {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px;
}

.actions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
</style>
