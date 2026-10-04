/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { getNoteReactionLimit } from '@/utility/get-note-reaction-limit.js';

describe('getNoteReactionLimit', () => {
	test.each([
		{ noteLimit: undefined, roleLimit: 3, expected: 3 },
		{ noteLimit: null, roleLimit: 3, expected: 3 },
		{ noteLimit: 1, roleLimit: 3, expected: 1 },
		{ noteLimit: 5, roleLimit: 3, expected: 3 },
	])('投稿上限 $noteLimit / ロール上限 $roleLimit → $expected', ({ noteLimit, roleLimit, expected }) => {
		expect(getNoteReactionLimit({ reactionLimit: noteLimit }, roleLimit)).toBe(expected);
	});
});
