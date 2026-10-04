/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref, shallowRef, watch } from 'vue';
import type { CallsMediaFailure, CallsMediaState, CallsRemotePublication, CallsVideoQuality, CallsVideoSource } from '@/utility/calls-media.js';
import type { MenuItem } from '@/types/menu.js';
import { createCallsRoomConnection } from '@/composables/use-calls-room.js';
import { $i } from '@/i.js';
import { CallsMediaController, captureCallsCamera } from '@/utility/calls-media.js';
import { detectCallsMediaCapabilities, normalizeCallsMediaError } from '@/utility/calls-media-core.js';
import { miLocalStorage } from '@/local-storage.js';
import { i18n } from '@/i18n.js';
import { alert, confirm, popup, popupMenu, toast } from '@/os.js';
import { misskeyApi, misskeyApiKeepalive } from '@/utility/misskey-api.js';
import { callsScreenWindows, clearCallsScreenWindow, clearCallsScreenWindows, showCallsScreenWindow } from '@/utility/calls-screen-window.js';

type CallsRoomConnection = ReturnType<typeof createCallsRoomConnection>;
type CallsReconnectCandidate = { roomId: string; title: string; userId: string; reconnectToken: string; expiresAt: number };
const reconnectStorageKey = 'miux:calls-reconnect' as const;

function safeRemoveReconnectCandidate(): void {
	try {
		miLocalStorage.removeItem(reconnectStorageKey);
	} catch {
		// localStorage can be unavailable in hardened browser modes.
	}
}

function loadReconnectCandidate(): CallsReconnectCandidate | null {
	let value: unknown;
	try {
		value = miLocalStorage.getItemAsJson(reconnectStorageKey);
	} catch {
		safeRemoveReconnectCandidate();
		return null;
	}
	if (typeof value !== 'object' || value == null) return null;
	const candidate = value as Partial<CallsReconnectCandidate>;
	if (typeof candidate.roomId !== 'string' || typeof candidate.title !== 'string' || typeof candidate.userId !== 'string' || typeof candidate.reconnectToken !== 'string' || typeof candidate.expiresAt !== 'number' || !Number.isFinite(candidate.expiresAt) || candidate.userId !== $i?.id || candidate.expiresAt <= Date.now()) {
		safeRemoveReconnectCandidate();
		return null;
	}
	return candidate as CallsReconnectCandidate;
}

const currentRoomId = ref<string | null>(null);
const connection = shallowRef<CallsRoomConnection | null>(null);
const media = shallowRef<CallsMediaController | null>(null);
const mediaState = ref<CallsMediaState>('idle');
const mediaFailure = ref<CallsMediaFailure | null>(null);
const muted = ref(false);
const joining = ref(false);
const replacedRoomId = ref<string | null>(null);
const noiseSuppression = ref(true);
const selectedMicrophone = ref('');
const selectedCamera = ref('');
const cameras = ref<MediaDeviceInfo[]>([]);
const microphones = ref<MediaDeviceInfo[]>([]);
const needsAudioResume = ref(false);
const reconnectCandidate = ref<CallsReconnectCandidate | null>(null);
const reconnectRoomState = ref<'checking' | 'open' | 'unavailable'>('checking');
const reconnectSecondsRemaining = ref(0);
const speakerRequestResult = ref<'rejected' | null>(null);
const remoteAudio = new Map<string, { participantId: string; element: HTMLAudioElement }>();
const participantVolumes = shallowRef(new Map<string, number>());
const localVideos = shallowRef(new Map<CallsVideoSource, MediaStream>());
const remoteVideos = shallowRef(new Map<string, { participantId: string; source: CallsVideoSource; stream: MediaStream }>());
const videoBusy = ref(false);
const videoQuality = ref<Record<CallsVideoSource, CallsVideoQuality>>({ camera: { height: 720, frameRate: 30 }, screen: { height: 1080, frameRate: 30 } });
const canShareScreen = typeof navigator.mediaDevices?.getDisplayMedia === 'function';
const videos = computed(() => [
	...[...localVideos.value].map(([source, stream]) => ({ id: `local-${source}`, participantId: myParticipant.value?.id ?? '', source, stream, local: true })),
	...[...remoteVideos.value].map(([id, video]) => ({ id, ...video, local: false })),
]);

