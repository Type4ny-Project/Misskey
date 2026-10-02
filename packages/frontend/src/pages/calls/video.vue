<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<figure class="_panel" :class="$style.root">
	<video :srcObject.prop="stream" autoplay muted playsinline controls :aria-label="label" :class="$style.video"></video>
	<figcaption :class="$style.caption">{{ label }}</figcaption>
</figure>
</template>

<script setup lang="ts">
defineProps<{
	stream: MediaStream;
	label: string;
}>();
</script>

<style lang="scss" module>
.root {
	margin: 0;
	overflow: hidden;
	min-width: 0;
}

.video {
	display: block;
	width: 100%;
	aspect-ratio: 16 / 9;
	object-fit: contain;
	background: var(--MI_THEME-bg);
}

.caption {
	padding: 12px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
