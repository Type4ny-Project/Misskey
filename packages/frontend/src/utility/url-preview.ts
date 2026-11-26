/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { computed } from 'vue';
import { hostname, url as local } from '@@/js/config.js';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';

export const isEnabledUrlPreview = computed(() => (instance.enableUrlPreview && !prefer.r.dataSaver.value.disableUrlPreview));

const LOCAL_URL = new URL(local);

export function getLocalUrlCard(url: string): { kind: 'event' | 'calls'; id: string } | null {
	try {
		const requestUrl = new URL(url, local);
		if (!['http:', 'https:'].includes(requestUrl.protocol)) return null;
		if (requestUrl.origin !== LOCAL_URL.origin) return null;
		const match = /^\/(events|calls)\/([^/?#]+)\/?$/.exec(requestUrl.pathname);
		return match == null ? null : { kind: match[1] === 'events' ? 'event' : 'calls', id: match[2] };
	} catch {
		return null;
	}
}

export function getLocalEventId(url: string): string | null {
	const card = getLocalUrlCard(url);
	return card?.kind === 'event' ? card.id : null;
}

export function getLocalCallsRoomId(url: string): string | null {
	const card = getLocalUrlCard(url);
	return card?.kind === 'calls' ? card.id : null;
}

export function transformPlayerUrl(url: string, autoplay = false): string {
	const urlObj = new URL(url);
	if (!['https:', 'http:'].includes(urlObj.protocol)) throw new Error('Invalid protocol');

	const urlParams = new URLSearchParams(urlObj.search);

	if (urlObj.hostname === 'player.twitch.tv' || urlObj.hostname === 'clips.twitch.tv') {
		// TwitchはCSPの制約あり
		// https://dev.twitch.tv/docs/embed/video-and-clips/
		urlParams.set('parent', hostname);
		urlParams.set('allowfullscreen', '');
		urlParams.set('autoplay', autoplay ? 'true' : 'false');
		urlParams.delete('auto_play');
	} else if (autoplay) {
		urlParams.set('autoplay', '1');
		urlParams.set('auto_play', '1');
	} else {
		urlParams.delete('autoplay');
		urlParams.delete('auto_play');
	}
	urlObj.search = urlParams.toString();

	return urlObj.toString();
}
