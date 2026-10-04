/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import MkCallsCameraPreviewDialog from '@/components/MkCallsCameraPreviewDialog.vue';
import { i18n } from '@/i18n.js';

afterEach(cleanup);

describe('Calls camera preview dialog', () => {
	test('shows the local stream and confirms only when the start button is pressed', async () => {
		const stream = new window.MediaStream();
		const view = render(MkCallsCameraPreviewDialog, {
			props: { stream },
			global: { stubs: {
				MkModalWindow: { template: '<section><slot name="header"/><slot/></section>', methods: { close() {} } },
				MkButton: { template: '<button><slot/></button>' },
			} },
		});
		expect(view.container.querySelector('video')?.srcObject).toBe(stream);
		expect(view.emitted('done')).toBeUndefined();
		view.getByText(i18n.ts._calls.startCamera).click();
		expect(view.emitted('done')).toEqual([[true]]);
	});
});
