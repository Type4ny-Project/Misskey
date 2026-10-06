<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<form v-if="canControl && room.state === 'open' && (state?.videoId == null || editingVideo)" :class="$style.form" @submit.prevent="shareVideo">
		<label :class="$style.url">{{ i18n.ts._watchTogether.videoUrl }}<input v-model="inputUrl" type="url" :class="$style.input" required placeholder="https://www.youtube.com/watch?v=..." :disabled="busy"></label>
		<MkButton type="submit" primary :disabled="busy || state == null">{{ i18n.ts._watchTogether.playNow }}</MkButton>
		<MkButton :disabled="busy || state == null || state.queue.length >= 50 || !inputUrl.trim()" @click="addUrlToQueue">{{ i18n.ts._watchTogether.addToQueue }}</MkButton>
		<MkButton v-if="state?.videoId != null" :disabled="busy" @click="editingVideo = false">{{ i18n.ts.cancel }}</MkButton>
	</form>
	<MkInfo v-if="error != null" warn>{{ error }}</MkInfo>
	<MkLoading v-if="state == null && error == null"/>
	<MkButton v-else-if="state == null" :disabled="busy" @click="refresh">{{ i18n.ts.retry }}</MkButton>
	<template v-else-if="state.videoId != null">
		<div v-if="!watching" :class="$style.placeholder">
			<i class="ti ti-brand-youtube" :class="$style.youtubeIcon" aria-hidden="true"></i>
			<MkButton primary :disabled="loadingPlayer" @click="startWatching">{{ i18n.ts._watchTogether.startWatching }}</MkButton>
			<small>{{ i18n.ts._watchTogether.startWatchingDescription }}</small>
		</div>
		<div v-show="watching" ref="playerContainer" :class="$style.player"></div>
		<MkInfo v-if="autoplayBlocked" warn>{{ i18n.ts._watchTogether.autoplayBlocked }}</MkInfo>
		<MkButton v-if="autoplayBlocked" @click="allowPlayback">{{ i18n.ts._watchTogether.allowPlayback }}</MkButton>
		<footer :class="$style.footer">
			<small v-if="room.state === 'open'" :class="$style.hint">{{ canControl ? i18n.ts._watchTogether.sharingControls : i18n.ts._watchTogether.hostControls }}</small>
			<div :class="$style.actions">
				<MkButton v-if="canControl && room.state === 'open' && !editingVideo" small :disabled="busy" @click="editVideo">{{ i18n.ts._watchTogether.changeVideo }}</MkButton>
				<MkButton v-if="canControl && room.state === 'open'" small transparent :disabled="busy" @click="update({ videoId: null })">{{ i18n.ts._watchTogether.clear }}</MkButton>
				<a :href="`https://www.youtube.com/watch?v=${state.videoId}`" :class="$style.external" :aria-label="i18n.ts._watchTogether.openYouTube" :title="i18n.ts._watchTogether.openYouTube" target="_blank" rel="noopener noreferrer"><i class="ti ti-external-link" aria-hidden="true"></i></a>
			</div>
		</footer>
	</template>
	<div v-else :class="$style.placeholder"><i class="ti ti-brand-youtube" :class="$style.youtubeIcon" aria-hidden="true"></i><p>{{ i18n.ts._watchTogether.empty }}</p></div>
	<section v-if="state != null" :class="$style.queue" :aria-label="i18n.ts._watchTogether.queue">
		<header :class="$style.queueHeader"><h3>{{ i18n.ts._watchTogether.queue }}</h3><MkButton v-if="canControl && room.state === 'open' && !editingVideo && state.videoId != null" small @click="editVideo">{{ i18n.ts._watchTogether.addToQueue }}</MkButton></header>
		<p v-if="state.queue.length === 0" :class="$style.hint">{{ i18n.ts._watchTogether.emptyQueue }}</p>
		<ol v-else :class="$style.queueList">
			<li v-for="(video, index) in state.queue" :key="index" :class="$style.queueVideo">
				<span aria-hidden="true">{{ index + 1 }}</span>
				<MkCallsWatchTogetherVideoPreview :videoId="video" :class="$style.queueTitle"/>
				<div v-if="canControl && room.state === 'open'" :class="$style.actions">
					<MkButton small :disabled="busy" @click="playQueued(index)">{{ i18n.ts._watchTogether.playNow }}</MkButton>
					<button type="button" class="_button" :class="$style.external" :disabled="busy" :aria-label="i18n.ts._watchTogether.removeFromQueue" @click="update({ queue: state.queue.filter((_, i) => i !== index) })"><i class="ti ti-x" aria-hidden="true"></i></button>
				</div>
			</li>
		</ol>
		<small v-if="state.queue.length >= 50" :class="$style.hint">{{ i18n.ts._watchTogether.queueFull }}</small>
	</section>
	<MkInfo v-if="room.state !== 'open'">{{ i18n.ts._watchTogether.ended }}</MkInfo>
