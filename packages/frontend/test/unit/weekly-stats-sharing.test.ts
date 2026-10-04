/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { url } from '@@/js/config.js';
import WeeklyStats from '@/pages/user/activity.weekly-stats.vue';

const fixture = vi.hoisted(() => ({ post: vi.fn(), share: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn().mockResolvedValue({
	sinceDate: '2026-09-28T00:00:00Z',
	notesCount: 1, reactionsCount: 0, receivedReactionsCount: 0, postingDaysCount: 1,
	topReactions: [], topReceivedReactions: [], topPostedChannel: null,
}) }));
vi.mock('@/os.js', () => ({ post: fixture.post, promiseDialog: (promise: Promise<unknown>) => promise }));
vi.mock('@/utility/drive.js', () => ({ uploadFile: () => ({ filePromise: Promise.resolve({ id: 'image' }) }) }));
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' } }));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

test.each(['共有', 'ノートで共有'])('uses the current-account Stats link for %s', async button => {
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
		scale: vi.fn(), fillRect: vi.fn(), fill: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn(), fillText: vi.fn(),
	} as unknown as CanvasRenderingContext2D);
	vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['image'], { type: 'image/png' })));
	vi.stubGlobal('navigator', { share: fixture.share });
	const view = render(WeeklyStats, { global: { stubs: {
		MkNumber: { props: ['value'], template: '<span>{{ value }}</span>' },
		MkLoading: true, MkError: true,
	} } });
	await waitFor(() => expect((view.getByRole('button', { name: button }) as HTMLButtonElement).disabled).toBe(false));
	await fireEvent.click(view.getByRole('button', { name: button }));
	if (button === '共有') {
		await waitFor(() => expect(fixture.share).toHaveBeenCalledOnce());
		expect(fixture.share.mock.calls[0][0].url).toBe(`${url}/:my/stats`);
		expect(fixture.share.mock.calls[0][0].text).toContain('\n\nあなたも、自分のStatsを見てみませんか？');
	} else {
		await waitFor(() => expect(fixture.post).toHaveBeenCalledOnce());
		expect(fixture.post.mock.calls[0][0].initialText).toContain(`\n\n[あなたも、自分のStatsを見てみませんか？](${url}/:my/stats)`);
	}
});