let removeTrackListener: (() => void) | null = null;
let removeRevokedListener: (() => void) | null = null;
let sessionGeneration = 0;
let reconnectExpiryTimer: number | null = null;
let reconnectCountdownTimer: number | null = null;
let reconnectConnection: CallsRoomConnection | null = null;
let stopReconnectRoomWatch: (() => void) | null = null;
let cancelingSpeakerRequest = false;
let cancelCameraPreview: (() => void) | null = null;

function disposeReconnectConnection(): void {
	stopReconnectRoomWatch?.();
	stopReconnectRoomWatch = null;
	reconnectConnection?.dispose();
	reconnectConnection = null;
}

function updateReconnectCountdown(candidate: CallsReconnectCandidate): void {
	reconnectSecondsRemaining.value = Math.max(0, Math.ceil((candidate.expiresAt - Date.now()) / 1000));
}

function setReconnectCandidate(candidate: CallsReconnectCandidate | null): void {
	if (reconnectExpiryTimer != null) window.clearTimeout(reconnectExpiryTimer);
	if (reconnectCountdownTimer != null) window.clearInterval(reconnectCountdownTimer);
	disposeReconnectConnection();
	reconnectCandidate.value = candidate;
	reconnectSecondsRemaining.value = 0;
	reconnectRoomState.value = 'checking';
	if (candidate == null) return;

	updateReconnectCountdown(candidate);
	reconnectExpiryTimer = window.setTimeout(() => dismissReconnectCandidate(), Math.max(0, candidate.expiresAt - Date.now()));
	reconnectCountdownTimer = window.setInterval(() => updateReconnectCountdown(candidate), 1000);
	reconnectConnection = createCallsRoomConnection(candidate.roomId);
	stopReconnectRoomWatch = watch(reconnectConnection.room, room => {
		if (room == null) return;
		if (room.state !== 'open') {
			if (reconnectConnection?.endReason.value === 'host-timeout') toast(i18n.ts._calls.hostLeftRoomEnded);
			dismissReconnectCandidate();
			return;
		}
		reconnectRoomState.value = 'open';
	}, { immediate: true });
	void reconnectConnection.refresh().catch(() => {
		reconnectRoomState.value = 'unavailable';
		dismissReconnectCandidate();
	});
}

setReconnectCandidate(loadReconnectCandidate());

const room = computed(() => connection.value?.room.value ?? null);
const participants = computed(() => connection.value?.participants.value ?? []);
const speakingParticipantIds = computed(() => connection.value?.speakingParticipantIds.value ?? new Set<string>());
const connected = computed(() => connection.value?.connected.value ?? false);
const myParticipant = computed(() => participants.value.find(participant => participant.userId === $i?.id) ?? null);
const isActive = computed(() => currentRoomId.value != null && myParticipant.value != null && room.value?.state === 'open');
const elapsedTime = ref<string | null>(null);

