<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.card">
		<div :class="$style.cardHeader">
			<div>
				<div :class="$style.eyebrow">Your weekly activity</div>
				<div :class="$style.title">Weekly Stats</div>
				<div :class="$style.since">{{ weekLabel }}</div>
			</div>
			<div :class="$style.headerIcon"><i class="ti ti-chart-bar"></i></div>
		</div>

		<MkError v-if="error != null" @retry="loadStats"/>
		<MkLoading v-else-if="stats == null" mini/>
		<template v-else>
			<div :class="$style.stats">
				<div v-for="metric in metrics" :key="metric.label" :class="$style.stat">
					<div :class="$style.statIcon"><i :class="metric.icon"></i></div>
					<div :class="$style.statBody">
						<div :class="$style.label">{{ metric.label }}</div>
						<div :class="$style.value"><MkNumber :value="metric.value"/></div>
					</div>
				</div>
			</div>

			<div :class="$style.rankings">
				<section :class="$style.rankingPanel">
					<div :class="$style.sectionTitle">よく使った絵文字 Top 3</div>
					<div v-if="stats.topReactions.length === 0" :class="$style.empty">まだリアクションしていません</div>
					<div v-else :class="$style.reactionList">
						<div v-for="(item, index) in stats.topReactions" :key="item.reaction" :class="$style.reaction">
							<div :class="$style.rank">{{ index + 1 }}</div>
							<MkReactionIcon :reaction="item.reaction" :noStyle="true" :class="$style.reactionIcon"/>
							<div :class="$style.reactionCount"><MkNumber :value="item.count"/></div>
						</div>
					</div>
				</section>
				<section :class="$style.rankingPanel">
					<div :class="$style.sectionTitle">もらった絵文字 Top 3</div>
					<div v-if="stats.topReceivedReactions.length === 0" :class="$style.empty">まだリアクションをもらっていません</div>
					<div v-else :class="$style.reactionList">
						<div v-for="(item, index) in stats.topReceivedReactions" :key="item.reaction" :class="$style.reaction">
							<div :class="$style.rank">{{ index + 1 }}</div>
							<MkReactionIcon :reaction="item.reaction" :noStyle="true" :class="$style.reactionIcon"/>
							<div :class="$style.reactionCount"><MkNumber :value="item.count"/></div>
						</div>
					</div>
				</section>
			</div>

			<section :class="$style.topNote">
				<div :class="$style.topNoteHeader">
					<div>
						<div :class="$style.sectionTitle">今週一番投稿したチャンネル</div>
						<div :class="$style.help">チャンネル名は表示するときだけ共有に含めます</div>
					</div>
					<MkButton small :disabled="stats.topPostedChannel == null" @click="includeTopPostedChannel = !includeTopPostedChannel">
						{{ includeTopPostedChannel ? '隠す' : '表示する' }}
					</MkButton>
				</div>
				<div v-if="stats.topPostedChannel == null" :class="$style.empty">今週チャンネルへの投稿はまだありません</div>
				<div v-else-if="includeTopPostedChannel" :class="$style.channelPreview">
					<div :class="$style.channelIcon"><i class="ti ti-speakerphone"></i></div>
					<div :class="$style.channelBody">
						<div :class="$style.channelName">{{ stats.topPostedChannel.name }}</div>
						<div :class="$style.help"><MkNumber :value="stats.topPostedChannel.notesCount"/> posts this week</div>
					</div>
				</div>
			</section>
		</template>
	</div>

	<div :class="$style.actions">
		<MkButton small :disabled="stats == null" @click="saveImage"><i class="ti ti-download"></i> 画像を保存</MkButton>
		<MkButton small primary :disabled="stats == null" @click="shareStats"><i class="ti ti-share"></i> 共有</MkButton>
		<MkButton small :disabled="stats == null || isSharingWithNote" @click="shareWithNote"><i class="ti ti-pencil"></i> ノートで共有</MkButton>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { url } from '@@/js/config.js';
import MkButton from '@/components/MkButton.vue';
import MkNumber from '@/components/MkNumber.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkError from '@/components/global/MkError.vue';
import * as os from '@/os.js';
import { $i } from '@/i.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { uploadFile } from '@/utility/drive.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';

