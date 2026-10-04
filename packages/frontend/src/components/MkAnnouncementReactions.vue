<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="announcement.reactionsEnabled && (Object.keys(announcement.reactions).length > 0 || (interactive && $i))" :class="$style.root">
	<template v-for="(count, reaction) in announcement.reactions" :key="reaction">
		<button
			v-if="interactive && $i"
			type="button"
			class="_button"
			:class="[$style.reaction, { [$style.reacted]: announcement.myReaction === reaction }]"
			:disabled="pending"
			:aria-label="`${reaction} (${count})`"
			:aria-pressed="announcement.myReaction === reaction"
			@click="react(announcement.myReaction === reaction ? null : reaction)"
		>
			<MkReactionIcon :reaction="reaction"/>
			<span>{{ count }}</span>
		</button>
		<span v-else :class="[$style.reaction, { [$style.reacted]: announcement.myReaction === reaction }]">
			<MkReactionIcon :reaction="reaction"/>
			<span>{{ count }}</span>
		</span>
	</template>
	<button
		v-if="interactive && $i"
		ref="pickerButton"
		type="button"
		class="_button"
		:class="$style.reaction"
		:disabled="pending"
		:aria-label="i18n.ts.doReaction"
		@click="choose"
	>
		<i class="ti ti-mood-plus"></i>
	</button>
</div>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef } from 'vue';
import type * as Misskey from 'misskey-js';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { reactionPicker } from '@/utility/reaction-picker.js';

type ReactionState = Pick<Misskey.entities.Announcement, 'reactions' | 'myReaction'>;

const props = defineProps<{
	announcement: Misskey.entities.Announcement;
	interactive?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'update', state: ReactionState): void;
}>();

const pending = ref(false);
const pickerButton = useTemplateRef('pickerButton');

async function react(reaction: string | null) {
	if (!$i || !props.interactive || pending.value) return;
	pending.value = true;
	try {
		const updated = await os.apiWithDialog('announcements/react', {
			announcementId: props.announcement.id,
			reaction,
		});
		emit('update', { reactions: updated.reactions, myReaction: updated.myReaction });
	} catch {
		// apiWithDialog displays the error; keep the last confirmed reaction state.
	} finally {
		pending.value = false;
	}
}

function choose() {
	if (!$i || !props.interactive || pending.value) return;
	reactionPicker.show(pickerButton.value, null, reaction => {
		void react(reaction);
	}, undefined, true);
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 16px;
}

.reaction {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 6px 10px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-buttonBg);
	font-size: 1.2em;
}

.reacted {
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	box-shadow: inset 0 0 0 1px var(--MI_THEME-accent);
}
</style>
