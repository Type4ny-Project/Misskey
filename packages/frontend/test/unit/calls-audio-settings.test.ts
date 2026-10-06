/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick, reactive } from 'vue';
import MkCallsSettings from '@/components/MkCallsSettings.vue';
import type { CallsNoiseSuppressionMode } from '@/utility/calls-noise-suppression.js';

vi.mock('@/components/MkCallsConnectionInfo.vue', () => ({ default: { template: '<div>Connection statistics</div>' } }));
vi.mock('@/components/MkModalWindow.vue', () => ({ default: { template: '<section><slot name="header"/><slot/></section>' } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _calls: { settings: 'Call settings', generalSettings: 'General', statisticsSettings: 'Statistics', noiseSuppressionMode: 'Noise cancellation', rnnoiseMode: 'RNNoise', webrtcMode: 'WebRTC', noNoiseSuppression: 'None', noiseSuppressionDescription: 'Choose processing', inputSensitivity: 'Threshold', inputGateDisabled: 'All input', inputSensitivityDescription: 'Minimum volume', inputLevel: 'Input level', inputTransmitting: 'Transmitting', inputNotTransmitting: 'Below threshold or muted' } } } }));
afterEach(cleanup);

test('selects processing and threshold, shows the input meter, and disables changes while switching', async () => {
	const state = reactive({ noiseSuppression: 'rnnoise' as CallsNoiseSuppressionMode, inputSensitivity: -45, inputLevel: -32, transmitting: true, busy: false });
	const setNoiseSuppression = vi.fn(async (mode: CallsNoiseSuppressionMode) => { state.noiseSuppression = mode; });
	const setInputSensitivity = vi.fn((value: number) => { state.inputSensitivity = value; });
	const view = render(MkCallsSettings, { props: { getInfo: vi.fn().mockResolvedValue(null), getSettings: () => state, setNoiseSuppression, setInputSensitivity } });
	await fireEvent.update(view.getByRole('combobox'), 'webrtc');
	expect(setNoiseSuppression).toHaveBeenCalledWith('webrtc');
	await fireEvent.update(view.getByRole('slider'), '-35');
	expect(setInputSensitivity).toHaveBeenCalledWith(-35);
	expect(view.getByText('-35 dBFS')).toBeTruthy();
	expect(view.getByLabelText('Input level').getAttribute('value')).toBe('-32');
	state.busy = true;
	await nextTick();
	expect((view.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
	expect((view.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
	await fireEvent.click(view.getByRole('button', { name: 'Statistics' }));
	expect(view.getByText('Connection statistics')).toBeTruthy();
	expect(view.queryByRole('combobox')).toBeNull();
	await fireEvent.click(view.getByRole('button', { name: 'General' }));
	expect(view.getByText('-35 dBFS')).toBeTruthy();
});