type ReactionRankingItem = {
	reaction: string;
	count: number;
};

type WeeklyStats = {
	sinceDate: string;
	notesCount: number;
	reactionsCount: number;
	receivedReactionsCount: number;
	postingDaysCount: number;
	topReactions: ReactionRankingItem[];
	topReceivedReactions: ReactionRankingItem[];
	topPostedChannel: {
		id: string;
		name: string;
		notesCount: number;
	} | null;
};

type WeeklyStatsApi = (endpoint: 'i/weekly-stats', data: Record<string, never>) => Promise<WeeklyStats>;

const fetchWeeklyStats = misskeyApi as WeeklyStatsApi;
const stats = ref<WeeklyStats | null>(null);
const error = ref<unknown>(null);
const includeTopPostedChannel = ref(false);
const isSharingWithNote = ref(false);

loadStats();

function loadStats(): void {
	error.value = null;
	fetchWeeklyStats('i/weekly-stats', {}).then(result => {
		stats.value = result;
	}).catch(err => {
		error.value = err;
	});
}

const weekLabel = computed(() => {
	if (stats.value == null) return '今週のまとめ';
	return `${new Date(stats.value.sinceDate).toLocaleDateString()} からのまとめ`;
});

const statsUrl = computed(() => $i ? `${url}/@${$i.username}/stats` : url);

const metrics = computed(() => {
	if (stats.value == null) return [];
	return [
		{ label: '投稿数', value: stats.value.notesCount, icon: 'ti ti-pencil' },
		{ label: 'リアクションした数', value: stats.value.reactionsCount, icon: 'ti ti-mood-heart' },
		{ label: 'もらったリアクション', value: stats.value.receivedReactionsCount, icon: 'ti ti-heart' },
		{ label: '投稿した日数', value: stats.value.postingDaysCount, icon: 'ti ti-calendar-stats' },
	];
});

const shareText = computed(() => {
	if (stats.value == null) return 'Weekly Stats';

	const lines = [
		'Weekly Stats',
		`期間: ${weekLabel.value}`,
		`投稿数: ${stats.value.notesCount}`,
		`リアクションした数: ${stats.value.reactionsCount}`,
		`もらったリアクション数: ${stats.value.receivedReactionsCount}`,
		`投稿した日数: ${stats.value.postingDaysCount}`,
		'よく使った絵文字 Top 3:',
		formatRanking(stats.value.topReactions),
		'もらった絵文字 Top 3:',
		formatRanking(stats.value.topReceivedReactions),
	];

	if (includeTopPostedChannel.value && stats.value.topPostedChannel != null) {
		lines.push(`今週一番投稿したチャンネル: ${stats.value.topPostedChannel.name} (${stats.value.topPostedChannel.notesCount} posts)`);
	}

	return lines.join('\n');
});

function formatRanking(items: ReactionRankingItem[]): string {
	return items.length > 0
		? items.map((item, index) => `${index + 1}. ${item.reaction} x${item.count}`).join('\n')
		: 'なし';
}

async function saveImage(): Promise<void> {
	const blob = await renderStatsImage();
	const anchor = window.document.createElement('a');
	const objectUrl = URL.createObjectURL(blob);
	anchor.href = objectUrl;
	anchor.download = 'weekly-stats.png';
	anchor.click();
	window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
	os.toast('画像を保存しました');
}

async function shareStats(): Promise<void> {
	const blob = await renderStatsImage();
	const file = new File([blob], 'weekly-stats.png', { type: 'image/png' });
	const shareDataWithFile: ShareData = {
		title: 'Weekly Stats',
		text: shareText.value,
		url: statsUrl.value,
		files: [file],
	};

	if (navigator.canShare?.(shareDataWithFile)) {
		await navigator.share(shareDataWithFile);
		return;
	}

	const shareData: ShareData = {
		title: 'Weekly Stats',
		text: shareText.value,
		url: statsUrl.value,
	};

	if (navigator.share) {
		await navigator.share(shareData);
		return;
	}

	copyToClipboard(`${shareText.value}\n${statsUrl.value}`);
}

