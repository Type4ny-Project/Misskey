<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkWindow ref="uiWindow" :initialWidth="400" :initialHeight="500" :canResize="true" @closed="emit('closed')">
	<template #header>
		<i class="ti ti-exclamation-circle" style="margin-right: 0.5em;"></i>
		<I18n :src="i18n.ts.reportAbuseOf" tag="span">
			<template #name>
				<b><MkAcct :user="user"/></b>
			</template>
		</I18n>
	</template>
	<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
		<div class="_gaps_m" :class="$style.root">
			<div class="">
				<MkTextarea v-model="comment">
					<template #label>{{ i18n.ts.details }}</template>
					<template #caption>{{ i18n.ts.fillAbuseReportDescription }}</template>
				</MkTextarea>
			</div>
			<div v-if="calls" class="_gaps_s">
				<strong>{{ calls.roomTitle }}</strong>
				<MkSwitch v-model="attachRecording" :disabled="calls.capture == null">{{ i18n.ts._calls.attachRecording }}</MkSwitch>
				<small>{{ i18n.ts._calls.recordingDescription }}</small>
				<MkInfo v-if="capturing && attachRecording">{{ i18n.ts._calls.recordingCapturing }}</MkInfo>
				<audio v-if="recordingUrl && attachRecording" :src="recordingUrl" controls :aria-label="i18n.ts._calls.recordingEvidence" style="width: 100%;"></audio>
				<MkInfo v-if="!capturing && recording == null" warn>{{ i18n.ts._calls.recordingUnavailable }}</MkInfo>
			</div>
			<div class="">
				<MkButton primary full :disabled="comment.trim().length === 0 || comment.length > 2048 || sending || (attachRecording && capturing)" @click="send">{{ i18n.ts.send }}</MkButton>
			</div>
		</div>
	</div>
</MkWindow>
</template>

<script setup lang="ts">
import { onUnmounted, ref, shallowRef, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInfo from '@/components/MkInfo.vue';
import { callsRecordingToBase64 } from '@/utility/calls-report-recording.js';
import type { CallsReportCapture } from '@/utility/calls-report-recording.js';
import MkWindow from '@/components/MkWindow.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	user: Misskey.entities.UserLite;
	initialComment?: string;
	calls?: { roomId: string; roomTitle: string; reportedAt: number; capture: CallsReportCapture | null };
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const uiWindow = useTemplateRef('uiWindow');
const comment = ref(props.initialComment ?? '');

const recording = shallowRef<Blob | null>(null);
const recordingUrl = ref<string | null>(null);
const capturing = ref(props.calls?.capture != null);
const attachRecording = ref(props.calls?.capture != null);
const sending = ref(false);
let disposed = false;

void props.calls?.capture?.recording.then(blob => {
	if (disposed) return;
	recording.value = blob;
	if (blob != null) recordingUrl.value = URL.createObjectURL(blob);
	else attachRecording.value = false;
	capturing.value = false;
});

onUnmounted(() => {
	disposed = true;
	props.calls?.capture?.cancel();
	if (recordingUrl.value != null) URL.revokeObjectURL(recordingUrl.value);
});

async function send(): Promise<void> {
	if (sending.value || comment.value.trim().length === 0 || comment.value.length > 2048 || (attachRecording.value && capturing.value)) return;
	sending.value = true;
	try {
		if (props.calls != null) {
			const audio = attachRecording.value && recording.value != null ? await callsRecordingToBase64(recording.value) : undefined;
			await os.apiWithDialog('calls/rooms/report-abuse', {
				roomId: props.calls.roomId, userId: props.user.id,
				comment: comment.value, reportedAt: props.calls.reportedAt, recording: audio,
			});
		} else {
			await os.apiWithDialog('users/report-abuse', { userId: props.user.id, comment: comment.value });
		}
		void os.alert({ type: 'success', text: i18n.ts.abuseReported });
		uiWindow.value?.close();
		emit('closed');
	} finally {
		sending.value = false;
	}
}

</script>

<style lang="scss" module>
.root {
	--root-margin: 16px;
}
</style>
