/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Note } from 'misskey-js/entities.js';

export function getNoteReactionLimit(note: Partial<Pick<Note, 'reactionLimit'>>, roleLimit: number): number {
	return Math.min(roleLimit, note.reactionLimit ?? Infinity);
}
