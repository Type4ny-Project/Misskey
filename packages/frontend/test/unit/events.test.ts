/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import MkUrlEventCard from '@/components/MkUrlEventCard.vue';
import EventPage from '@/pages/event.vue';
import EventEditor from '@/pages/event-editor.vue';
import { i18n } from '@/i18n.js';

const fixture = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn(), alert: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ push: fixture.push }) }));
vi.mock('@/os.js', () => ({ alert: fixture.alert }));
vi.mock('@/i.js', () => ({ $i: null, iAmModerator: false }));
vi.mock('@/cache.js', () => ({}));
vi.mock('@/instance.js', () => ({ instance: {} }));

const global = { stubs: {
	PageWithHeader: { template: '<main><slot/></main>' },
	MkButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' },
	MkLoading: { template: '<div data-testid="loading"/>' },
	MkSystemIcon: { props: ['type'], template: '<div data-testid="result-icon" :data-type="type"/>' },
	MkTime: true,
	MkAvatar: true,
	Mfm: true,
	MkInput: {
		props: ['modelValue', 'type'],
		emits: ['update:modelValue'],
		template: '<label><slot name="label"/><input :type="type" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/><slot name="caption"/></label>',
	},
	MkTextarea: true,
	MkColorInput: true,
} };

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	fixture.api.mockReset();
});

describe('Event failure presentation', () => {
	test.each([['card', MkUrlEventCard], ['page', EventPage]] as const)('shows a missing event message and finishes loading (%s)', async (_, component) => {
		fixture.api.mockRejectedValue({ code: 'NO_SUCH_EVENT' });
		const view = render(component, { props: { eventId: 'missing' }, global });
		await waitFor(() => expect(view.getByText(i18n.ts._events.eventNotFound)).toBeTruthy());
		expect(view.getByTestId('result-icon').getAttribute('data-type')).toBe('question');
		expect(view.queryByTestId('loading')).toBeNull();
		expect(fixture.api).toHaveBeenCalledWith('events/show', { eventId: 'missing' });
	});

	test.each([['card', MkUrlEventCard], ['page', EventPage]] as const)('shows a general error for a failed request (%s)', async (_, component) => {
		fixture.api.mockRejectedValue(new Error('Network error'));
		const view = render(component, { props: { eventId: 'event' }, global });
		await waitFor(() => expect(view.getByText(i18n.ts._events.unknownError)).toBeTruthy());
		expect(view.getByTestId('result-icon').getAttribute('data-type')).toBe('error');
		expect(view.queryByText(i18n.ts._events.eventNotFound)).toBeNull();
		expect(view.queryByTestId('loading')).toBeNull();
	});

	test.each([['card', MkUrlEventCard], ['page', EventPage]] as const)('still renders an existing event (%s)', async (_, component) => {
		fixture.api.mockResolvedValue({
			id: 'event', title: 'Existing event', status: 'approved',
			startAt: '2026-10-04T10:00:00Z', endAt: null, channelId: null,
			createdBy: { id: 'creator', username: 'creator' }, tags: [],
		});
		const view = render(component, { props: { eventId: 'event' }, global });
		await waitFor(() => expect(view.getByText('Existing event')).toBeTruthy());
		expect(view.queryByTestId('loading')).toBeNull();
	});
});

describe('Event editor time range validation', () => {
	test.each([false, true])('prevents submission until the end is at or after the start (edit: %s)', async edit => {
		if (edit) fixture.api.mockResolvedValue({ title: 'Event', startAt: '2026-10-04T10:00:00Z', endAt: null, tags: [] });
		const view = render(EventEditor, { props: edit ? { eventId: 'event' } : {}, global });
		const title = view.getByLabelText(`${i18n.ts._events.title} *`);
		const start = view.getByLabelText(`${i18n.ts._events.startAt} *`);
		if (edit) await waitFor(() => expect((title as HTMLInputElement).value).toBe('Event'));
		const end = view.getByLabelText(i18n.ts._events.endAt);
		const submit = view.getByRole('button', { name: edit ? i18n.ts._events.editEvent : i18n.ts._events.submitEvent }) as HTMLButtonElement;
		await fireEvent.update(title, 'Event');
		await fireEvent.update(start, '2026-10-04T10:00');
		await fireEvent.update(end, '2026-10-04T09:00');
		expect(submit.disabled).toBe(true);
		expect(view.getByRole('alert').textContent).toBe(i18n.ts._events.endBeforeStart);
		await fireEvent.click(submit);
		expect(fixture.api.mock.calls.some(([endpoint]) => endpoint === 'events/create' || endpoint === 'events/update')).toBe(false);
		await fireEvent.update(end, '2026-10-04T10:00');
		expect(submit.disabled).toBe(false);
		expect(view.queryByRole('alert')).toBeNull();
		await fireEvent.update(end, '');
		expect(submit.disabled).toBe(false);
	});
});
