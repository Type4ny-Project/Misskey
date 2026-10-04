<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkA :to="notePage(appearNote)" :class="$style.root">
	<MkAvatar :user="appearNote.user" :class="$style.avatar"/>
	<span :class="$style.author">{{ appearNote.user.name || appearNote.user.username }}</span>
	<span :class="$style.time"><MkTime :time="note.createdAt"/></span>
	<span v-if="isRenote" :title="i18n.tsx.renotedBy({ user: note.user.name || note.user.username })" :aria-label="i18n.ts.renote"><i class="ti ti-repeat" aria-hidden="true"></i></span>
	<template v-if="hasContent">
		<span v-if="appearNote.replyId" :title="i18n.ts.reply" :aria-label="i18n.ts.reply"><i class="ti ti-arrow-back-up" aria-hidden="true"></i></span>
		<span v-if="appearNote.renoteId" :title="i18n.ts.quote" :aria-label="i18n.ts.quote"><i class="ti ti-quote" aria-hidden="true"></i></span>
		<span v-if="appearNote.cw != null" :title="i18n.ts._compactTimeline.cw" :aria-label="i18n.ts._compactTimeline.cw"><i class="ti ti-eye-off" aria-hidden="true"></i></span>
	</template>
	<span :class="$style.summary">{{ summary }}</span>
	<span v-if="hasContent" :class="$style.indicators">
		<span v-if="appearNote.files?.length" :title="i18n.tsx.withNFiles({ n: appearNote.files.length })" :aria-label="i18n.tsx.withNFiles({ n: appearNote.files.length })"><i class="ti ti-paperclip" aria-hidden="true"></i></span>
		<span v-if="appearNote.poll" :title="i18n.ts.poll" :aria-label="i18n.ts.poll"><i class="ti ti-chart-bar" aria-hidden="true"></i></span>
		<span v-if="hasUrl" :title="i18n.ts._compactTimeline.link" :aria-label="i18n.ts._compactTimeline.link"><i class="ti ti-link" aria-hidden="true"></i></span>
		<span v-if="reactionCount > 0" :title="i18n.ts.reaction" :aria-label="i18n.ts.reaction"><i class="ti ti-mood-plus" aria-hidden="true"></i></span>
	</span>
</MkA>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import * as mfm from 'mfm-js';
import { getAppearNote } from '@/utility/get-appear-note.js';
import { getNoteSummary } from '@/utility/get-note-summary.js';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import { notePage } from '@/filters/note.js';
import { i18n } from '@/i18n.js';

// ミュート・プラグイン・ノート更新は呼び出し元の MkNote が扱う。
const props = defineProps<{
	note: Misskey.entities.Note;
	reactionCount: number;
}>();

const isRenote = computed(() => Misskey.note.isPureRenote(props.note));
const appearNote = computed(() => getAppearNote(props.note) ?? props.note);
const hasContent = computed(() => !props.note.isHidden && !props.note.deletedAt && !appearNote.value.isHidden && !appearNote.value.deletedAt && !(isRenote.value && props.note.renote == null));
const summary = computed(() => {
	if (props.note.isHidden || props.note.deletedAt) return getNoteSummary(props.note);
	if (isRenote.value && props.note.renote == null) return i18n.ts.deletedNote;
	if (hasContent.value && appearNote.value.cw != null) {
		return appearNote.value.cw.replace(/\s+/g, ' ').trim() || i18n.ts._compactTimeline.hiddenContent;
	}
	return getNoteSummary(appearNote.value, {
		showFiles: false,
		showPoll: false,
		showReply: false,
		showRenote: false,
	}).replace(/\s+/g, ' ').trim();
});
const hasUrl = computed(() => hasContent.value && appearNote.value.cw == null && !!appearNote.value.text && extractUrlFromMfm(mfm.parse(appearNote.value.text)).length > 0);
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 8px;
	min-width: 0;
	color: inherit;
	font-size: 85%;
	white-space: nowrap;

	&:hover {
		background: var(--MI_THEME-panelHighlight);
		text-decoration: none;
	}

	&:focus-visible {
		outline: solid 2px var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.avatar {
	flex-shrink: 0;
	width: 20px;
	height: 20px;
}

.author {
	max-width: 20%;
	font-weight: bold;
	overflow: hidden;
	text-overflow: ellipsis;
}

.time {
	flex-shrink: 0;
	font-size: 85%;
	opacity: 0.7;
}

.summary {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
}

.indicators {
	display: flex;
	flex-shrink: 0;
	gap: 4px;
	opacity: 0.7;
}
</style>
