/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Keep one playback element and stream throughout speaker changes. Safari's
// autoplay permission belongs to the element, not to the call room.
export class CallsAudioOutput {
	private context = new AudioContext();
	private destination = this.context.createMediaStreamDestination();
	private element = new Audio();
	private inputs = new Map<string, { source: MediaStreamAudioSourceNode; gain: GainNode; receiver: HTMLAudioElement }>();

	constructor(private onSuspended: (suspended: boolean) => void) {
		this.element.hidden = true;
		this.element.srcObject = this.destination.stream;
		window.document.body.append(this.element);
		this.context.onstatechange = () => {
			if (this.context.state !== 'closed') onSuspended(this.context.state !== 'running');
		};
		onSuspended(this.context.state !== 'running');
	}

	public add(id: string, track: MediaStreamTrack): void {
		this.remove(id);
		const stream = new MediaStream([track]);
		// Chromium needs a media element to start decoding received WebRTC audio.
		const receiver = new Audio();
		receiver.hidden = true;
		receiver.muted = true;
		receiver.srcObject = stream;
		window.document.body.append(receiver);
		void receiver.play().catch(() => {
			if (this.inputs.get(id)?.receiver === receiver) this.onSuspended(true);
		});
		const source = this.context.createMediaStreamSource(stream);
		const gain = this.context.createGain();
		source.connect(gain);
		gain.connect(this.destination);
		this.inputs.set(id, { source, gain, receiver });
	}

	public remove(id: string): void {
		const input = this.inputs.get(id);
		input?.source.disconnect();
		input?.gain.disconnect();
		if (input != null) {
			input.receiver.pause();
			input.receiver.srcObject = null;
			input.receiver.remove();
		}
		this.inputs.delete(id);
	}

	public setVolume(id: string, volume: number): void {
		const input = this.inputs.get(id);
		if (input != null) input.gain.gain.value = volume;
	}

	public async setSinkId(id: string): Promise<void> {
		await this.element.setSinkId(id);
	}

	public async play(): Promise<void> {
		// Playback must start in the resume button's user gesture.
		await Promise.all([this.context.resume(), this.element.play(), ...[...this.inputs.values()].map(input => input.receiver.play())]);
	}

	public async close(): Promise<void> {
		this.context.onstatechange = null;
		for (const id of this.inputs.keys()) this.remove(id);
		this.element.pause();
		this.element.srcObject = null;
		this.element.remove();
		await this.context.close();
	}
}
