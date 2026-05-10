/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, reactive, ref } from 'vue';
import { i18n } from '@/i18n.js';
import {
	antennasCache,
	followedHashtagsCache,
	userChannelFollowingsCache,
	userChannelsCache,
	userFavoriteListsCache,
	userListsCache,
} from '@/cache.js';
import { isLocalTimelineAvailable, isGlobalTimelineAvailable } from '@/scripts/get-timeline-available.js';
import { store } from '@/store.js';
import { $i } from '@/i.js';

export type TimelineHeaderItem =
	'home' |
	'local' |
	'social' |
	'global' |
	'lists' |
	'antennas' |
	'channels' |
	`list:${string}` |
	`channel:${string}` |
	`antenna:${string}` |
	`hashtag:${string}` |
	'media' |
	`customTimeline:${string}`;

type TimelineHeaderItemsDef = {
	title: string;
	icon: string;
	iconOnly?: boolean;
};

const lists = $i ? await userListsCache.fetch() : [];
const userChannels = $i ? await userChannelsCache.fetch() : [];
const userChannelFollowings = $i ? await userChannelFollowingsCache.fetch() : [];
const userFavoriteLists = $i ? await userFavoriteListsCache.fetch() : [];
const antenna = $i ? await antennasCache.fetch() : [];
const followedHashtags = $i ? await followedHashtagsCache.fetch() : [];

const listItems = lists.reduce((acc, l) => {
	acc['list:' + l.id] = {
		title: i18n.ts.lists + ':' + l.name,
		icon: 'ti ti-star',
		iconOnly: true,
	};
	return acc;
}, {});

const channelItems = userChannels.reduce((acc, l) => {
	acc['channel:' + l.id] = {
		title: i18n.ts.channel + ':' + l.name,
		icon: 'ti ti-star',
		iconOnly: true,
	};
	return acc;
}, {});

const channelFollowingItems = userChannelFollowings.reduce((acc, l) => {
	acc['channel:' + l.id] = {
		title: i18n.ts.channel + ':' + l.name,
		icon: 'ti ti-star',
		iconOnly: true,
	};
	return acc;
}, {});

const favoriteListItems = userFavoriteLists.reduce((acc, l) => {
	acc['channel:' + l.id] = {
		title: i18n.ts.channel + ':' + l.name,
		icon: 'ti ti-star',
		iconOnly: true,
	};
	return acc;
}, {});

const antennaItems = antenna.reduce((acc, l) => {
	acc['antenna:' + l.id] = {
		title: i18n.ts.antennas + ':' + l.name,
		icon: 'ti ti-star',
		iconOnly: true,
	};
	return acc;
}, {});

const hashtagItems = followedHashtags.reduce((acc, l) => {
	acc['hashtag:' + l.tag] = {
		title: '#' + l.tag,
		icon: 'ti ti-hash',
		iconOnly: true,
	};
	return acc;
}, {});

const remoteLocalTimelineItems = store.r.remoteLocalTimeline.value.reduce((acc, t: { host: string; name: string; }) => {
	acc['remoteLocalTimeline:' + t.host.replace('https://', '')] = {
		title: t.name,
		icon: 'ti ti-star',
		iconOnly: true,
	};
	return acc;
}, {});

export const timelineHeaderItemDef = reactive<Partial<Record<TimelineHeaderItem, TimelineHeaderItemsDef>>>({
	home: {
		title: i18n.ts._timelines.home,
		icon: 'ti ti-home',
		iconOnly: true,
	},
	...(isLocalTimelineAvailable ? {
		local: {
			title: i18n.ts._timelines.local,
			icon: 'ti ti-planet',
			iconOnly: true,
		},
		social: {
			title: i18n.ts._timelines.social,
			icon: 'ti ti-universe',
			iconOnly: true,
		},
		media: {
			title: i18n.ts._timelines.media,
			icon: 'ti ti-photo',
			iconOnly: true,
		} } : {}),
	...(isGlobalTimelineAvailable ? { global: {
		title: i18n.ts._timelines.global,
		icon: 'ti ti-whirl',
		iconOnly: true,
	} } : {}),
	lists: {
		icon: 'ti ti-list',
		title: i18n.ts.lists,
		iconOnly: true,
	},
	antennas: {
		icon: 'ti ti-antenna',
		title: i18n.ts.antennas,
		iconOnly: true,
	},
	channels: {
		icon: 'ti ti-device-tv',
		title: i18n.ts.channel,
		iconOnly: true,
	},
	...listItems,
	...channelItems,
	...channelFollowingItems,
	...favoriteListItems,
	...antennaItems,
	...hashtagItems,
	...remoteLocalTimelineItems,
});

export function getTimelineHeaderItemDef(item: TimelineHeaderItem): TimelineHeaderItemsDef | undefined {
	if (item.startsWith('hashtag:')) {
		return timelineHeaderItemDef[item] ?? {
			title: '#' + item.substring('hashtag:'.length),
			icon: 'ti ti-hash',
			iconOnly: true,
		};
	}

	return timelineHeaderItemDef[item];
}
