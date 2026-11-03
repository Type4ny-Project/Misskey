/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import locales from 'i18n';
import Privacy from '@/pages/settings/privacy.vue';
import { i18n, updateI18n } from '@/i18n.js';

const fixture = vi.hoisted(() => ({
	save: vi.fn(async () => ({})),
	generalSave: vi.fn(),
	user: {
		requireSigninToViewContents: true,
		makeNotesFollowersOnlyBefore: -604800 as number | null,
		makeNotesHiddenBefore: 1700000000 as number | null,
		policies: { chatAvailability: 'available' },
	},
}));
vi.mock('@/i.js', () => ({ ensureSignin: () => fixture.user }));
vi.mock('@/os.js', () => ({ apiWithDialog: fixture.save }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.generalSave }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/components/MkSelect.vue', () => ({ default: { template: '<div><slot name="label"/></div>' } }));
vi.mock('@/components/MkSwitch.vue', () => ({ default: {
	props: ['modelValue', 'disabled'], emits: ['update:modelValue'],
	template: '<label><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)"><slot name="label"/></label>',
} }));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderPrivacy() {
	updateI18n(locales['ja-JP']);
	const passthrough = { template: '<div><slot/></div>' };
	return render(Privacy, { global: { stubs: {
		SearchMarker: passthrough, SearchLabel: passthrough, SearchText: passthrough,
		MkFeatureBanner: passthrough, MkDisableSection: passthrough,
	} } });
}

test('clears each existing lockdown setting and then disables its switch', async () => {
	fixture.user.requireSigninToViewContents = true;
	fixture.user.makeNotesFollowersOnlyBefore = -604800;
	fixture.user.makeNotesHiddenBefore = 1700000000;
	const view = renderPrivacy();
	for (const [name, params] of [
		[i18n.ts._accountSettings.requireSigninToViewContents, { requireSigninToViewContents: false }],
		[i18n.ts._accountSettings.makeNotesFollowersOnlyBefore, { makeNotesFollowersOnlyBefore: null }],
		[i18n.ts._accountSettings.makeNotesHiddenBefore, { makeNotesHiddenBefore: null }],
	] as const) {
		const input = view.getByRole('checkbox', { name }) as HTMLInputElement;
		expect(input.checked).toBe(true);
		await fireEvent.click(input);
		await waitFor(() => expect(input.disabled).toBe(true));
		expect(input.checked).toBe(false);
		expect(fixture.save).toHaveBeenLastCalledWith('i/update', params);
	}
});

test('cannot enable disabled restrictions and does not resend them when saving another setting', async () => {
	fixture.user.requireSigninToViewContents = false;
	fixture.user.makeNotesFollowersOnlyBefore = null;
	fixture.user.makeNotesHiddenBefore = null;
	const view = renderPrivacy();
	for (const name of [
		i18n.ts._accountSettings.requireSigninToViewContents,
		i18n.ts._accountSettings.makeNotesFollowersOnlyBefore,
		i18n.ts._accountSettings.makeNotesHiddenBefore,
	]) {
		const input = view.getByRole('checkbox', { name }) as HTMLInputElement;
		expect(input.disabled).toBe(true);
		expect(input.checked).toBe(false);
	}
	await fireEvent.click(view.getByRole('checkbox', { name: i18n.ts.hideOnlineStatus }));
	const params = fixture.generalSave.mock.calls[0][1];
	expect(params).not.toHaveProperty('requireSigninToViewContents');
	expect(params).not.toHaveProperty('makeNotesFollowersOnlyBefore');
	expect(params).not.toHaveProperty('makeNotesHiddenBefore');
	expect(fixture.save).not.toHaveBeenCalled();
});