</div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { loadYouTubeAPI, youtubeVideoId } from './youtube-player.js';
import type { YouTubePlayer } from './youtube-player.js';
import type * as Misskey from 'misskey-js';
import MkCallsWatchTogetherVideoPreview from './MkCallsWatchTogetherVideoPreview.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useStream } from '@/stream.js';

type State = Misskey.entities.CallsWatchTogetherShowResponse;
const props = defineProps<{ room: Misskey.entities.CallsRoom; canControl: boolean }>();
const state = shallowRef<State | null>(null);
const editingVideo = ref(false);
const inputUrl = ref('');
const busy = ref(false);
const error = ref<string | null>(null);
const watching = ref(false);
const loadingPlayer = ref(false);
const autoplayBlocked = ref(false);
const playerContainer = shallowRef<HTMLElement>();
let player: YouTubePlayer | null = null;
let ready = false;
let disposed = false;
let serverOffset = 0;
let loadedVideo: string | null = null;
let syncingPlayer = true;
const stream = useStream();
const channel = stream.useChannel('callsRoom', { roomId: props.room.id });

function position() {
	if (state.value == null) return 0;
	return state.value.position + (state.value.playing ? Math.max(0, Date.now() + serverOffset - state.value.updatedAt) / 1000 : 0);
}

function syncPlayer() {
	if (!ready || player == null || state.value?.videoId == null || error.value === i18n.ts._watchTogether.playerError) return;
	if (loadedVideo !== state.value.videoId) {
		syncingPlayer = true;
		loadedVideo = state.value.videoId;
		player.cueVideoById(loadedVideo);
	}
	const currentState = player.getPlayerState();
	const currentPosition = player.getCurrentTime();
	const duration = player.getDuration();
	const target = duration > 0 ? Math.min(position(), duration) : position();
	const shouldPlay = state.value.playing && props.room.state === 'open';
	if (props.canControl && props.room.state === 'open' && !syncingPlayer) {
		// IFrame API has no seek event, so sample the native timeline as well as state changes.
		if (!busy.value && currentState === 0 && shouldPlay && state.value.queue.length > 0) {
			void playQueued(0);
			return;
		}
		if (!busy.value && [0, 1, 2, 5].includes(currentState) && (shouldPlay !== (currentState === 1) || Math.abs(currentPosition - target) > 2)) {
			void update({ playing: currentState === 1, position: currentPosition });
		}
		return;
	}
	if (Math.abs(currentPosition - target) > 2) player.seekTo(target, true);
	if (!shouldPlay) {
		if (![0, 2, 5].includes(currentState)) player.pauseVideo();
	} else if (!autoplayBlocked.value && ![1, 3].includes(currentState)) {
		if (player.getDuration() === 0 || target < player.getDuration()) player.playVideo();
	}
	// Native callbacks from applying a remote change must settle before publishing local controls.
	const settledState = player.getPlayerState();
	if (Math.abs(player.getCurrentTime() - target) <= 2 && (shouldPlay ? settledState === 1 || (settledState === 0 && target >= player.getDuration()) : [0, 2, 5].includes(settledState))) syncingPlayer = false;
}

function accept(next: State) {
	if (disposed || (state.value != null && next.revision < state.value.revision)) return;
	if (state.value == null || state.value.revision !== next.revision || state.value.playing !== next.playing) syncingPlayer = true;
	if (state.value?.videoId !== next.videoId) { error.value = null; editingVideo.value = false; }
	state.value = next;
	if (next.videoId == null) stopPlayer();
	syncPlayer();
}

async function refresh() {
	const sentAt = Date.now();
	try {
		const next = await misskeyApi('calls/watch-together/show', { roomId: props.room.id });
		if (disposed) return;
		serverOffset = next.serverTime - (sentAt + Date.now()) / 2;
		accept(next);
		if (error.value === i18n.ts._watchTogether.apiError) error.value = null;
	} catch { if (!disposed) { error.value = i18n.ts._watchTogether.apiError; stopPlayer(); } }
}

async function update(params: { videoId?: string | null; playing?: boolean; position?: number; queue?: string[] }) {
	if (busy.value || !props.canControl || props.room.state !== 'open' || state.value == null) return;
	busy.value = true;
	try {
		accept(await misskeyApi('calls/watch-together/update', { roomId: props.room.id, expectedRevision: state.value.revision, ...params }));
		error.value = null;
	} catch {
		await refresh();
		error.value = i18n.ts._watchTogether.apiError;
	} finally { busy.value = false; }
}

