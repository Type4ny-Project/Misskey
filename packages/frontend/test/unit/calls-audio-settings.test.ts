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
vi.mock('@/os.js', () => ({ alert: vi.fn() }));
vi.mock('@/components/MkModalWindow.vue', () => ({ default: { template: '<section><slot name="header"/><slot/></section>' } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _calls: { settings: 'Call settings', audioSection: 'Audio', microphoneTest: 'Microphone test', stopMicrophoneTest: 'Stop test', microphoneTestDescription: 'Loopback', previewCamera: 'Preview camera', selectCamera: 'Select camera', generalSettings: 'General', statisticsSettings: 'Statistics', microphone: 'Microphone', camera: 'Camera', outputDevice: 'Speaker', systemDefaultDevice: 'Default', inputVolume: 'Input volume', outputVolume: 'Output volume', refreshDevices: 'Refresh devices', noiseSuppressionMode: 'Noise cancellation', rnnoiseMode: 'RNNoise', webrtcMode: 'WebRTC', noNoiseSuppression: 'None', noiseSuppressionDescription: 'Choose processing', inputSensitivity: 'Threshold', inputGateDisabled: 'All input', inputSensitivityDescription: 'Minimum volume', inputLevel: 'Input level', inputTransmitting: 'Transmitting', inputNotTransmitting: 'Below threshold or muted' } } } }));
afterEach(cleanup);

test('selects processing and threshold, shows the input meter, and disables changes while switching', async () => {
	const state = reactive({ noiseSuppression: 'rnnoise' as CallsNoiseSuppressionMode, inputSensitivity: -45, inputLevel: -32, transmitting: true, busy: false, microphones: [{ deviceId: 'mic-1', label: 'USB microphone' } as MediaDeviceInfo], cameras: [], outputDevices: [], microphoneId: '', cameraId: '', outputDeviceId: '', inputVolume: 100, outputVolume: 100, supportsOutputDevice: true });
	const setNoiseSuppression = vi.fn(async (mode: CallsNoiseSuppressionMode) => { state.noiseSuppression = mode; });
	const setInputSensitivity = vi.fn((value: number) => { state.inputSensitivity = value; });
	const setDevice = vi.fn();
	const setInputVolume = vi.fn();
	const setOutputVolume = vi.fn();
	const view = render(MkCallsSettings, { props: { getInfo: vi.fn().mockResolvedValue(null), getSettings: () => state, setNoiseSuppression, setInputSensitivity, setInputVolume, setOutputVolume, setDevice, refreshDevices: vi.fn() } });
	await fireEvent.update(view.getByRole('combobox', { name: 'Microphone' }), 'mic-1');
	expect(setDevice).toHaveBeenCalledWith('microphone', 'mic-1');
	await fireEvent.update(view.getByRole('slider', { name: /Input volume/ }), '150');
	expect(setInputVolume).toHaveBeenCalledWith(150);
	await fireEvent.update(view.getByRole('slider', { name: /Output volume/ }), '50');
	expect(setOutputVolume).toHaveBeenCalledWith(50);
	await fireEvent.click(view.getByRole('radio', { name: 'WebRTC' }));
	expect(setNoiseSuppression).toHaveBeenCalledWith('webrtc');
	await fireEvent.update(view.getByRole('slider', { name: /Threshold/ }), '-35');
	expect(setInputSensitivity).toHaveBeenCalledWith(-35);
	expect(view.getByText('-35 dBFS')).toBeTruthy();
	expect(view.getByLabelText('Input level').getAttribute('aria-valuenow')).toBe('-32');
	state.busy = true;
	await nextTick();
	expect((view.getByRole('radio', { name: 'WebRTC' }) as HTMLInputElement).disabled).toBe(true);
	expect((view.getByRole('slider', { name: /Threshold/ }) as HTMLInputElement).disabled).toBe(true);
	await fireEvent.click(view.getByRole('button', { name: 'Statistics' }));
	expect(view.getByText('Connection statistics')).toBeTruthy();
	expect(view.queryByRole('radio', { name: 'WebRTC' })).toBeNull();
	await fireEvent.click(view.getByRole('button', { name: 'General' }));
	expect(view.getByText('-35 dBFS')).toBeTruthy();
});
