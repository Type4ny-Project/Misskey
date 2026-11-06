/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { h } from 'vue';
import MkCallsActivities from '@/components/calls/MkCallsActivities.vue';
import { i18n } from '@/i18n.js';

afterEach(cleanup);

test('selects supplied activities, renders their content, and returns to the list', async () => {
	const view = render(MkCallsActivities, {
		props: { activities: [
			{ id: 'first', title: 'First activity', description: 'First description', icon: 'ti ti-device-gamepad-2' },
			{ id: 'second', title: 'Second activity', description: 'Second description', icon: 'ti ti-device-gamepad-2' },
		] },
		slots: { default: ({ activity }: { activity: string }) => h('p', `Content: ${activity}`) },
	});
	await fireEvent.click(view.getByRole('button', { name: 'First activity First description' }));
	expect(view.getByRole('heading', { name: 'First activity' })).toBeTruthy();
	expect(view.getByText('Content: first')).toBeTruthy();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._calls.backToActivities }));
	expect(view.queryByText('Content: first')).toBeNull();
	await fireEvent.click(view.getByRole('button', { name: 'Second activity Second description' }));
	expect(view.getByText('Content: second')).toBeTruthy();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.close }));
	expect(view.emitted().close).toHaveLength(1);
});
