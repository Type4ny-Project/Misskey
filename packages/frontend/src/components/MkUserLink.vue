<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
	<span v-if="error">{{ userId }}</span>
	<MkA v-else-if="user" :to="userPage(user)">
		<MkUserName :user="user" :nowrap="false"/>
		<span class="acct"><MkAcct :user="user"/></span>
	</MkA>
	<MkLoading v-else/>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { userPage } from '@/filters/user.js';

const props = defineProps<{
	userId: string;
}>();

const user = ref<Misskey.entities.UserDetailed | null>(null);
const error = ref(false);

const fetchUser = async () => {
	user.value = null;
	error.value = false;

	try {
		user.value = await misskeyApi('users/show', { userId: props.userId });
	} catch {
		error.value = true;
	}
};

watch(() => props.userId, fetchUser, { immediate: true });
</script>

<style lang="scss" scoped>
.acct {
	margin-left: 0.5em;
	opacity: 0.7;
}
</style>
