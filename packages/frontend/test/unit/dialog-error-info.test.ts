/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import MkDialog from '@/components/MkDialog.vue';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';

vi.mock('@/os.js', () => ({}));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/components/MkModal.vue', () => ({ default: { emits: ['click', 'closed'], template: '<section><slot/></section>', methods: { close() {} } } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('dialog error information', () => {
	test('copies diagnostics without dismissing the dialog', async () => {
		const view = render(MkDialog, {
			props: { type: 'error', text: 'Something happened', errorInfo: 'diagnostics' },
			global: { stubs: { MkSystemIcon: true, Mfm: true } },
		});
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.copyErrorInfo }));
		expect(copyToClipboard).toHaveBeenCalledWith('diagnostics');
		expect(view.emitted().done).toBeUndefined();
		await fireEvent.click(view.getByTestId('modal-dialog-ok'));
		expect(view.emitted().done).toHaveLength(1);
	});

	test.each(['error', 'info'] as const)('keeps existing %s dialogs without diagnostics unchanged', type => {
		const view = render(MkDialog, { props: { type }, global: { stubs: { MkSystemIcon: true } } });
		expect(view.queryByRole('button', { name: i18n.ts.copyErrorInfo })).toBeNull();
	});
});
