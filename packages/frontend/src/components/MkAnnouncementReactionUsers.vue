<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #label>{{ i18n.ts._announcement.reactionUsers }}</template>
	<template #icon><i class="ti ti-users"></i></template>
	<MkPagination v-slot="{ items }" :paginator="paginator">
		<div class="_gaps_s">
			<div v-for="item in items" :key="item.id" :class="$style.user">
				<MkA :to="`/admin/user/${item.user.id}`" :class="$style.profile">
					<MkUserCardMini :user="item.user" :withChart="false"/>
				</MkA>
				<MkReactionIcon :reaction="item.reaction"/>
			</div>
		</div>
	</MkPagination>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import MkFolder from '@/components/MkFolder.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { i18n } from '@/i18n.js';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{
	announcementId: string;
}>();

const paginator = markRaw(new Paginator('admin/announcements/reactions', {
	limit: 20,
	computedParams: computed(() => ({ announcementId: props.announcementId })),
}));
</script>

<style lang="scss" module>
.user {
	display: flex;
	align-items: center;
	gap: 12px;
}

.profile {
	flex: 1;
	min-width: 0;
}
</style>
