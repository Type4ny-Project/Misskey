/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('Calls reference client independence', () => {
	test('uses only the public misskey-js package', async () => {
		const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
		expect(source).toContain("from 'misskey-js'");
		expect(source).not.toMatch(/packages\/frontend|@\/|frontend\/src/);
	});
});
