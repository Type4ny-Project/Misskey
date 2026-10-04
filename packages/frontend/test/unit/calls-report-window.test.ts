/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import MkAbuseReportWindow from '@/components/MkAbuseReportWindow.vue';
import { i18n } from '@/i18n.js';

const api = vi.hoisted(() => vi.fn());
vi.mock('@/os.js', () => ({ apiWithDialog: api, alert: vi.fn() }));
const stubs = {
	MkWindow: { template: '<section><slot name="header"/><slot/></section>', methods: { close() {} } },
	MkTextarea: { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' },
	MkSwitch: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<button :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)"><slot/></button>' },
	MkButton: { template: '<button><slot/></button>' },
	MkInfo: { template: '<p><slot/></p>' },
	I18n: true, MkAcct: true,
};
const user = { id: 'target', username: 'target' } as never;
const context = { roomId: 'room', roomTitle: 'Room', reportedAt: 1791120000000 };

beforeEach(() => api.mockReset().mockResolvedValue(undefined));
afterEach(cleanup);

test('waits for capture, previews it, and submits it with the Calls context', async () => {
	let finish!: (blob: Blob | null) => void;
	const capture = { recording: new Promise<Blob | null>(resolve => { finish = resolve; }), cancel: vi.fn() };
	const view = render(MkAbuseReportWindow, { props: { user, initialComment: 'Abuse', calls: { ...context, capture } }, global: { stubs } });
	const send = view.getByRole('button', { name: i18n.ts.send }) as HTMLButtonElement;
	expect(send.disabled).toBe(true);
	finish(new Blob(['audio'], { type: 'audio/wav' }));
	await waitFor(() => expect(send.disabled).toBe(false));
	expect(view.container.querySelector('audio')?.getAttribute('src')).toContain('blob:');
	await fireEvent.click(send);
	await waitFor(() => expect(api).toHaveBeenCalledWith('calls/rooms/report-abuse', { roomId: context.roomId, reportedAt: context.reportedAt, userId: 'target', comment: 'Abuse', recording: btoa('audio') }));
	view.unmount();
	expect(capture.cancel).toHaveBeenCalledOnce();
});

test('can send without audio while capture is pending', async () => {
	const capture = { recording: new Promise<Blob | null>(() => {}), cancel: vi.fn() };
	const view = render(MkAbuseReportWindow, { props: { user, initialComment: 'Abuse', calls: { ...context, capture } }, global: { stubs } });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._calls.attachRecording }));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.send }));
	await waitFor(() => expect(api).toHaveBeenCalledWith('calls/rooms/report-abuse', expect.objectContaining({ recording: undefined })));
});

test('keeps ordinary user reports on the existing API', async () => {
	const view = render(MkAbuseReportWindow, { props: { user, initialComment: 'Abuse' }, global: { stubs } });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.send }));
	await waitFor(() => expect(api).toHaveBeenCalledWith('users/report-abuse', { userId: 'target', comment: 'Abuse' }));
});
