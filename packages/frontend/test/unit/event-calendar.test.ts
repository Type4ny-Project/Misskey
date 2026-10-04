/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkEventCalendar from '@/components/MkEventCalendar.vue';

const popup = vi.hoisted(() => vi.fn(() => ({ dispose: vi.fn() })));
vi.mock('@/os.js', () => ({ popup }));
vi.mock('@@/js/config.js', () => ({ lang: 'ja-JP' }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkEventCalendarPopover.vue', () => ({ default: {} }));
vi.mock('@/components/MkEventCalendarMonthPicker.vue', () => ({ default: {} }));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	popup.mockClear();
});

test('keeps timed events in the more popover when a continuing bar occupies a lower lane', async () => {
	vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(138);
	const timedEvents = Array.from({ length: 3 }, (_, index) => ({
		id: `timed-${index}`, title: `時刻付き予定${index}`, startAt: `2026-10-08T${10 + index}:00:00`,
	}));
	const view = render(MkEventCalendar, { props: { selectedDate: '2026-10-05', events: [
		{ title: '1段目', startAt: '2026-10-04T00:00:00', endAt: '2026-10-06T00:00:00' },
		{ title: '2段目', startAt: '2026-10-05T00:00:00', endAt: '2026-10-07T00:00:00' },
		{ title: '続く予定', startAt: '2026-10-06T00:00:00', endAt: '2026-10-31T00:00:00' },
		...timedEvents,
	] } });
	await nextTick();

	for (const event of timedEvents) expect(view.queryByText(event.title)).toBeNull();
	await fireEvent.click(view.getByRole('button', { name: '他3件' }));
	expect(popup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
		events: timedEvents.map(event => expect.objectContaining({ id: event.id, title: event.title })),
	}), expect.anything());
});
