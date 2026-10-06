/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { reactive } from 'vue';
import MkCallsMicrophoneTest from '@/components/MkCallsMicrophoneTest.vue';
import { createCallsNoiseSuppression } from '@/utility/calls-noise-suppression.js';

vi.mock('@/os.js', () => ({ alert: vi.fn() }));
vi.mock('@/utility/calls-noise-suppression.js', () => ({ createCallsNoiseSuppression: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _calls: { microphoneTest: 'Test microphone', stopMicrophoneTest: 'Stop', microphoneTestDescription: 'Loopback', inputLevel: 'Input level', inputTransmitting: 'Transmitting', inputNotTransmitting: 'Quiet', mediaFailed: 'Failed' } } } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('loops the selected microphone through processing, adjusts volumes, and stops all tracks', async () => {
	const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
	const track = Object.assign(new EventTarget(), { kind: 'audio', stop: vi.fn() }) as unknown as MediaStreamTrack;
	const stream = Object.assign(new MediaStream([track]), { getTracks: () => [track] });
	const capture = vi.fn().mockResolvedValue(stream);
	Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: capture } });
	const processor = { track, close: vi.fn(), setInputVolume: vi.fn(), setInputSensitivity: vi.fn(), setMuted: vi.fn(), setEnabled: vi.fn() };
	vi.mocked(createCallsNoiseSuppression).mockResolvedValue(processor);
	const state = reactive({ noiseSuppression: 'none' as const, inputSensitivity: -45, inputLevel: -100, transmitting: false, busy: false, microphones: [], cameras: [], outputDevices: [], microphoneId: 'usb-microphone', cameraId: '', outputDeviceId: '', inputVolume: 100, outputVolume: 50, supportsOutputDevice: false });
	const view = render(MkCallsMicrophoneTest, { props: { getSettings: () => state } });
	expect(capture).not.toHaveBeenCalled();
	await fireEvent.click(view.getByRole('button', { name: 'Test microphone' }));
	await waitFor(() => expect(play).toHaveBeenCalledOnce());
	expect(capture).toHaveBeenCalledWith({ audio: { deviceId: { exact: 'usb-microphone' }, echoCancellation: true, noiseSuppression: false }, video: false });
	const options = vi.mocked(createCallsNoiseSuppression).mock.calls[0][3]!;
	expect(options).toMatchObject({ rnnoise: false, inputSensitivity: -45, inputVolume: 100 });
	options.onLevel?.(-30, true);
	await waitFor(() => expect(view.getByLabelText('Input level').getAttribute('aria-valuenow')).toBe('-30'));
	state.inputVolume = 150;
	await waitFor(() => expect(processor.setInputVolume).toHaveBeenCalledWith(150));
	view.unmount();
	expect(processor.close).toHaveBeenCalledOnce();
	expect(track.stop).toHaveBeenCalledOnce();
});
