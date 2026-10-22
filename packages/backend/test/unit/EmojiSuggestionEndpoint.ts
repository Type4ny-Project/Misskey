/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { GetterService } from '@/server/api/GetterService.js';
import type { EmojiSuggestionService } from '@/core/EmojiSuggestionService.js';
import type { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import type { RoleService } from '@/core/RoleService.js';
import type { EmojisRepository, MiNote, MiEmoji } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import Endpoint from '@/server/api/endpoints/notes/reactions/suggestions.js';

function setup() {
	const getter = mock<GetterService>();
	const suggestions = mock<EmojiSuggestionService>();
	const notes = mock<NoteEntityService>();
	const roles = mock<RoleService>();
	const emojis = mock<EmojisRepository>();
	getter.getNoteWithRelations.mockResolvedValue({ id: 'note1', visibility: 'public', userHost: null } as MiNote);
	notes.isVisibleForMe.mockResolvedValue(true);
	notes.pack.mockResolvedValue({ id: 'note1', files: [] } as never);
	roles.getUserRoles.mockResolvedValue([]);
	suggestions.suggestForNote.mockResolvedValue({ items: [{ name: 'hello', score: 0.8, aliases: [], category: null }], reason: null });
	emojis.findBy.mockResolvedValue([{ name: 'hello', aliases: [], category: null, roleIdsThatCanBeUsedThisEmojiAsReaction: [] } as unknown as MiEmoji]);
	return { endpoint: new Endpoint(getter, suggestions, notes, roles, emojis), getter, suggestions, notes, roles, emojis };
}

describe('emoji suggestion authorization before cache access', () => {
	test('checks each caller even when the same note already has suggestions', async () => {
		const h = setup();
		await expect(h.endpoint.exec({ noteId: 'note1' }, { id: 'allowed' } as MiLocalUser, null)).resolves.toMatchObject({ items: [{ name: 'hello' }] });
		h.notes.isVisibleForMe.mockResolvedValue(false);
		await expect(h.endpoint.exec({ noteId: 'note1' }, { id: 'denied' } as MiLocalUser, null)).rejects.toMatchObject({ code: 'NO_SUCH_NOTE' });
		expect(h.suggestions.suggestForNote).toHaveBeenCalledTimes(1);
	});

	test('rejects content hidden by packing before consulting cache or Worker', async () => {
		const h = setup();
		h.notes.pack.mockResolvedValue({ isHidden: true } as never);
		await expect(h.endpoint.exec({ noteId: 'note1' }, { id: 'user' } as MiLocalUser, null)).rejects.toMatchObject({ code: 'NO_SUCH_NOTE' });
		expect(h.suggestions.suggestForNote).not.toHaveBeenCalled();
	});

	test('rechecks role-restricted and deleted emojis after cache lookup', async () => {
		const h = setup();
		h.emojis.findBy.mockResolvedValue([{ name: 'hello', roleIdsThatCanBeUsedThisEmojiAsReaction: ['special'] } as MiEmoji]);
		await expect(h.endpoint.exec({ noteId: 'note1' }, { id: 'user' } as MiLocalUser, null)).resolves.toEqual({ items: [], reason: null });
		h.emojis.findBy.mockResolvedValue([]);
		await expect(h.endpoint.exec({ noteId: 'note1' }, { id: 'user' } as MiLocalUser, null)).resolves.toEqual({ items: [], reason: null });
	});
});
