<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkPagination :paginator="followersPaginator">
	<template #empty><MkResult type="empty" :text="i18n.ts._channel.noFollowers"/></template>
	<template #default="{ items }">
		<div class="_gaps">
			<div v-for="following in items" :key="following.id" class="_panel" :class="$style.userItem">
				<MkUserCardMini :user="following.user"/>
				<MkButton v-if="!managerIds.includes(following.user.id)" danger rounded @click="remove(following.user)"><i class="ti ti-user-minus"></i> {{ i18n.ts.remove }}</MkButton>
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
	managerIds: string[];
}>();
const emit = defineEmits<{
	removed: [];
}>();

const followersPaginator = markRaw(new Paginator('channels/followers', {
	limit: 10,
	params: { channelId: props.channelId },
}));

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
	emit('removed');
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
</style>
