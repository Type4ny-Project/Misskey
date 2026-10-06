/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import MkCallsCameraPreview from '@/components/MkCallsCameraPreview.vue';

vi.mock('@/os.js', () => ({ alert: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { close: 'Close', _calls: { previewCamera: 'Preview', camera: 'Camera', videoFailed: 'Failed' } } } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('opens the selected camera only on request and stops it on close and unmount', async () => {
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
	const track = { stop: vi.fn() };
	const stream = Object.assign(new MediaStream(), { getTracks: () => [track] }) as unknown as MediaStream;
	const capture = vi.fn().mockResolvedValue(stream);
	Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: capture } });
	const view = render(MkCallsCameraPreview, { props: { deviceId: 'usb-camera' } });
	expect(capture).not.toHaveBeenCalled();
	await fireEvent.click(view.getByRole('button', { name: 'Preview' }));
	await waitFor(() => expect(view.container.querySelector('video')?.srcObject).toBe(stream));
	expect(capture).toHaveBeenCalledWith({ video: { deviceId: { exact: 'usb-camera' } }, audio: false });
	await fireEvent.click(view.getByRole('button', { name: 'Close' }));
	expect(track.stop).toHaveBeenCalledTimes(1);
	expect(view.container.querySelector('video')).toBeNull();
	await fireEvent.click(view.getByRole('button', { name: 'Preview' }));
	await waitFor(() => expect(view.container.querySelector('video')?.srcObject).toBe(stream));
	view.unmount();
	expect(track.stop).toHaveBeenCalledTimes(2);
});

test('releases a camera whose permission request completes after the preview is closed', async () => {
	let resolve!: (stream: MediaStream) => void;
	const capture = vi.fn(() => new Promise<MediaStream>(done => { resolve = done; }));
	Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: capture } });
	const view = render(MkCallsCameraPreview, { props: { deviceId: '' } });
	await fireEvent.click(view.getByRole('button', { name: 'Preview' }));
	view.unmount();
	const stop = vi.fn();
	resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
	await waitFor(() => expect(stop).toHaveBeenCalledOnce());
});
