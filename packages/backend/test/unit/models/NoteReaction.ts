/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getMetadataArgsStorage } from 'typeorm';
import { describe, expect, test } from 'vitest';
import { MiNoteReaction } from '@/models/NoteReaction.js';

describe('MiNoteReaction', () => {
	test('uses the index names created by the multiple reactions migration', () => {
		const indexes = getMetadataArgsStorage().indices.filter(index => index.target === MiNoteReaction);
		const userNoteIndex = indexes.find(index => index.name === 'IDX_note_reaction_userId_noteId');
		const userNoteReactionIndex = indexes.find(index => index.name === 'IDX_note_reaction_userId_noteId_reaction');

		expect(userNoteIndex?.columns).toEqual(['userId', 'noteId']);
		expect(userNoteIndex?.unique).toBe(false);
		expect(userNoteReactionIndex?.columns).toEqual(['userId', 'noteId', 'reaction']);
		expect(userNoteReactionIndex?.unique).toBe(true);
	});
});
