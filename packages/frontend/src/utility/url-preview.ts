/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { computed } from 'vue';
import { hostname, url as local } from '@@/js/config.js';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';

export const isEnabledUrlPreview = computed(() => (instance.enableUrlPreview && !prefer.r.dataSaver.value.disableUrlPreview));

const LOCAL_EVENT_PATH_RE = /^\/events\/([^/?#]+)\/?$/;
const LOCAL_URL = new URL(local);

export function getLocalEventId(url: string): string | null {
	try {
		const requestUrl = new URL(url, local);
		if (!['http:', 'https:'].includes(requestUrl.protocol)) return null;
		if (requestUrl.origin !== LOCAL_URL.origin) return null;
		return requestUrl.pathname.match(LOCAL_EVENT_PATH_RE)?.[1] ?? null;
	} catch {
		return null;
	}
}

export function transformPlayerUrl(url: string): string {
	const urlObj = new URL(url);
	if (!['https:', 'http:'].includes(urlObj.protocol)) throw new Error('Invalid protocol');

	const urlParams = new URLSearchParams(urlObj.search);

	if (urlObj.hostname === 'player.twitch.tv' || urlObj.hostname === 'clips.twitch.tv') {
		// TwitchはCSPの制約あり
		// https://dev.twitch.tv/docs/embed/video-and-clips/
		urlParams.set('parent', hostname);
		urlParams.set('allowfullscreen', '');
		urlParams.delete('autoplay');
		urlParams.delete('auto_play');
	} else {
		urlParams.delete('autoplay');
		urlParams.delete('auto_play');
	}
	urlObj.search = urlParams.toString();

	return urlObj.toString();
}
