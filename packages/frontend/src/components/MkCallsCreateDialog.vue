<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialog" :width="480" :height="480" @close="dialog?.close()" @esc="dialog?.close()" @closed="emit('closed')">
	<template #header><i class="ti ti-wave-sine"></i> {{ i18n.ts._calls.createRoom }}</template>
	<form :class="$style.form" @submit.prevent="createCall">
		<MkInput v-model="title" required :maxlength="256"><template #label>{{ i18n.ts._calls.roomTitle }}</template></MkInput>
		<MkSelect v-model="mode" :items="speakerOptions"><template #label>{{ i18n.ts._calls.whoCanSpeak }}</template></MkSelect>
		<MkButton primary rounded type="submit" :disabled="creating || title.trim() === ''" :wait="creating">{{ i18n.ts._calls.startCall }}</MkButton>
	</form>
</MkModalWindow>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import type { MkSelectItem } from '@/components/MkSelect.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { openCallsRoom } from '@/utility/calls-window.js';

const emit = defineEmits<{ (ev: 'closed'): void }>();
const dialog = shallowRef<InstanceType<typeof MkModalWindow>>();
const title = ref('');
const mode = ref<'open' | 'stage'>('open');
const creating = ref(false);
const speakerOptions: MkSelectItem<'open' | 'stage'>[] = [
	{ value: 'open', label: i18n.ts._calls.everyoneCanSpeak },
	{ value: 'stage', label: i18n.ts._calls.approvedSpeakersOnly },
];

async function createCall(): Promise<void> {
	if (creating.value || title.value.trim() === '') return;
	creating.value = true;
	try {
		let room = await misskeyApi('calls/rooms/create', {
			attachmentType: 'personal', title: title.value.trim(), mode: mode.value, visibility: 'public',
		});
		room = await misskeyApi('calls/rooms/open', { roomId: room.id, expectedRevision: room.revision });
		await openCallsRoom(room.id, true);
		dialog.value?.close();
	} catch (error) {
		console.error('[Calls] Room creation failed', error);
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	} finally {
		creating.value = false;
	}
}

</script>

<style lang="scss" module>
.form { display: flex; flex-direction: column; gap: 24px; padding: 24px; }
</style>
