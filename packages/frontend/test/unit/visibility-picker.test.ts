/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkVisibilityPicker from '@/components/MkVisibilityPicker.vue';
import { i18n } from '@/i18n.js';

const fixture = vi.hoisted(() => ({ close: vi.fn(), modalProps: null as null | Record<string, unknown> }));
vi.mock('@/components/MkModal.vue', async () => {
	const { defineComponent } = await import('vue');
	return { default: defineComponent({
		props: ['anchorElement', 'returnFocusTo', 'zPriority'],
		emits: ['click', 'closed', 'esc'],
		setup(props) {
			fixture.modalProps = props;
		},
		template: '<section data-testid="visibility-modal" @keydown.esc="$emit(\'esc\')" @click.self="$emit(\'click\')"><slot type="popup"/></section>',
		methods: {
			close() {
				fixture.close();
				this.$emit('closed');
			},
		},
	}) };
});

beforeEach(() => {
	fixture.close.mockClear();
	fixture.modalProps = null;
});

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

describe('visibility picker used by the post-form shortcut', () => {
	test('forwards the editor focus target separately from its positioning anchor', () => {
		const editor = document.createElement('textarea');
		const anchor = document.createElement('button');
		document.body.append(editor, anchor);
		render(MkVisibilityPicker, {
			props: { currentVisibility: 'public', isSilenced: false, anchorElement: anchor, returnFocusTo: editor },
		});
		expect(fixture.modalProps?.anchorElement).toBe(anchor);
		expect(fixture.modalProps?.returnFocusTo).toBe(editor);
		expect(fixture.modalProps?.zPriority).toBe('high');
	});

	test('leaves focus restoration unspecified for existing pointer callers', () => {
		const anchor = document.createElement('button');
		render(MkVisibilityPicker, { props: { currentVisibility: 'public', isSilenced: false, anchorElement: anchor } });
		expect(fixture.modalProps?.anchorElement).toBe(anchor);
		expect(fixture.modalProps?.returnFocusTo).toBeUndefined();
	});

	test.each(['public', 'home', 'followers', 'specified'] as const)('selecting %s emits the existing visibility value and closes', async (visibility) => {
		const view = render(MkVisibilityPicker, { props: { currentVisibility: 'public', isSilenced: false } });
		await fireEvent.click(view.getByRole('button', { name: new RegExp(`^${i18n.ts._visibility[visibility]}`) }));
		await nextTick();
		expect(view.emitted('changeVisibility')).toEqual([[visibility]]);
		expect(fixture.close).toHaveBeenCalledOnce();
		expect(view.emitted('closed')).toEqual([[]]);
	});

	test.each(['Escape', 'outside click'])('%s cancels without changing visibility', async (dismissal) => {
		const view = render(MkVisibilityPicker, { props: { currentVisibility: 'followers', isSilenced: false } });
		const modal = view.getByTestId('visibility-modal');
		if (dismissal === 'Escape') {
			await fireEvent.keyDown(modal, { key: 'Escape', code: 'Escape' });
		} else {
			await fireEvent.click(modal);
		}
		expect(view.emitted('changeVisibility')).toBeUndefined();
		expect(fixture.close).toHaveBeenCalledOnce();
		expect(view.emitted('closed')).toEqual([[]]);
	});

	test('silenced accounts cannot choose public visibility', async () => {
		const view = render(MkVisibilityPicker, { props: { currentVisibility: 'home', isSilenced: true } });
		const publicButton = view.getByRole('button', { name: new RegExp(`^${i18n.ts._visibility.public}`) }) as HTMLButtonElement;
		expect(publicButton.disabled).toBe(true);
		publicButton.click();
		await nextTick();
		expect(view.emitted('changeVisibility')).toBeUndefined();
		for (const visibility of ['home', 'followers', 'specified'] as const) {
			expect((view.getByRole('button', { name: new RegExp(`^${i18n.ts._visibility[visibility]}`) }) as HTMLButtonElement).disabled).toBe(false);
		}
	});

	test('a reply to specified recipients cannot be widened', async () => {
		const view = render(MkVisibilityPicker, {
			props: { currentVisibility: 'specified', isSilenced: false, isReplyVisibilitySpecified: true },
		});
		for (const visibility of ['public', 'home', 'followers'] as const) {
			const button = view.getByRole('button', { name: new RegExp(`^${i18n.ts._visibility[visibility]}`) }) as HTMLButtonElement;
			expect(button.disabled).toBe(true);
			button.click();
		}
		await nextTick();
		expect(view.emitted('changeVisibility')).toBeUndefined();
		expect(fixture.close).not.toHaveBeenCalled();
		const specified = view.getByRole('button', { name: new RegExp(`^${i18n.ts._visibility.specified}`) }) as HTMLButtonElement;
		expect(specified.disabled).toBe(false);
		await fireEvent.click(specified);
		expect(view.emitted('changeVisibility')).toEqual([['specified']]);
	});
});
