<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkTooltip :showing="showing" :anchorElement="anchorElement" :maxWidth="180" @closed="emit('closed')">
	<div :class="$style.root">
		<MkCustomEmoji v-if="emoji.startsWith(':')" :class="$style.image" :name="emoji" :fallbackToImage="true"/>
		<MkEmoji v-else :class="$style.image" :emoji="emoji"/>
	</div>
</MkTooltip>
</template>

<script lang="ts" setup>
import MkTooltip from '@/components/MkTooltip.vue';

defineProps<{
	showing: boolean;
	emoji: string;
	anchorElement: HTMLElement;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();
</script>

<style lang="scss" module>
.root {
	text-align: center;
}

.image {
	display: block;
	width: 128px;
	height: 128px;
	font-size: 110px;
	line-height: 128px;
	text-align: center;
	object-fit: contain;
	filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.3));
}
</style>
