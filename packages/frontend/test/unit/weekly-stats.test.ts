/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import WeeklyStats from '@/pages/user/activity.weekly-stats.vue';
import { preferState } from '../setup.unit.js';

const fixture = vi.hoisted(() => ({
	api: vi.fn(),
	post: vi.fn(),
	upload: vi.fn(),
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api }));
vi.mock('@/os.js', () => ({ post: fixture.post, promiseDialog: (promise: Promise<unknown>) => promise, toast: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: { username: 'alice' } }));
vi.mock('@/utility/drive.js', () => ({ uploadFile: fixture.upload }));
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' } }));

const stats = {
	sinceDate: '2026-09-28T00:00:00Z',
	notesCount: 1234,
	reactionsCount: 42,
	receivedReactionsCount: 56,
	postingDaysCount: 5,
	topReactions: [{ reaction: ':blobcat_modoki_02@.:', count: 2 }, { reaction: '❤', count: 1 }],
	topReceivedReactions: [{ reaction: ':blobcatyes@remote.example:', count: 3 }],
	topPostedChannel: { id: 'channel', name: 'My channel', notesCount: 8 },
};
const images: HTMLImageElement[] = [];
const ctx = {
	scale: vi.fn(), fillRect: vi.fn(), fill: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn(),
	fillText: vi.fn(), drawImage: vi.fn(),
};
const stubs = {
	MkButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' },
	MkNumber: { props: ['value'], template: '<span>{{ value }}</span>' },
	MkReactionIcon: true, MkLoading: true, MkError: true,
};

beforeEach(() => {
	vi.clearAllMocks();
	images.length = 0;
	preferState.emojiStyle = 'twemoji';
	fixture.api.mockResolvedValue(structuredClone(stats));
	fixture.upload.mockReturnValue({ filePromise: Promise.resolve({ id: 'image' }) });
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
	vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['image'], { type: 'image/png' })));
	vi.stubGlobal('Image', class {
		crossOrigin = '';
		naturalWidth = 128;
		naturalHeight = 64;
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		imageSrc = '';
		get src() { return this.imageSrc; }
		set src(value: string) {
			this.imageSrc = value;
			images.push(this as unknown as HTMLImageElement);
		}
	});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

async function openStats() {
	const view = render(WeeklyStats, { global: { stubs } });
	await waitFor(() => expect((view.getByRole('button', { name: /ノートで共有/ }) as HTMLButtonElement).disabled).toBe(false));
	return view;
}

test.each(['twemoji', 'fluentEmoji', 'native'])('draws custom reactions and %s emoji before uploading the image', async style => {
	preferState.emojiStyle = style;
	const view = await openStats();
	await fireEvent.click(view.getByRole('button', { name: /ノートで共有/ }));
	await waitFor(() => expect(images).toHaveLength(style === 'native' ? 2 : 3));
	expect(images.map(image => image.src)).toContain('/emoji/blobcat_modoki_02%40..webp?static=1');
	expect(images.map(image => image.src)).toContain('/emoji/blobcatyes%40remote.example.webp?static=1');
	if (style !== 'native') expect(images.map(image => image.src)).toContain(style === 'twemoji' ? '/twemoji/2764.svg' : '/fluent-emoji/2764.png');
	expect(fixture.upload).not.toHaveBeenCalled();
	for (const image of images) {
		expect(image.crossOrigin).toBe('anonymous');
		image.onload?.(new Event('load'));
	}
	await waitFor(() => expect(fixture.post).toHaveBeenCalledOnce());
	expect(ctx.drawImage).toHaveBeenCalledTimes(images.length);
	expect(ctx.drawImage).toHaveBeenCalledWith(images[0], 136, 404, 56, 28);
	if (style === 'native') expect(ctx.fillText).toHaveBeenCalledWith('❤', 136, 468, 280);
	expect(fixture.post.mock.calls[0][0].initialFiles).toEqual([{ id: 'image' }]);
	expect(fixture.post.mock.calls[0][0].initialText).toContain(`\n\n投稿：${stats.notesCount.toLocaleString()}件（5日）\n送ったリアクション：42回\nもらったリアクション：56回\n\nよく使った絵文字 TOP 3\n1位 :blobcat_modoki_02: × 2回\n2位 ❤ × 1回\n\nもらった絵文字 TOP 3\n1位 :blobcatyes@remote.example: × 3回\n\n`);
	expect(fixture.post.mock.calls[0][0].initialText).not.toContain('My channel');
});

test('keeps sharing available when an emoji image cannot load', async () => {
	const view = await openStats();
	await fireEvent.click(view.getByRole('button', { name: /ノートで共有/ }));
	await waitFor(() => expect(images).toHaveLength(3));
	for (const image of images) image.onerror?.(new Event('error'));
	await waitFor(() => expect(fixture.post).toHaveBeenCalledOnce());
	expect(ctx.drawImage).not.toHaveBeenCalled();
	expect(ctx.fillText).toHaveBeenCalledWith(':blobcat_modoki_02:', 136, 430, 280);
});

test('includes the channel only when shown and handles empty rankings', async () => {
	fixture.api.mockResolvedValue({ ...stats, topReactions: [], topReceivedReactions: [] });
	const view = await openStats();
	await fireEvent.click(view.getByRole('button', { name: '表示する' }));
	await fireEvent.click(view.getByRole('button', { name: /ノートで共有/ }));
	await waitFor(() => expect(fixture.post).toHaveBeenCalledOnce());
	expect(fixture.post.mock.calls[0][0].initialText).toContain('\n\nよく使った絵文字 TOP 3\nなし\n\nもらった絵文字 TOP 3\nなし\n\n今週一番投稿したチャンネル\nMy channel（8件）\n\n');
});
