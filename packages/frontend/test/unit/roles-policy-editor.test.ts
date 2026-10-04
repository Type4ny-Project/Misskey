/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import type { RolePolicies } from 'misskey-js/entities.js';
import RolesPolicyEditor from '@/pages/admin/roles.policy-editor.vue';
import { i18n } from '@/i18n.js';

vi.mock('@/instance.js', () => ({ instance: {} }));

afterEach(cleanup);

const global = {
	stubs: {
		MkFolder: { template: '<section><header><slot name="label"/><slot name="suffix"/></header><slot/></section>' },
	},
};

test('base roles expose a searchable reaction limit and emit edited values', async () => {
	const view = render(RolesPolicyEditor, {
		props: { isBaseRole: true, rolePolicies: { reactionLimit: 3 } as RolePolicies, roleQuery: 'reactionLimit' },
		global,
	});
	const input = view.getByRole('spinbutton') as HTMLInputElement;
	expect(view.getByText(i18n.ts._role._options.reactionLimit)).toBeTruthy();
	expect(input.value).toBe('3');
	expect(input.disabled).toBe(false);
	await fireEvent.update(input, '5');
	await waitFor(() => expect(view.emitted('update:rolePolicies')).toEqual([[{ reactionLimit: 5 }]]));
	await view.rerender({ roleQuery: i18n.ts._role._options.reactionLimit });
	expect(view.getByRole('spinbutton')).toBeTruthy();
	await view.rerender({ roleQuery: 'unrelated policy' });
	expect(view.queryByRole('spinbutton')).toBeNull();
});

test('role overrides respect base-value inheritance and readonly mode', async () => {
	const view = render(RolesPolicyEditor, {
		props: { isBaseRole: false, rolePolicies: { reactionLimit: 3 } as RolePolicies, roleQuery: 'reactionLimit' },
		global,
	});
	const input = view.getByRole('spinbutton') as HTMLInputElement;
	expect(input.disabled).toBe(true);
	await fireEvent.click(view.getByTestId('switch-toggle'));
	await waitFor(() => expect(input.disabled).toBe(false));
	expect(view.emitted('update:policiesMeta')?.at(-1)).toMatchObject([{ reactionLimit: { useDefault: false, priority: 0 } }]);
	await fireEvent.update(input, '7');
	await waitFor(() => expect(view.emitted('update:rolePolicies')).toEqual([[{ reactionLimit: 7 }]]));
	await view.rerender({ readonly: true });
	expect(input.disabled).toBe(true);
});
