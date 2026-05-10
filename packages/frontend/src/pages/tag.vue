<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<MkStreamingNotesTimeline ref="timeline" src="hashtag" :hashtag="tag"/>
	</div>
	<template v-if="$i" #footer>
		<div :class="$style.footer">
			<div class="_spacer" :class="$style.footerInner" style="--MI_SPACER-w: 800px; --MI_SPACER-min: 16px; --MI_SPACER-max: 16px;">
				<MkHashtagFollowButton :tag="tag" :isFollowing="isFollowing" full large @update:isFollowing="onFollowChanged"/>
				<MkButton rounded primary :class="$style.button" @click="post()"><i class="ti ti-pencil"></i>{{ i18n.ts.postToHashtag }}</MkButton>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import type { PageHeaderItem } from '@/types/page-header.js';
import type { MenuItem } from '@/types/menu.js';
import MkStreamingNotesTimeline from '@/components/MkStreamingNotesTimeline.vue';
import MkButton from '@/components/MkButton.vue';
import MkHashtagFollowButton from '@/components/MkHashtagFollowButton.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { store } from '@/store.js';
import * as os from '@/os.js';
import { genEmbedCode } from '@/utility/get-embed-code.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import type { TimelineHeaderItem } from '@/timeline-header.js';

const props = defineProps<{
	tag: string;
}>();

const isFollowing = ref(false);
const timeline = ref<InstanceType<typeof MkStreamingNotesTimeline> | null>(null);

watch(() => props.tag, async () => {
	if (!$i) return;
	const res = await misskeyApi('hashtags/is-following', { tag: props.tag });
	isFollowing.value = res.isFollowing;
}, { immediate: true });

async function post() {
	store.set('postFormHashtags', props.tag);
	store.set('postFormWithHashtags', true);
	await os.post();
	store.set('postFormHashtags', '');
	store.set('postFormWithHashtags', false);
}

function timelineHeaderKey(): TimelineHeaderItem {
	return `hashtag:${props.tag}`;
}

function onFollowChanged(value: boolean) {
	isFollowing.value = value;
	if (!value) {
		removeFromTimelineHeader();
	}
}

function addToTimelineHeader() {
	const item = timelineHeaderKey();
	if (store.s.timelineHeader.includes(item)) return;
	store.set('timelineHeader', [...store.s.timelineHeader, item]);
}

function removeFromTimelineHeader() {
	const item = timelineHeaderKey();
	if (!store.s.timelineHeader.includes(item)) return;
	store.set('timelineHeader', store.s.timelineHeader.filter(x => x !== item));
}

const headerActions = computed<PageHeaderItem[]>(() => {
	const items: PageHeaderItem[] = [];

	items.push({
		icon: 'ti ti-dots',
		text: i18n.ts.more,
		handler: (ev) => {
			const menuItems: MenuItem[] = [];

			if ($i && isFollowing.value) {
				menuItems.push(store.s.timelineHeader.includes(timelineHeaderKey()) ? {
					text: `${i18n.ts.remove}: ${i18n.ts.timelineHeader}`,
					icon: 'ti ti-minus',
					action: removeFromTimelineHeader,
				} : {
					text: `${i18n.ts.add}: ${i18n.ts.timelineHeader}`,
					icon: 'ti ti-plus',
					action: addToTimelineHeader,
				}, { type: 'divider' });
			}

			menuItems.push({
			text: i18n.ts.embed,
			icon: 'ti ti-code',
			action: () => {
				genEmbedCode('tags', props.tag);
			},
			});

			os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
		},
	});

	return items;
});

const headerTabs = computed(() => []);

definePage(() => ({
	title: props.tag,
	icon: 'ti ti-hash',
}));
</script>

<style lang="scss" module>
.footer {
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.5);
	border-top: solid 0.5px var(--MI_THEME-divider);
	display: flex;
}

.footerInner {
	display: flex;
	justify-content: center;
	gap: 12px;
}

.button {
	margin: 0;
}
</style>
