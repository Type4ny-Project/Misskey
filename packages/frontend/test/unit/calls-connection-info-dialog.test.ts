/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import MkCallsConnectionInfo from '@/components/MkCallsConnectionInfo.vue';
import type { CallsConnectionInfo } from '@/utility/calls-connection-info.js';

afterEach(() => { cleanup(); vi.useRealTimers(); });

test('renders live connection information and stops polling when closed', async () => {
	vi.useFakeTimers();
	const info: CallsConnectionInfo = { state: 'connected', turnServers: [{ host: 'turn.example.com', udp: ['3478'], tcp: [], tls: ['443'] }], relay: false, protocol: 'udp', roundTripTime: 0.021, sendLoss: 0.1, receiveLoss: null };
	const getInfo = vi.fn().mockResolvedValue(info);
	const view = render(MkCallsConnectionInfo, {
		props: { getInfo },
		global: { stubs: { MkModalWindow: { template: '<section><slot name="header"/><slot/><button @click="$emit(\'close\')">Close</button></section>', methods: { close() {} } } } },
	});
	await vi.advanceTimersByTimeAsync(0);
	expect(view.getByText('turn.example.com')).toBeTruthy();
	expect(view.getByText('21 ms')).toBeTruthy();
	expect(view.getByText('0.1%')).toBeTruthy();
	getInfo.mockResolvedValue({ ...info, roundTripTime: 0.042 });
	await vi.advanceTimersByTimeAsync(2000);
	expect(view.getByText('42 ms')).toBeTruthy();
	view.getByRole('button', { name: 'Close' }).click();
	await vi.advanceTimersByTimeAsync(4000);
	expect(getInfo).toHaveBeenCalledTimes(2);
});
