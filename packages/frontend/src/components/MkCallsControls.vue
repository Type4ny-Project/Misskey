<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div v-if="state.role !== 'listener'" :class="$style.group">
		<button type="button" class="_button" :class="$style.action" :aria-label="state.muted ? i18n.ts._calls.unmute : i18n.ts._calls.mute" :title="state.muted ? i18n.ts._calls.unmute : i18n.ts._calls.mute" :aria-pressed="state.muted" :disabled="state.joining" @click="emit('mute')">
			<i :class="state.muted ? 'ti ti-microphone-off' : 'ti ti-microphone'"></i>
		</button>
		<button type="button" class="_button" :class="$style.settings" :aria-label="i18n.ts._calls.selectMicrophone" :title="i18n.ts._calls.selectMicrophone" aria-haspopup="menu" :disabled="state.joining || state.busy" @click="emit('microphoneSettings', $event)"><i class="ti ti-chevron-down"></i></button>
		<button type="button" class="_button" :class="[$style.action, state.cameraOn && $style.active]" :aria-label="state.cameraOn ? i18n.ts._calls.stopCamera : i18n.ts._calls.startCamera" :title="state.cameraOn ? i18n.ts._calls.stopCamera : i18n.ts._calls.startCamera" :aria-pressed="state.cameraOn" :disabled="videoDisabled" @click="emit('camera')">
			<i :class="state.cameraOn ? 'ti ti-video' : 'ti ti-video-off'"></i>
		</button>
		<button type="button" class="_button" :class="$style.settings" :aria-label="i18n.ts._calls.cameraSettings" :title="i18n.ts._calls.cameraSettings" aria-haspopup="menu" :disabled="videoDisabled" @click="emit('cameraSettings', $event)"><i class="ti ti-chevron-down"></i></button>
	</div>
	<div v-else-if="state.speakerRequestEnabled" :class="$style.group">
		<button type="button" class="_button" :class="[$style.action, state.speakerRequested && $style.active]" :aria-label="state.speakerRequested ? i18n.ts._calls.cancelSpeakerRequest : i18n.ts._calls.requestSpeaker" :title="state.speakerRequested ? i18n.ts._calls.cancelSpeakerRequest : i18n.ts._calls.requestSpeaker" :aria-pressed="state.speakerRequested" :disabled="state.joining" @click="emit('speakerRequest')"><i class="ti ti-hand-stop"></i></button>
	</div>
	<div v-if="state.role !== 'listener' && state.screenSupported" :class="$style.group">
		<button type="button" class="_button" :class="[$style.action, state.screenOn && $style.active]" :aria-label="state.screenOn ? i18n.ts._calls.stopScreenSharing : i18n.ts._calls.startScreenSharing" :title="state.screenOn ? i18n.ts._calls.stopScreenSharing : i18n.ts._calls.startScreenSharing" :aria-pressed="state.screenOn" :disabled="videoDisabled" @click="emit('screen')"><i class="ti ti-screen-share"></i></button>
		<button type="button" class="_button" :class="$style.settings" :aria-label="i18n.ts._calls.screenSettings" :title="i18n.ts._calls.screenSettings" aria-haspopup="menu" :disabled="videoDisabled" @click="emit('screenSettings', $event)"><i class="ti ti-chevron-down"></i></button>
	</div>
	<slot></slot>
	<button type="button" class="_button" :class="[$style.action, $style.leave]" :aria-label="state.role === 'host' ? i18n.ts._calls.endRoom : i18n.ts._calls.leaveRoom" :title="state.role === 'host' ? i18n.ts._calls.endRoom : i18n.ts._calls.leaveRoom" :disabled="state.joining" @click="emit('leave')"><i class="ti ti-phone-off"></i></button>
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { useCallsSession } from '@/utility/calls-session.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	state: ReturnType<typeof useCallsSession>['controls']['value'];
}>();
const emit = defineEmits<{
	(ev: 'mute' | 'camera' | 'screen' | 'speakerRequest' | 'leave'): void;
	(ev: 'microphoneSettings' | 'cameraSettings' | 'screenSettings', event: MouseEvent): void;
}>();
const videoDisabled = computed(() => props.state.joining || props.state.busy || props.state.status !== 'connected');
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	flex-wrap: wrap;
}

.group {
	display: flex;
	align-items: center;
	padding: 4px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 14px;
	background: var(--MI_THEME-panel);
}

.action, .settings {
	display: inline-grid;
	place-items: center;
	height: 40px;
	border-radius: 9px;
	transition: background-color 0.15s ease, color 0.15s ease;
	&:hover:not(:disabled) { background: var(--MI_THEME-buttonHoverBg); }
	&:disabled { opacity: 0.4; cursor: not-allowed; }
}

.action { width: 36px; font-size: 20px; }
.settings { width: 28px; font-size: 13px; }
.active { color: var(--MI_THEME-accent); }
.leave {
	width: 48px;
	height: 48px;
	border-radius: 14px;
	color: var(--MI_THEME-fgOnAccent);
	background: var(--MI_THEME-error);
	&:hover:not(:disabled) { background: var(--MI_THEME-error); opacity: 0.8; }
}
</style>