function editVideo() {
	inputUrl.value = '';
	editingVideo.value = true;
}

function inputVideo(): string | null {
	const videoId = youtubeVideoId(inputUrl.value);
	if (videoId == null) { error.value = i18n.ts._watchTogether.invalidUrl; return null; }
	return videoId;
}

async function shareVideo() {
	const video = inputVideo();
	if (video == null) return;
	await update({ videoId: video, playing: true, position: 0 });
	if (state.value?.videoId === video) editingVideo.value = false;
}

async function addUrlToQueue() {
	const video = inputVideo();
	if (video == null) return;
	if (state.value == null || state.value.queue.length >= 50) return;
	await update({ queue: [...state.value.queue, video] });
	if (error.value == null) inputUrl.value = '';
}

async function playQueued(index: number) {
	const video = state.value?.queue[index];
	if (video == null) return;
	await update({ videoId: video, playing: true, position: 0, queue: state.value!.queue.filter((_, i) => i !== index) });
	if (state.value?.videoId === video) editingVideo.value = false;
}

async function startWatching() {
	if (loadingPlayer.value || state.value?.videoId == null) return;
	loadingPlayer.value = true;
	error.value = null;
	try {
		const youtube = await loadYouTubeAPI();
		if (disposed || state.value?.videoId == null) return;
		watching.value = true;
		await nextTick();
		if (disposed) return;
		const element = window.document.createElement('div');
		playerContainer.value!.appendChild(element);
		loadedVideo = state.value.videoId;
		player = new youtube.Player(element, {
			host: 'https://www.youtube-nocookie.com', videoId: loadedVideo,
			playerVars: { origin: window.location.origin, controls: 1, disablekb: 0, playsinline: 1, rel: 0 },
			events: {
				onReady(event) { if (disposed) return; player = event.target; ready = true; syncingPlayer = true; syncPlayer(); },
				onStateChange() { syncPlayer(); },
				onError() { error.value = i18n.ts._watchTogether.playerError; },
				onAutoplayBlocked() { autoplayBlocked.value = true; },
			},
		});
	} catch { error.value = i18n.ts._watchTogether.playerError; watching.value = false; } finally { loadingPlayer.value = false; }
}

function allowPlayback() { autoplayBlocked.value = false; player?.playVideo(); syncPlayer(); }

function stopPlayer() { ready = false; player?.destroy(); player = null; watching.value = false; autoplayBlocked.value = false; }

function revoked() { void refresh(); }

channel.on('watchTogether', event => accept(event.state));
channel.on('revoked', revoked);
stream.on('_connected_', refresh);
watch(() => [props.room.state, props.canControl], () => { syncingPlayer = true; syncPlayer(); void refresh(); });
onMounted(refresh);
const syncTimer = window.setInterval(syncPlayer, 500);
const refreshTimer = window.setInterval(refresh, 30000);
onUnmounted(() => {
	disposed = true;
	window.clearInterval(syncTimer);
	window.clearInterval(refreshTimer);
	stream.off('_connected_', refresh);
	channel.dispose();
	stopPlayer();
});
</script>

<style lang="scss" module>
.root { display: flex; flex-direction: column; gap: 12px; }
.hint { color: var(--MI_THEME-fgTransparentWeak); }
.form { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
.url { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 180px; }
.input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--MI_THEME-divider); border-radius: var(--MI-radius); background: var(--MI_THEME-panel); color: var(--MI_THEME-fg); font: inherit; }
.input:focus { outline: 2px solid var(--MI_THEME-accent); }
.player, .placeholder { width: min(100%, calc(40dvh * 16 / 9)); align-self: center; aspect-ratio: 16 / 9; min-height: 200px; border-radius: var(--MI-radius); overflow: hidden; background: var(--MI_THEME-bg); }
.player iframe { width: 100%; height: 100%; border: 0; }
.placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; box-sizing: border-box; text-align: center; }
.placeholder p { margin: 0; }
.placeholder small { color: var(--MI_THEME-fgTransparentWeak); }
.youtubeIcon { font-size: 48px; color: var(--MI_THEME-fgTransparentWeak); }
.footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.external { display: grid; place-items: center; width: 36px; height: 36px; border-radius: var(--MI-radius); color: var(--MI_THEME-fgTransparentWeak); }
.queue { border-top: 1px solid var(--MI_THEME-divider); padding-top: 12px; }
.queueHeader { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.queueHeader h3 { margin: 0; font-size: 1rem; }
.queueList { display: flex; flex-direction: column; gap: 8px; padding-left: 24px; }
.queueVideo { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.queueTitle { flex: 1; min-width: 240px; }
.external:hover { background: var(--MI_THEME-buttonHoverBg); }
</style>
