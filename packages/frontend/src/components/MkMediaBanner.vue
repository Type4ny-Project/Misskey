<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" @mousedown="onPointerDown" @touchstart="onPointerDown" @mouseup="onPointerUp" @mouseleave="onPointerUp" @touchend="onPointerUp" @touchcancel="onPointerUp">
	<MkMediaAudio v-if="media.type.startsWith('audio') && media.type !== 'audio/midi'" :audio="media"/>
	<Transition name="fade">
		<div v-if="isActuallyHidden" :class="$style.sensitive" @click="reveal">
			<span style="font-size: 1.6em;"><i class="ti ti-alert-triangle"></i></span>
			<b>{{ i18n.ts.sensitive }}</b>
			<span>{{ i18n.ts.clickToShow }}</span>
		</div>
	</Transition>
	<a
		v-if="!isActuallyHidden"
		:class="$style.download"
		:href="media.url"
		:title="media.name"
		:download="media.name"
	>
		<span style="font-size: 1.6em;"><i class="ti ti-download"></i></span>
		<b>{{ media.name }}</b>
	</a>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import MkMediaAudio from '@/components/MkMediaAudio.vue';
import { prefer } from '@/preferences.js';
import { shouldHideFileByDefault, canRevealFile } from '@/utility/sensitive-file.js';

const props = defineProps<{
	media: Misskey.entities.DriveFile;
}>();

const hide = ref(shouldHideFileByDefault(props.media));
const isRevealingByTap = ref(false);
const isActuallyHidden = computed(() => hide.value && !isRevealingByTap.value);

async function reveal() {
	if (prefer.s.revealSensitiveMediaByTapHold) {
		return;
	}

	if (!(await canRevealFile(props.media))) {
		return;
	}

	hide.value = false;
}

function onPointerDown() {
	if (!prefer.s.revealSensitiveMediaByTapHold) return;
	if (!hide.value) return;
	isRevealingByTap.value = true;
}

function onPointerUp() {
	if (!prefer.s.revealSensitiveMediaByTapHold) return;
	isRevealingByTap.value = false;
}
</script>

<style lang="scss" module>
.root {
	width: 100%;
	border-radius: 4px;
	margin-top: 4px;
	overflow: clip;
}

.download,
.sensitive {
	display: flex;
	align-items: center;
	font-size: 12px;
	padding: 8px 12px;
	white-space: nowrap;
}

.download {
}

.sensitive {
	background: #111;
	color: #fff;
}

.audio {
	border-radius: 8px;
	overflow: clip;
}
</style>