async function shareWithNote(): Promise<void> {
	if (stats.value == null || isSharingWithNote.value) return;

	isSharingWithNote.value = true;
	try {
		const blob = await renderStatsImage();
		const file = new File([blob], 'weekly-stats.png', { type: 'image/png' });
		const { filePromise } = uploadFile(file, {
			name: 'weekly-stats.png',
			folderId: prefer.s.uploadFolder,
			isSensitive: false,
		});
		const driveFile = await os.promiseDialog(filePromise);

		await os.post({
			initialText: `${shareText.value}\n${statsUrl.value}`,
			initialFiles: [driveFile],
		});
	} finally {
		isSharingWithNote.value = false;
	}
}

async function renderStatsImage(): Promise<Blob> {
	if (stats.value == null) throw new Error('Weekly Stats is not loaded.');

	const canvas = window.document.createElement('canvas');
	const scale = window.devicePixelRatio || 1;
	const width = 1200;
	const height = 630;
	canvas.width = width * scale;
	canvas.height = height * scale;
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;

	const ctx = canvas.getContext('2d');
	if (ctx == null) throw new Error('Could not create canvas context.');

	ctx.scale(scale, scale);
	ctx.fillStyle = getCanvasColor('--MI_THEME-bg', '#18191c');
	ctx.fillRect(0, 0, width, height);

	const accent = getCanvasColor('--MI_THEME-accent', '#86b300');
	ctx.fillStyle = accent;
	ctx.fillRect(0, 0, width, 12);

	ctx.fillStyle = getCanvasColor('--MI_THEME-panel', '#22242a');
	roundRect(ctx, 64, 64, width - 128, height - 128, 32);
	ctx.fill();

	ctx.fillStyle = getCanvasColor('--MI_THEME-fg', '#f4f4f5');
	drawText(ctx, 'Weekly Stats', 96, 132, 52, 800, 'bold');
	drawText(ctx, weekLabel.value, 98, 174, 24, 800);

	drawMetric(ctx, '投稿数', stats.value.notesCount.toLocaleString(), 96, 240, accent);
	drawMetric(ctx, 'リアクションした数', stats.value.reactionsCount.toLocaleString(), 320, 240, accent);
	drawMetric(ctx, 'もらったリアクション', stats.value.receivedReactionsCount.toLocaleString(), 604, 240, accent);
	drawMetric(ctx, '投稿した日数', stats.value.postingDaysCount.toLocaleString(), 884, 240, accent);

	drawText(ctx, 'よく使った絵文字 Top 3', 96, 382, 26, 480, 'bold');
	drawRanking(ctx, stats.value.topReactions, 96, 430);
	drawText(ctx, 'もらった絵文字 Top 3', 604, 382, 26, 480, 'bold');
	drawRanking(ctx, stats.value.topReceivedReactions, 604, 430);

	if (includeTopPostedChannel.value && stats.value.topPostedChannel != null) {
		drawText(ctx, `今週一番投稿したチャンネル: ${stats.value.topPostedChannel.name}`, 96, 548, 24, 640);
		drawText(ctx, `${stats.value.topPostedChannel.notesCount.toLocaleString()} posts`, 820, 548, 24, 260, 'bold');
	}

	return await new Promise((resolve, reject) => {
		canvas.toBlob(blob => {
			if (blob == null) {
				reject(new Error('Could not render Weekly Stats image.'));
				return;
			}
			resolve(blob);
		}, 'image/png');
	});
}

function drawMetric(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number, accent: string): void {
	ctx.fillStyle = getCanvasColor('--MI_THEME-fg', '#f4f4f5');
	drawText(ctx, label, x, y, 22, 260);
	ctx.fillStyle = accent;
	drawText(ctx, value, x, y + 62, 54, 240, 'bold');
}

function drawRanking(ctx: CanvasRenderingContext2D, items: ReactionRankingItem[], x: number, y: number): void {
	if (items.length === 0) {
		drawText(ctx, 'なし', x, y, 26, 420);
		return;
	}

	items.forEach((item, index) => {
		drawText(ctx, `${index + 1}. ${item.reaction}  x${item.count.toLocaleString()}`, x, y + (index * 38), 28, 420);
	});
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxWidth: number, weight = 'normal'): void {
	ctx.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
	ctx.fillText(text, x, y, maxWidth);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.arcTo(x + width, y, x + width, y + height, radius);
	ctx.arcTo(x + width, y + height, x, y + height, radius);
	ctx.arcTo(x, y + height, x, y, radius);
	ctx.arcTo(x, y, x + width, y, radius);
	ctx.closePath();
}

