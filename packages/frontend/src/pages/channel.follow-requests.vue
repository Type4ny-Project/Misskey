<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkPagination :paginator="requestsPaginator">
	<template #empty><MkResult type="empty" :text="i18n.ts.noFollowRequests"/></template>
	<template #default="{ items }">
		<div class="_gaps" :class="$style.requests">
			<div v-for="request in items" :key="request.id" class="_panel" :class="$style.user">
				<MkAvatar :class="$style.avatar" :user="request.user" indicator link preview/>
				<div :class="$style.body">
					<div :class="$style.name">
						<MkA v-user-preview="request.user.id" :class="$style.displayName" :to="userPage(request.user)"><MkUserName :user="request.user"/></MkA>
						<p :class="$style.acct">@{{ acct(request.user) }}</p>
					</div>
					<div :class="$style.commands">
						<MkButton rounded primary @click="approve(request.user)"><i class="ti ti-check"></i> {{ i18n.ts.accept }}</MkButton>
						<MkButton rounded danger @click="reject(request.user)"><i class="ti ti-x"></i> {{ i18n.ts.reject }}</MkButton>
					</div>
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
import { acct, userPage } from '@/filters/user.js';
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
.user {
	display: flex;
	padding: 16px;
}

.avatar {
	display: block;
	flex-shrink: 0;
	margin: 0 12px 0 0;
	width: 42px;
	height: 42px;
	border-radius: 8px;
}

.body {
	display: flex;
	width: calc(100% - 54px);
	position: relative;
	flex-wrap: wrap;
	gap: 8px;
}

.name {
	flex: 1 1 50%;
}

.displayName,
.acct {
	display: block;
	white-space: nowrap;
	text-overflow: ellipsis;
	overflow: hidden;
	margin: 0;
}

.displayName {
	line-height: 24px;
}

.acct {
	line-height: 16px;
	opacity: 0.7;
}

.commands {
	display: flex;
	gap: 8px;
}
</style>
