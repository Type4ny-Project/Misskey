<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XColumn :menu="menu" :column="column" :isStacked="isStacked" :refresher="async () => { await timeline?.reloadTimeline() }">
	<template #header>
		<i v-if="column.tl != null" :class="timelineIconClass"></i>
		<span style="margin-left: 8px;">{{ column.name || timelineTitle || i18n.ts._deck._columns.tl }}</span>
	</template>

	<div v-if="!isAvailableTimeline" :class="$style.disabled">
		<p :class="$style.disabledTitle">
			<i class="ti ti-circle-minus"></i>
			{{ i18n.ts._disabledTimeline.title }}
		</p>
		<p :class="$style.disabledDescription">{{ i18n.ts._disabledTimeline.description }}</p>
	</div>
	<MkStreamingNotesTimeline
		v-else-if="column.tl"
		ref="timeline"
		:key="column.tl + withRenotes + withReplies + onlyFiles"
		:src="timelineSrc"
		:hashtag="timelineHashtag"
		:withRenotes="withRenotes"
		:withReplies="withReplies"
		:withSensitive="withSensitive"
		:onlyFiles="onlyFiles"
		:sound="true"
		:customSound="soundSetting"
	/>
</XColumn>
</template>

<script lang="ts" setup>
import { onMounted, watch, ref, useTemplateRef, computed } from 'vue';
import XColumn from './column.vue';
import type { Column } from '@/deck.js';
import type { MenuItem } from '@/types/menu.js';
import type { SoundStore } from '@/preferences/def.js';
import { removeColumn, updateColumn } from '@/deck.js';
import MkStreamingNotesTimeline from '@/components/MkStreamingNotesTimeline.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { hasWithReplies, isAvailableBasicTimeline, isBasicTimeline, basicTimelineIconClass } from '@/timelines.js';
import { soundSettingsButton } from '@/ui/deck/tl-note-notification.js';
import { followedHashtagsCache } from '@/cache.js';

const props = defineProps<{
	column: Column;
	isStacked: boolean;
}>();

const timeline = useTemplateRef('timeline');

const soundSetting = ref<SoundStore>(props.column.soundSetting ?? { type: null, volume: 1 });
const withRenotes = ref(props.column.withRenotes ?? true);
const withReplies = ref(props.column.withReplies ?? false);
const withSensitive = ref(props.column.withSensitive ?? true);
const onlyFiles = ref(props.column.onlyFiles ?? false);

function isHashtagTimeline(timeline: Column['tl']): timeline is `hashtag:${string}` {
	return timeline?.startsWith('hashtag:') ?? false;
}

const timelineHashtag = computed(() => isHashtagTimeline(props.column.tl) ? props.column.tl.substring('hashtag:'.length) : undefined);
const timelineSrc = computed(() => isHashtagTimeline(props.column.tl) ? 'hashtag' : props.column.tl);
const isAvailableTimeline = computed(() => isHashtagTimeline(props.column.tl) ? timelineHashtag.value !== '' : isAvailableBasicTimeline(props.column.tl));
const timelineIconClass = computed(() => isHashtagTimeline(props.column.tl) ? 'ti ti-hash' : props.column.tl != null ? basicTimelineIconClass(props.column.tl) : undefined);
const timelineTitle = computed(() => isHashtagTimeline(props.column.tl) ? `#${timelineHashtag.value}` : props.column.tl != null ? i18n.ts._timelines[props.column.tl] : null);
const canShowReplies = computed(() => props.column.tl != null && isBasicTimeline(props.column.tl) && hasWithReplies(props.column.tl));

watch(withRenotes, v => {
	updateColumn(props.column.id, {
		withRenotes: v,
	});
});

watch(withReplies, v => {
	updateColumn(props.column.id, {
		withReplies: v,
	});
});

watch(withSensitive, v => {
	updateColumn(props.column.id, {
		withSensitive: v,
	});
});

watch(onlyFiles, v => {
	updateColumn(props.column.id, {
		onlyFiles: v,
	});
});

watch(soundSetting, v => {
	updateColumn(props.column.id, { soundSetting: v });
});

onMounted(() => {
	if (props.column.tl == null) {
		setType();
	}
});

async function setType() {
	const wasUnset = props.column.tl == null;
	const { canceled, result: src } = await os.select({
		title: i18n.ts.timeline,
		items: [{
			value: 'home', label: i18n.ts._timelines.home,
		}, {
			value: 'local', label: i18n.ts._timelines.local,
		}, {
			value: 'social', label: i18n.ts._timelines.social,
		}, {
			value: 'global', label: i18n.ts._timelines.global,
		}, {
			value: 'media', label: i18n.ts._timelines.media,
		}, {
			value: 'hashtag', label: i18n.ts.hashtags,
		}],
		default: timelineSrc.value,
	});
	if (canceled) {
		if (wasUnset) {
			removeColumn(props.column.id);
		}
		return;
	}
	if (src == null) return;
	if (src === 'hashtag') {
		const followedHashtags = await followedHashtagsCache.fetch();
		if (followedHashtags.length === 0) {
			await os.alert({
				type: 'info',
				title: i18n.ts.hashtags,
				text: i18n.ts.nothing,
			});
			if (wasUnset) {
				removeColumn(props.column.id);
			}
			return;
		}

		const { canceled: hashtagCanceled, result: hashtag } = await os.select({
			title: i18n.ts.hashtags,
			items: followedHashtags.map(x => ({
				value: x.tag,
				label: `#${x.tag}`,
			})),
			default: timelineHashtag.value,
		});
		if (hashtagCanceled) {
			if (wasUnset) {
				removeColumn(props.column.id);
			}
			return;
		}
		if (hashtag == null) return;

		updateColumn(props.column.id, {
			tl: `hashtag:${hashtag}`,
		});
		return;
	}
	if (!isBasicTimeline(src)) return;
	updateColumn(props.column.id, {
		tl: src,
	});
}

const menu = computed<MenuItem[]>(() => {
	const menuItems: MenuItem[] = [];

	menuItems.push({
		icon: 'ti ti-pencil',
		text: i18n.ts.timeline,
		action: setType,
	}, {
		icon: 'ti ti-bell',
		text: i18n.ts._deck.newNoteNotificationSettings,
		action: () => soundSettingsButton(soundSetting),
	}, {
		type: 'switch',
		text: i18n.ts.showRenotes,
		ref: withRenotes,
	});

	if (canShowReplies.value) {
		menuItems.push({
			type: 'switch',
			text: i18n.ts.showRepliesToOthersInTimeline,
			ref: withReplies,
			disabled: onlyFiles,
		});
	}

	menuItems.push({
		type: 'switch',
		text: i18n.ts.fileAttachedOnly,
		ref: onlyFiles,
		disabled: canShowReplies.value ? withReplies : false,
	}, {
		type: 'switch',
		text: i18n.ts.withSensitive,
		ref: withSensitive,
	});

	return menuItems;
});
</script>

<style lang="scss" module>
.disabled {
	text-align: center;
}

.disabledTitle {
	margin: 16px;
}

.disabledDescription {
	font-size: 90%;
}
</style>