watch(() => isActive.value ? myParticipant.value?.joinedAt ?? null : null, (joinedAt, _, onCleanup) => {
	if (joinedAt == null) {
		elapsedTime.value = null;
		return;
	}
	const startedAt = new Date(joinedAt).getTime();
	const update = () => {
		const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor(seconds / 60) % 60;
		elapsedTime.value = [...(hours > 0 ? [hours] : []), minutes, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
	};
	update();
	const timer = window.setInterval(update, 1000);
	onCleanup(() => window.clearInterval(timer));
}, { immediate: true });

const isHost = computed(() => myParticipant.value?.role === 'host');
const isSpeaker = computed(() => myParticipant.value?.role === 'host' || myParticipant.value?.role === 'speaker');
const controls = computed(() => ({
	role: myParticipant.value?.role ?? 'listener',
	muted: muted.value, cameraOn: localVideos.value.has('camera'), screenOn: localVideos.value.has('screen'),
	status: mediaState.value, busy: videoBusy.value, joining: joining.value, screenSupported: canShareScreen,
	speakerRequestEnabled: room.value?.mode === 'stage',
	speakerRequested: myParticipant.value?.speakerRequestedAt != null,
}));

function disposeConnection(): void {
	removeTrackListener?.();
	removeRevokedListener?.();
	removeTrackListener = null;
	removeRevokedListener = null;
	connection.value?.dispose();
	connection.value = null;
}

function removeRemoteTrack(publicationId: string): void {
	const audio = remoteAudio.get(publicationId)?.element;
	if (audio != null) { audio.pause(); audio.srcObject = null; audio.remove(); }
	remoteAudio.delete(publicationId);
	const next = new Map(remoteVideos.value);
	next.delete(publicationId);
	remoteVideos.value = next;
}

function getParticipantVolume(userId: string): number {
	return participantVolumes.value.get(userId) ?? 100;
}

function applyParticipantVolumes(): void {
	for (const { participantId, element } of remoteAudio.values()) {
		const participant = participants.value.find(item => item.id === participantId);
		element.volume = participant == null ? 1 : getParticipantVolume(participant.userId) / 100;
	}
}

function setParticipantVolume(userId: string, volume: number): void {
	participantVolumes.value = new Map(participantVolumes.value).set(userId, Math.max(0, Math.min(100, volume)));
	applyParticipantVolumes();
}

function addRemoteTrack(track: MediaStreamTrack, publication: CallsRemotePublication): void {
	removeRemoteTrack(publication.id);
	if (track.kind === 'video' && publication.mediaSource !== 'microphone') {
		remoteVideos.value = new Map(remoteVideos.value).set(publication.id, { participantId: publication.participantId, source: publication.mediaSource, stream: new MediaStream([track]) });
		track.addEventListener('ended', () => removeRemoteTrack(publication.id), { once: true });
		return;
	}
	if (track.kind !== 'audio') return;
	const audio = new Audio();
	audio.autoplay = true;
	audio.hidden = true;
	audio.srcObject = new MediaStream([track]);
	remoteAudio.set(publication.id, { participantId: publication.participantId, element: audio });
	applyParticipantVolumes();
	window.document.body.append(audio);
	void audio.play().catch(() => { needsAudioResume.value = true; });
	track.addEventListener('ended', () => {
		removeRemoteTrack(publication.id);
	}, { once: true });
}

async function loadMicrophones(): Promise<void> {
	if (navigator.mediaDevices?.enumerateDevices == null) return;
	const devices = await navigator.mediaDevices.enumerateDevices();
	microphones.value = devices.filter(device => device.kind === 'audioinput');
	cameras.value = devices.filter(device => device.kind === 'videoinput');
	if (!microphones.value.some(device => device.deviceId === selectedMicrophone.value)) {
		selectedMicrophone.value = microphones.value[0]?.deviceId ?? '';
	}
	if (!cameras.value.some(device => device.deviceId === selectedCamera.value)) {
		selectedCamera.value = cameras.value[0]?.deviceId ?? '';
	}
}

async function prepareMicrophones(): Promise<void> {
	await loadMicrophones();
}

async function connectMedia(generation: number, previousConnection?: { connectionId: string; generation: number }, replaceExisting = false): Promise<void> {
	const participant = myParticipant.value;
	const targetRoomId = currentRoomId.value;
	if (participant == null || targetRoomId == null) return;
	await media.value?.close().catch(() => undefined);
	if (generation !== sessionGeneration) return;
	const controller = new CallsMediaController(
		targetRoomId,
		participant.role,
		(state, failure) => {
			if (generation !== sessionGeneration || media.value !== controller) return;
			mediaState.value = state;
			mediaFailure.value = failure;
		},
		(track, publication) => { if (generation === sessionGeneration && media.value === controller) addRemoteTrack(track, publication); },
		(_stats, speaking) => connection.value?.setSpeaking(speaking),
		previousConnection,
		replaceExisting,
		{
			localTrack(source, track) {
				if (generation !== sessionGeneration || media.value !== controller) return;
				const next = new Map(localVideos.value);
				if (track == null) next.delete(source);
				else next.set(source, new MediaStream([track]));
				localVideos.value = next;
			},
			remoteRemoved: removeRemoteTrack,
			error: error => {
				console.error('[Calls] Video connection failed', error);
				void alert({ type: 'error', text: i18n.ts._calls.videoFailed });
			},
		},
	);
	media.value = controller;
	controller.setMuted(muted.value);
	await controller.setNoiseSuppression(noiseSuppression.value);
	await controller.connect(selectedMicrophone.value || undefined);
	if (generation !== sessionGeneration || media.value !== controller) {
		await controller.close().catch(() => undefined);
		return;
	}
	if (participant.role !== 'listener' && controller.localTrack === null) {
		muted.value = true;
		connection.value?.setMuted(true);
	}
	controller.setMuted(muted.value);
	if (participant.role !== 'listener') await loadMicrophones();
}

async function clearSession(): Promise<void> {
	cancelCameraPreview?.();
	clearCallsScreenWindows();
	sessionGeneration += 1;
	const controller = media.value;
	media.value = null;
	disposeConnection();
	currentRoomId.value = null;
	mediaState.value = 'idle';
	mediaFailure.value = null;
	muted.value = false;
	videoBusy.value = false;
	selectedMicrophone.value = '';
	selectedCamera.value = '';
	microphones.value = [];
	cameras.value = [];
	for (const id of remoteAudio.keys()) removeRemoteTrack(id);
	remoteAudio.clear();
	participantVolumes.value = new Map();
	localVideos.value = new Map();
	remoteVideos.value = new Map();
	needsAudioResume.value = false;
	await controller?.close().catch(() => undefined);
}

function attachConnection(roomId: string): CallsRoomConnection {
	disposeConnection();
	const next = createCallsRoomConnection(roomId);
	connection.value = next;
	removeTrackListener = next.onTrackChange(() => { void media.value?.reconcile(); });
	removeRevokedListener = next.onRevoked(event => {
		const identity = media.value?.connectionIdentity;
		if (event.connectionId != null && (identity?.connectionId !== event.connectionId || identity.generation !== event.generation)) return;
		const reason = event.reason;
		if (reason === 'replaced') {
			replacedRoomId.value = roomId;
			setReconnectCandidate(null);
			safeRemoveReconnectCandidate();
			void clearSession();
			toast(i18n.ts._calls.connectedOnAnotherDevice);
			return;
		}
		if (reason === 'stale-generation') void reconnectMedia();
		else if (reason === 'moderation' && myParticipant.value?.role === 'listener' && room.value?.state === 'open') void reconnectMedia();
		else void clearSession();
	});
	return next;
}

async function join(roomId: string, alreadyParticipant: boolean, reconnectToken?: string, startMuted = false): Promise<void> {
	if (joining.value) return;
	const capabilities = detectCallsMediaCapabilities();
	if (!capabilities.secureContext || !capabilities.peerConnection || !capabilities.transceiver) {
		mediaState.value = 'failed';
		mediaFailure.value = 'unsupported';
		throw new Error('Calls is not supported by this browser');
	}

	joining.value = true;
	let joinedNow = false;
	let generation = sessionGeneration;
	try {
		if (currentRoomId.value != null && currentRoomId.value !== roomId) await leave();
		generation = ++sessionGeneration;
		currentRoomId.value = roomId;
		const next = attachConnection(roomId);
		await next.refresh();
		if (!alreadyParticipant) {
			await misskeyApi('calls/rooms/join', { roomId, reconnectToken });
			joinedNow = true;
			await next.refresh();
		}
		if (myParticipant.value == null) throw new Error('Calls participant state was not created');
		muted.value = myParticipant.value.isMuted;
		if (startMuted && myParticipant.value.role === 'host' && !muted.value) {
			muted.value = true;
		}
		try {
			await connectMedia(generation);
		} catch (error) {
			if (typeof error !== 'object' || error == null || !('code' in error) || error.code !== 'CALLS_CONNECTION_EXISTS') throw error;
			mediaFailure.value = null;
			const { canceled } = await confirm({ type: 'warning', text: i18n.ts._calls.switchDeviceConfirm });
			if (generation !== sessionGeneration) return;
			if (canceled) {
				await clearSession();
				return;
			}
			await connectMedia(generation, undefined, true);
		}
		if (generation !== sessionGeneration) return;
		replacedRoomId.value = null;
		if (startMuted && myParticipant.value?.role === 'host') next.setMuted(true);
		setReconnectCandidate(null);
		safeRemoveReconnectCandidate();
	} catch (error) {
		if (generation !== sessionGeneration) return;
		if (joinedNow) await misskeyApi('calls/rooms/leave', { roomId }).catch(() => undefined);
		await clearSession();
		throw error;
	} finally {
		joining.value = false;
	}
}

async function reconnectMedia(): Promise<void> {
	if (!isActive.value) return;
	cancelCameraPreview?.();
	const generation = ++sessionGeneration;
	const controller = media.value;
	const identity = controller?.connectionIdentity ?? undefined;
	media.value = null;
	localVideos.value = new Map();
	for (const id of remoteAudio.keys()) removeRemoteTrack(id);
	remoteVideos.value = new Map();
	needsAudioResume.value = false;
	videoBusy.value = false;
	await controller?.close().catch(() => undefined);
	if (generation !== sessionGeneration) return;
	await connectMedia(generation, identity).catch(error => {
		console.error('[Calls] Media reconnection failed', error);
	});
}

async function leave(): Promise<void> {
	const targetRoom = room.value;
	const targetRoomId = currentRoomId.value;
	const targetIsHost = isHost.value;
	const identity = media.value?.connectionIdentity;
	if (targetRoomId == null) return;
	setReconnectCandidate(null);
	safeRemoveReconnectCandidate();
	void clearSession();
	const request = targetIsHost && targetRoom?.state === 'open'
		? misskeyApi('calls/rooms/end', { roomId: targetRoomId, expectedRevision: targetRoom.revision, ...identity })
		: identity != null
			? misskeyApi('calls/rooms/leave', { roomId: targetRoomId, ...identity })
			: null;
	void request?.catch(error => {
		console.error('[Calls] Disconnect request failed', error);
		void alert({ type: 'error', text: i18n.ts.somethingHappened });
	});
}

async function resumeRecentRoom(): Promise<void> {
	const candidate = reconnectCandidate.value;
	if (candidate == null || reconnectRoomState.value !== 'open') return;
	if (candidate.expiresAt <= Date.now()) {
		dismissReconnectCandidate();
		return;
	}
	await join(candidate.roomId, false, candidate.reconnectToken);
}

function dismissReconnectCandidate(): void {
	setReconnectCandidate(null);
	safeRemoveReconnectCandidate();
}

function onPageHide(event: PageTransitionEvent): void {
	if (event.persisted) return;
	const targetRoomId = currentRoomId.value;
	const targetRoom = room.value;
	const identity = media.value?.connectionIdentity;
	if (targetRoomId == null || targetRoom?.state !== 'open' || identity == null || $i == null) return;
	const candidate = { roomId: targetRoomId, title: targetRoom.title, userId: $i.id, reconnectToken: crypto.randomUUID(), expiresAt: Date.now() + 90_000 };
	misskeyApiKeepalive('calls/rooms/leave', { roomId: targetRoomId, reconnectToken: candidate.reconnectToken, connectionId: identity.connectionId, generation: identity.generation });
	try {
		miLocalStorage.setItemAsJson(reconnectStorageKey, candidate);
	} catch {
		// The transient leave must still be sent when storage is unavailable.
	}
}

function onReconnectStorage(event: StorageEvent): void {
	if (event.key === reconnectStorageKey) setReconnectCandidate(loadReconnectCandidate());
}

async function toggleMute(): Promise<void> {
	if (!isSpeaker.value) return;
	if (muted.value && media.value?.localTrack === null) {
		try {
			await media.value.switchMicrophone(selectedMicrophone.value || undefined);
		} catch (error) {
			console.error('[Calls] Microphone unavailable', error);
			await alert({ type: 'error', text: i18n.ts._calls.mediaFailed });
			return;
		}
	}
	muted.value = !muted.value;
	media.value?.setMuted(muted.value);
	connection.value?.setMuted(muted.value);
}

async function requestSpeaker(): Promise<void> {
	if (currentRoomId.value == null || room.value?.mode !== 'stage' || myParticipant.value?.role !== 'listener') return;
	speakerRequestResult.value = null;
	await misskeyApi('calls/rooms/request-speaker', { roomId: currentRoomId.value });
	await connection.value?.refresh();
}

async function cancelSpeakerRequest(): Promise<void> {
	if (currentRoomId.value == null || myParticipant.value?.speakerRequestedAt == null) return;
	cancelingSpeakerRequest = true;
	try {
		await misskeyApi('calls/rooms/cancel-speaker-request', { roomId: currentRoomId.value });
		await connection.value?.refresh();
	} finally {
		window.setTimeout(() => { cancelingSpeakerRequest = false; });
	}
}

async function switchMicrophone(deviceId: string): Promise<void> {
	selectedMicrophone.value = deviceId;
	await media.value?.switchMicrophone(deviceId);
}

async function toggleVideo(source: CallsVideoSource): Promise<void> {
	const controller = media.value;
	if (!isSpeaker.value || joining.value || videoBusy.value || mediaState.value !== 'connected' || controller == null) return;
	videoBusy.value = true;
	try {
		if (localVideos.value.has(source)) await controller.stopVideo(source);
		else if (source === 'camera') {
			const stream = await captureCallsCamera(selectedCamera.value || undefined, videoQuality.value.camera);
			let published = false;
			try {
				const { default: PreviewDialog } = await import('@/components/MkCallsCameraPreviewDialog.vue');
				if (media.value !== controller) return;
				const confirmed = await new Promise<boolean>(resolve => {
					const { dispose } = popup(PreviewDialog, { stream }, { done: resolve, closed() { dispose(); resolve(false); } });
					cancelCameraPreview = () => { stream.getTracks().forEach(track => track.stop()); dispose(); resolve(false); };
				});
				if (!confirmed || media.value !== controller) return;
				await controller.startVideo('camera', selectedCamera.value || undefined, videoQuality.value.camera, stream);
				published = true;
			} finally {
				cancelCameraPreview = null;
				if (!published) stream.getTracks().forEach(track => track.stop());
			}
		} else await controller.startVideo(source, undefined, videoQuality.value[source]);
		await loadMicrophones();
	} catch (error) {
		console.error(`[Calls] ${source} start/stop failed`, error);
		if (controller !== media.value) return;
		if (source === 'screen' && error instanceof DOMException && error.name === 'NotAllowedError') return;
		const failure = error instanceof DOMException ? normalizeCallsMediaError(error) : 'negotiation-failed';
		await alert({ type: 'error', text: failure === 'permission-denied' ? i18n.ts._calls.videoPermissionDenied : failure === 'device-not-found' ? i18n.ts._calls.cameraNotFound : i18n.ts._calls.videoFailed });
	} finally {
		if (media.value === controller) videoBusy.value = false;
	}
}

async function openDeviceMenu(kind: 'microphone' | 'camera', event: MouseEvent): Promise<void> {
	if (joining.value || videoBusy.value || !isSpeaker.value) return;
	const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
	await loadMicrophones();
	const devices = kind === 'microphone' ? microphones.value : cameras.value;
	const selected = kind === 'microphone' ? selectedMicrophone : selectedCamera;
	popupMenu([
		{ type: 'label', text: kind === 'microphone' ? i18n.ts._calls.selectMicrophone : i18n.ts._calls.selectCamera },
		...devices.map(device => ({
			type: 'radioOption' as const,
			text: device.label || (kind === 'microphone' ? i18n.ts._calls.microphone : i18n.ts._calls.camera),
			active: device.deviceId === selected.value,
			async action() {
				if (joining.value || videoBusy.value || !isSpeaker.value) return;
				try {
					if (kind === 'microphone') await switchMicrophone(device.deviceId);
					else {
						const controller = media.value;
						if (controller == null) return;
						videoBusy.value = true;
						try {
							await controller.switchCamera(device.deviceId, videoQuality.value.camera);
							selectedCamera.value = device.deviceId;
						} finally {
							if (media.value === controller) videoBusy.value = false;
						}
					}
				} catch (error) {
					console.error(`[Calls] ${kind} device switch failed`, error);
					await alert({ type: 'error', text: kind === 'camera' ? i18n.ts._calls.videoFailed : i18n.ts._calls.mediaFailed });
				}
			},
		})),
		...(kind === 'camera' ? [null, ...videoQualityMenu('camera')] : [null, { type: 'switch' as const, text: i18n.ts._calls.noiseSuppression, ref: computed({ get: () => noiseSuppression.value, set: value => { void setNoiseSuppression(value); } }) }]),
	], target);
}

async function setNoiseSuppression(enabled: boolean): Promise<void> {
	try {
		await media.value?.setNoiseSuppression(enabled);
		noiseSuppression.value = enabled;
	} catch (error) {
		console.error('[Calls] Noise suppression change failed', error);
		await alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function setVideoQuality(source: CallsVideoSource, quality: CallsVideoQuality): Promise<void> {
	if (joining.value || videoBusy.value || !isSpeaker.value) return;
	videoBusy.value = true;
	try {
		await media.value?.setVideoQuality(source, quality);
		videoQuality.value[source] = quality;
	} catch (error) {
		console.error(`[Calls] ${source} quality change failed`, error);
		await alert({ type: 'error', text: i18n.ts._calls.videoFailed });
	} finally {
		videoBusy.value = false;
	}
}

function videoQualityMenu(source: CallsVideoSource): MenuItem[] {
	const quality = videoQuality.value[source];
	const resolutionLabel = (height: CallsVideoQuality['height']) => height === 'source' ? i18n.ts._calls.videoSourceQuality : i18n.tsx._calls.videoResolutionValue({ height });
	return [
		{ type: 'parent', text: `${i18n.ts._calls.videoResolution} · ${resolutionLabel(quality.height)}`, children: ([480, 720, 1080, 1440, 2160, 'source'] as const).map(height => ({
			type: 'radioOption', text: resolutionLabel(height), active: quality.height === height,
			action: () => setVideoQuality(source, { ...videoQuality.value[source], height }),
		})) },
		{ type: 'parent', text: `${i18n.ts._calls.videoFrameRate} · ${i18n.tsx._calls.videoFrameRateValue({ fps: quality.frameRate })}`, children: ([15, 30, 60, 90, 120, 144] as const).map(frameRate => ({
			type: 'radioOption', text: i18n.tsx._calls.videoFrameRateValue({ fps: frameRate }), active: quality.frameRate === frameRate,
			action: () => setVideoQuality(source, { ...videoQuality.value[source], frameRate }),
		})) },
	];
}

function openScreenSettings(event: MouseEvent): void {
	if (joining.value || videoBusy.value || !isSpeaker.value) return;
	popupMenu(videoQualityMenu('screen'), event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined);
}

async function resumeAudio(): Promise<void> {
	await Promise.all([...remoteAudio.values()].map(({ element }) => element.play()));
	needsAudioResume.value = false;
}

watch(videos, current => {
	for (const stream of callsScreenWindows.keys()) {
		if (!current.some(video => video.stream === stream)) clearCallsScreenWindow(stream);
	}
});

watch(participants, applyParticipantVolumes);

watch(() => participants.value.filter(participant => participant.role !== 'listener').map(participant => participant.id).join(','), () => {
	void media.value?.reconcile().catch(error => {
		console.error('[Calls] Media reconciliation failed', error);
		toast(i18n.ts._calls.mediaFailed);
	});
});

watch(() => myParticipant.value?.isMuted, value => {
	if (value != null) {
		muted.value = value;
		media.value?.setMuted(value);
	}
});

watch(() => myParticipant.value?.role, (role, previousRole) => {
	if (previousRole === 'listener' && role === 'speaker' && room.value?.state === 'open') void reconnectMedia();
});

watch(() => myParticipant.value?.speakerRequestedAt, (requestedAt, previousRequestedAt) => {
	if (!cancelingSpeakerRequest && previousRequestedAt != null && requestedAt == null && myParticipant.value?.role === 'listener') {
		speakerRequestResult.value = 'rejected';
		window.setTimeout(() => { speakerRequestResult.value = null; }, 5000);
	}
});

watch(() => room.value?.state, state => {
	if (state === 'ended' || state === 'cancelled') {
		if (connection.value?.endReason.value === 'host-timeout') toast(i18n.ts._calls.hostLeftRoomEnded);
		setReconnectCandidate(null);
		safeRemoveReconnectCandidate();
		void clearSession();
	}
});

window.addEventListener('pagehide', onPageHide);
window.addEventListener('storage', onReconnectStorage);

window.setInterval(() => {
	const identity = media.value?.connectionIdentity;
	if (identity != null) connection.value?.heartbeat(identity.connectionId, identity.generation);
}, 30_000);

export function useCallsSession() {
	return {
		currentRoomId,
		room,
		participants,
		speakingParticipantIds,
		connected,
		myParticipant,
		isActive,
		elapsedTime,
		isHost,
		isSpeaker,
		joining,
		replacedRoomId,
		mediaState,
		mediaFailure,
		muted,
		controls,
		openDeviceMenu,
		openScreenSettings,
		videoQuality,
		noiseSuppression,
		localVideos,
		videos,
		screenWindows: callsScreenWindows,
		showScreenWindow: showCallsScreenWindow,
		videoBusy,
		canShareScreen,
		toggleVideo,
		selectedMicrophone,
		microphones,
		needsAudioResume,
		reconnectCandidate,
		reconnectRoomState,
		reconnectSecondsRemaining,
		speakerRequestResult,
		join,
		leave,
		toggleMute,
		requestSpeaker,
		cancelSpeakerRequest,
		switchMicrophone,
		prepareMicrophones,
		resumeAudio,
		getParticipantVolume,
		setParticipantVolume,
		resumeRecentRoom,
		dismissReconnectCandidate,
		refresh() { return connection.value?.refresh() ?? Promise.resolve(); },
	};
}
