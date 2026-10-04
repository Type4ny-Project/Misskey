/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { PostScheduledNoteProcessorService } from '@/queue/processors/PostScheduledNoteProcessorService.js';
import type { Job } from 'bullmq';
import type { PostScheduledNoteJobData } from '@/queue/types.js';

describe('PostScheduledNoteProcessorService', () => {
	test('予約投稿のリアクション上限をノート作成に渡す', async () => {
		const draft = {
			id: 'draft-id', userId: 'author', user: { id: 'author' },
			scheduledAt: new Date(), isActuallyScheduled: true, reactionLimit: 1,
		};
		const fetchAndCreate = vi.fn().mockResolvedValue({ id: 'note-id' });
		const service = Object.assign(Object.create(PostScheduledNoteProcessorService.prototype), {
			noteDraftsRepository: {
				findOne: vi.fn().mockResolvedValue(draft),
				remove: vi.fn().mockResolvedValue(draft),
			},
			noteCreateService: { fetchAndCreate },
			notificationService: { createNotification: vi.fn() },
		}) as PostScheduledNoteProcessorService;

		await service.process({ data: { noteDraftId: draft.id } } as Job<PostScheduledNoteJobData>);
		expect(fetchAndCreate).toHaveBeenCalledWith(draft.user, expect.objectContaining({ reactionLimit: 1 }));
	});
});
