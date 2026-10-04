/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import { defineComponent, h, Suspense } from 'vue';
import locales from 'i18n';
import Settings from '@/pages/admin/settings.vue';
import { i18n, updateI18n } from '@/i18n.js';

const fixture = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock('@/os.js', () => ({ apiWithDialog: fixture.save }));
vi.mock('@/instance.js', () => ({ instance: { providesTarball: true }, fetchInstance: fixture.refresh }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn(async endpoint => endpoint === 'admin/meta' ? {
		enableLoginBonus: false, loginBonusResetTime: '00:00', loginBonusMinPoints: 1, loginBonusMaxPoints: 5,
		pinnedUsers: [], urlPreviewSensitiveList: [], federationHosts: [], deliverSuspendedSoftware: [],
		federation: 'all',
	} : { description: '' }),
}));
vi.mock('@/components/MkFolder.vue', () => ({ default: {
	template: '<fieldset><legend><slot name="label"/></legend><slot/><slot name="footer"/></fieldset>',
} }));
vi.mock('@/components/MkInput.vue', () => ({ default: {
	props: ['modelValue', 'type'], emits: ['update:modelValue'],
	template: '<label><slot name="label"/><input :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', type === \'number\' ? $event.target.valueAsNumber : $event.target.value)"><slot name="caption"/></label>',
} }));
vi.mock('@/components/MkSwitch.vue', () => ({ default: {
	props: ['modelValue'], emits: ['update:modelValue'],
	template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)"><slot name="label"/></label>',
} }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkTextarea.vue', () => ({ default: { template: '<div><slot name="label"/></div>' } }));
vi.mock('@/components/MkRadios.vue', () => ({ default: { template: '<div><slot name="label"/></div>' } }));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

async function renderSettings() {
	updateI18n(locales['ja-JP']);
	const wrapper = defineComponent({ setup: () => () => h('div', [h(Suspense, null, { default: () => h(Settings) })]) });
	const passthrough = { template: '<div><slot/></div>' };
	const view = render(wrapper, { global: { stubs: {
		PageWithHeader: passthrough, SearchIcon: passthrough, SearchLabel: passthrough, SearchText: passthrough,
		SearchMarker: { inheritAttrs: false, template: '<div><slot :isParentOfTarget="true"/></div>' },
	}, directives: { panel: {} } } });
	const panel = await view.findByRole('group', { name: i18n.ts._serverSettings._loginBonus.title });
	return within(panel);
}

test('shows login bonus settings and saves enablement, time and fixed points', async () => {
	const panel = await renderSettings();
	const labels = i18n.ts._serverSettings._loginBonus;
	expect((panel.getByLabelText(labels.resetTime, { exact: false }) as HTMLInputElement).value).toBe('00:00');
	await fireEvent.click(panel.getByRole('checkbox', { name: labels.enabled }));
	await fireEvent.update(panel.getByLabelText(labels.resetTime, { exact: false }), '07:30');
	await fireEvent.update(panel.getByLabelText(labels.minPoints), '10');
	await fireEvent.update(panel.getByLabelText(labels.maxPoints), '10');
	await fireEvent.click(panel.getByRole('button', { name: new RegExp(i18n.ts.save) }));
	await waitFor(() => expect(fixture.save).toHaveBeenCalledWith('admin/update-meta', {
		enableLoginBonus: true, loginBonusResetTime: '07:30', loginBonusMinPoints: 10, loginBonusMaxPoints: 10,
	}));
	expect(fixture.refresh).toHaveBeenCalledWith(true);
});

test('disables saving an inverted range and restores saved values on discard', async () => {
	const panel = await renderSettings();
	const labels = i18n.ts._serverSettings._loginBonus;
	await fireEvent.update(panel.getByLabelText(labels.minPoints), '6');
	const save = panel.getByRole('button', { name: new RegExp(i18n.ts.save) }) as HTMLButtonElement;
	expect(save.disabled).toBe(true);
	expect(panel.getByText(labels.invalidPointsRange)).toBeTruthy();
	await fireEvent.click(panel.getByRole('button', { name: new RegExp(i18n.ts.discard) }));
	await waitFor(() => expect((panel.getByLabelText(labels.minPoints) as HTMLInputElement).value).toBe('1'));
	expect(fixture.save).not.toHaveBeenCalled();
});
