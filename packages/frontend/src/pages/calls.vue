<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template><div></div></template>

<script setup lang="ts">
import { onActivated } from 'vue';
import { useRouter } from '@/router.js';
import { openCallsCreation, openCallsRoom } from '@/utility/calls-window.js';

const props = defineProps<{ roomId?: string; join?: string }>();
const router = useRouter();
onActivated(() => {
	const roomId = props.roomId;
	const join = props.join === 'true';
	router.replace('/');
	if (roomId != null) void openCallsRoom(roomId, join);
	else void openCallsCreation();
});
</script>
