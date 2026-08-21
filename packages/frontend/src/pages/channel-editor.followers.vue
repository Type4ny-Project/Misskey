<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #label>{{ i18n.ts._channel.followerManagement }}</template>
	<div class="_gaps">
		<MkFolder>
			<template #label>{{ i18n.ts._channel.followRequests }}</template>
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
		</MkFolder>

		<MkFolder>
			<template #label>{{ i18n.ts.followers }}</template>
			<MkPagination :paginator="followersPaginator">
				<template #empty><MkResult type="empty" :text="i18n.ts._channel.noFollowers"/></template>
				<template #default="{ items }">
					<div class="_gaps">
						<div v-for="following in items" :key="following.id" class="_panel" :class="$style.userItem">
							<MkUserCardMini :user="following.user"/>
							<MkButton danger rounded @click="remove(following.user)"><i class="ti ti-user-minus"></i> {{ i18n.ts.remove }}</MkButton>
						</div>
					</div>
				</template>
			</MkPagination>
		</MkFolder>
	</div>
</MkFolder>
</template>

<script setup lang="ts">
import { markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{
	channelId: string;
}>();

const requestsPaginator = markRaw(new Paginator('channels/follow-requests/list', {
	limit: 10,
	params: { channelId: props.channelId },
}));
const followersPaginator = markRaw(new Paginator('channels/followers', {
	limit: 10,
	params: { channelId: props.channelId },
}));

async function approve(user: Misskey.entities.UserLite) {
	await os.apiWithDialog('channels/follow-requests/approve', {
		channelId: props.channelId,
		userId: user.id,
	});
	await Promise.all([requestsPaginator.reload(), followersPaginator.reload()]);
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
}

async function remove(user: Misskey.entities.UserLite) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx._channel.removeFollowerConfirm({ name: user.name || user.username }),
	});
	if (canceled) return;

	await os.apiWithDialog('channels/followers/remove', {
		channelId: props.channelId,
		userId: user.id,
	});
	await followersPaginator.reload();
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
