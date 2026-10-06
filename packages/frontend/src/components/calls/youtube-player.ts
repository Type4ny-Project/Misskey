/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function youtubeVideoId(input: string): string | null {
	try {
		const url = new URL(input.trim());
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
		const youtube = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname);
		const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : youtube
			? url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)$/)?.[1]
			: null;
		return id != null && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
	} catch { return null; }
}

export type YouTubePlayer = {
	cueVideoById(videoId: string): void;
	playVideo(): void;
	pauseVideo(): void;
	seekTo(seconds: number, allowSeekAhead: boolean): void;
	getCurrentTime(): number;
	getPlayerState(): number;
	getDuration(): number;
	setVolume(volume: number): void;
	destroy(): void;
};
type YouTubeAPI = { Player: new (element: HTMLElement, options: {
	host: string;
	videoId: string;
	playerVars: { origin: string; controls: number; disablekb: number; playsinline: number; rel: number };
	events: {
		onReady(event: { target: YouTubePlayer }): void;
		onError(): void;
		onAutoplayBlocked(): void;
	};
}) => YouTubePlayer };
let loading: Promise<YouTubeAPI> | undefined;

export function loadYouTubeAPI(): Promise<YouTubeAPI> {
	const youtubeWindow = window as Window & { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: () => void };
	if (youtubeWindow.YT?.Player != null) return Promise.resolve(youtubeWindow.YT);
	return loading ??= new Promise((resolve, reject) => {
		youtubeWindow.onYouTubeIframeAPIReady = () => resolve(youtubeWindow.YT!);
		const script = window.document.createElement('script');
		script.src = 'https://www.youtube.com/iframe_api';
		script.onerror = () => { loading = undefined; script.remove(); reject(new Error('YouTube API could not be loaded')); };
		window.document.head.appendChild(script);
	});
}