function getCanvasColor(cssVariable: string, fallback: string): string {
	const value = window.getComputedStyle(window.document.documentElement).getPropertyValue(cssVariable).trim();
	return value === '' || value.startsWith('color(') ? fallback : value;
}
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
	padding: 16px;
}

.card {
	position: relative;
	overflow: hidden;
	padding: 18px;
	background:
		radial-gradient(circle at top right, color(from var(--MI_THEME-accent) srgb r g b / 0.18), transparent 38%),
		var(--MI_THEME-panel);
	border: solid 1px color(from var(--MI_THEME-fg) srgb r g b / 0.08);
	border-radius: calc(var(--MI-radius) + 4px);
}

.cardHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 18px;
}

.eyebrow {
	margin-bottom: 2px;
	color: var(--MI_THEME-accent);
	font-size: 0.78em;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.title {
	font-size: 1.25em;
	font-weight: 800;
}

.since,
.help {
	margin-top: 3px;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.62);
	font-size: 0.9em;
}

.headerIcon {
	display: grid;
	place-items: center;
	flex: 0 0 auto;
	width: 44px;
	height: 44px;
	color: var(--MI_THEME-accent);
	font-size: 1.35em;
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.12);
	border: solid 1px color(from var(--MI_THEME-accent) srgb r g b / 0.2);
	border-radius: 14px;
}

.stats {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	margin-bottom: 14px;
}

.stat {
	display: flex;
	gap: 10px;
	min-width: 0;
	padding: 12px;
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.72);
	border: solid 1px color(from var(--MI_THEME-fg) srgb r g b / 0.06);
	border-radius: var(--MI-radius);
}

.statIcon {
	display: grid;
	place-items: center;
	flex: 0 0 auto;
	width: 28px;
	height: 28px;
	color: var(--MI_THEME-accent);
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.1);
	border-radius: 9px;
}

.statBody {
	min-width: 0;
}

.label {
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.7);
	font-size: 0.82em;
	line-height: 1.25;
}

.value {
	margin-top: 4px;
	color: var(--MI_THEME-accent);
	font-size: 1.45em;
	font-weight: 800;
	line-height: 1;
}

.rankings {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.rankingPanel,
.topNote {
	padding: 13px;
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.72);
	border: solid 1px color(from var(--MI_THEME-fg) srgb r g b / 0.06);
	border-radius: var(--MI-radius);
}

.topNote {
	margin-top: 12px;
}

.topNoteHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.sectionTitle {
	font-size: 0.95em;
	font-weight: 700;
}

.reactionList {
	display: grid;
	gap: 8px;
	margin-top: 10px;
}

.reaction {
	display: grid;
	grid-template-columns: 22px 28px minmax(0, 1fr);
	align-items: center;
	gap: 8px;
}

.rank {
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.45);
	font-size: 0.82em;
	font-weight: 700;
	text-align: center;
}

.reactionIcon {
	width: 28px;
	height: 28px;
}

.reactionCount {
	justify-self: end;
	font-weight: 800;
}

.channelPreview {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-top: 12px;
	padding: 12px;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.channelIcon {
	display: grid;
	place-items: center;
	flex: 0 0 auto;
	width: 42px;
	height: 42px;
	color: var(--MI_THEME-accent);
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.1);
	border-radius: 14px;
}

.channelBody {
	min-width: 0;
}

.channelName {
	min-width: 0;
	overflow: hidden;
	font-weight: 800;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 12px;
}

.empty {
	padding: 12px 0 0;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.62);
}

@container (max-width: 760px) {
	.stats {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@container (max-width: 560px) {
	.rankings,
	.stats {
		grid-template-columns: 1fr;
	}

	.topNoteHeader {
		align-items: stretch;
		flex-direction: column;
	}
}
</style>
