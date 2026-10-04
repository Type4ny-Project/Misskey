/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type { MiNote } from '@/models/Note.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';

describe('NoteDeleteService', () => {
	test('does not invalidate the featured collection when deleting an unpinned local note', async () => {
		const notesRepository = {
			delete: vi.fn().mockResolvedValue(undefined),
		};
		const userNotePiningsRepository = {
			existsBy: vi.fn().mockResolvedValue(false),
		};
		const userEntityService = {
			isLocalUser: vi.fn().mockReturnValue(true),
		};
		const searchService = {
			unindexNote: vi.fn(),
		};
		const featuredCollectionCacheService = {
			invalidate: vi.fn(),
		};
		const service = Reflect.construct(NoteDeleteService, [
			{},
			{},
			{},
			notesRepository,
			{},
			userNotePiningsRepository,
			userEntityService,
			{},
			{},
			{},
			{},
			{},
			searchService,
			{},
			{},
			{},
			{},
			featuredCollectionCacheService,
		]) as NoteDeleteService;
		const user = {
			id: 'local-user',
			uri: null,
			host: null,
			isBot: false,
		};
		const note = {
			id: 'unpinned-note',
			userId: user.id,
			replyId: null,
		} as MiNote;

		await service.delete(user, note, true);

		expect(userNotePiningsRepository.existsBy).toHaveBeenCalledWith({
			userId: user.id,
			noteId: note.id,
		});
		expect(featuredCollectionCacheService.invalidate).not.toHaveBeenCalled();
		expect(notesRepository.delete).toHaveBeenCalledWith({
			id: note.id,
			userId: user.id,
		});
	});
});
