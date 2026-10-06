/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref, shallowRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import type { CallsNoiseSuppressionMode } from '@/utility/calls-noise-suppression.js';
import type { CallsMediaFailure, CallsMediaState, CallsRemotePublication, CallsVideoQuality, CallsVideoSource } from '@/utility/calls-media.js';
import type { MenuItem } from '@/types/menu.js';
import { prefer } from '@/preferences.js';
import { retainCallsRoomConnection } from '@/composables/use-calls-room.js';
import { $i } from '@/i.js';
import { CallsMediaController, captureCallsCamera } from '@/utility/calls-media.js';
import { detectCallsMediaCapabilities, normalizeCallsMediaError } from '@/utility/calls-media-core.js';
import { miLocalStorage } from '@/local-storage.js';
import { i18n } from '@/i18n.js';
import { alert, confirm, popup, popupMenu, toast } from '@/os.js';
import { misskeyApi, misskeyApiKeepalive } from '@/utility/misskey-api.js';
import { playMisskeySfx } from '@/utility/sound.js';
import { callsScreenWindows, clearCallsScreenWindow, clearCallsScreenWindows, showCallsScreenWindow } from '@/utility/calls-screen-window.js';

type CallsRoomConnection = ReturnType<typeof retainCallsRoomConnection>;
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
const mediaReady = ref(false);
const sessionParticipant = shallowRef<Misskey.entities.CallsParticipant | null>(null);
const muted = ref(false);
const joining = ref(false);
const replacedRoomId = ref<string | null>(null);
const autoGainControl = ref(prefer.s.callsAutoGainControl);
const noiseSuppression = ref<CallsNoiseSuppressionMode>(prefer.s.callsNoiseSuppression);
const inputSensitivity = ref(prefer.s.callsInputSensitivity);
const inputLevel = ref(-100);
const inputTransmitting = ref(false);
const audioSettingsBusy = ref(false);
const selectedMicrophone = ref(prefer.s.callsMicrophone);
const selectedCamera = ref(prefer.s.callsCamera);
const selectedOutputDevice = ref(prefer.s.callsOutputDevice);
const inputVolume = ref(prefer.s.callsInputVolume);
const outputVolume = ref(prefer.s.callsOutputVolume);
const outputDevices = shallowRef<MediaDeviceInfo[]>([]);
const supportsOutputDevice = typeof HTMLMediaElement.prototype.setSinkId === 'function';
const cameras = ref<MediaDeviceInfo[]>([]);
const microphones = ref<MediaDeviceInfo[]>([]);
const needsAudioResume = ref(false);
const reconnectCandidate = ref<CallsReconnectCandidate | null>(null);
const reconnectRoomState = ref<'checking' | 'open' | 'unavailable'>('checking');
const reconnectSecondsRemaining = ref(0);
const speakerRequestResult = ref<'rejected' | null>(null);
let volumeAudioContext: AudioContext | null = null;
const remoteAudio = new Map<string, { participantId: string; element: HTMLAudioElement; playback: Promise<void>; screenPublicationId?: string; source?: MediaStreamAudioSourceNode; gain?: GainNode; output?: MediaStreamAudioDestinationNode }>();
const participantVolumes = shallowRef(new Map<string, number>());
const localVideos = shallowRef(new Map<string, MediaStream>());
const screenVolumes = shallowRef(new Map<string, number>());
const screenAudioIds = shallowRef(new Set<string>());
const remoteVideos = shallowRef(new Map<string, { participantId: string; source: CallsVideoSource; stream: MediaStream }>());
const videoBusy = ref(false);
const videoQuality = ref<Record<CallsVideoSource, CallsVideoQuality>>({ camera: { height: 720, frameRate: 30 }, screen: { height: 1080, frameRate: 30 } });
const canShareScreen = typeof navigator.mediaDevices?.getDisplayMedia === 'function';
const videos = computed(() => [
	...[...localVideos.value].map(([id, stream]) => ({ id: `local-${id}`, participantId: myParticipant.value?.id ?? '', source: id === 'camera' ? 'camera' as const : 'screen' as const, stream, local: true })),
	...[...remoteVideos.value].map(([id, video]) => ({ id, ...video, local: false })),
]);

let removeTrackListener: (() => void) | null = null;
let removeRevokedListener: (() => void) | null = null;
let sessionGeneration = 0;
let sessionSoundActive = false;
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
	reconnectConnection = retainCallsRoomConnection(candidate.roomId);
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
const myParticipant = computed(() => participants.value.find(participant => participant.userId === $i?.id) ?? sessionParticipant.value);

watch(participants, current => {
	const own = current.find(participant => participant.userId === $i?.id);
	if (own != null) sessionParticipant.value = own;
});
const isActive = computed(() => currentRoomId.value != null && myParticipant.value != null && room.value?.state === 'open');

watch(isActive, (active, _, onCleanup) => {
	if (!active) return;
	const onBeforeUnload = (event: BeforeUnloadEvent) => {
		event.preventDefault();
		event.returnValue = '';
	};
	window.addEventListener('beforeunload', onBeforeUnload);
	onCleanup(() => window.removeEventListener('beforeunload', onBeforeUnload));
}, { flush: 'sync' });

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
const canSpeak = computed(() => $i?.policies.canJoinCalls === true && $i.policies.canSpeakInCalls);
const isSpeaker = computed(() => myParticipant.value?.role === 'host' || myParticipant.value?.role === 'speaker');
const canPublishVideo = computed(() => isSpeaker.value && $i?.policies.canJoinCalls === true && $i.policies.canPublishCallsVideo === true);
const canShareScreenMedia = computed(() => isSpeaker.value && $i?.policies.canJoinCalls === true && $i.policies.canShareCallsScreen === true);
const controls = computed(() => ({
	role: myParticipant.value?.role ?? 'listener',
	canSpeak: isSpeaker.value && canSpeak.value, canPublishVideo: canPublishVideo.value, canShareScreen: canShareScreenMedia.value,
	muted: muted.value, cameraOn: localVideos.value.has('camera'), screenOn: [...localVideos.value.keys()].some(id => id !== 'camera'),
	status: mediaState.value, busy: videoBusy.value, joining: joining.value, screenSupported: canShareScreen,
	speakerRequestEnabled: canSpeak.value && room.value?.mode === 'stage',
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
	const item = remoteAudio.get(publicationId);
	item?.source?.disconnect();
	item?.gain?.disconnect();
	item?.output?.stream.getTracks().forEach(track => track.stop());
	const audio = item?.element;
	if (audio != null) { audio.pause(); audio.srcObject = null; audio.remove(); }
	remoteAudio.delete(publicationId);
	screenAudioIds.value = new Set([...remoteAudio.values()].flatMap(item => item.screenPublicationId == null ? [] : [item.screenPublicationId]));
	const next = new Map(remoteVideos.value);
	next.delete(publicationId);
	remoteVideos.value = next;
}

function getParticipantVolume(userId: string): number {
	return participantVolumes.value.get(userId) ?? 100;
}

function applyParticipantVolumes(): void {
	for (const item of remoteAudio.values()) {
		const participant = participants.value.find(entry => entry.id === item.participantId);
		const volume = item.screenPublicationId != null ? getScreenVolume(item.screenPublicationId) : participant == null ? 100 : getParticipantVolume(participant.userId);
		if (item.screenPublicationId == null && volume !== 100 && item.gain == null) {
			volumeAudioContext ??= new AudioContext();
			item.source = volumeAudioContext.createMediaStreamSource(item.element.srcObject as MediaStream);
			item.gain = volumeAudioContext.createGain();
			item.output = volumeAudioContext.createMediaStreamDestination();
			item.source.connect(item.gain);
			item.gain.connect(item.output);
			item.element.srcObject = item.output.stream;
			void item.element.play().catch(() => { needsAudioResume.value = true; });
		}
		const effectiveVolume = (outputVolume.value / 100) * (volume / 100);
		item.element.volume = item.gain != null ? 1 : effectiveVolume;
		if (item.gain != null) item.gain.gain.value = effectiveVolume;
	}
}

function getScreenVolume(publicationId: string): number {
	return screenVolumes.value.get(publicationId) ?? 100;
}

function setScreenVolume(publicationId: string, volume: number): void {
	screenVolumes.value = new Map(screenVolumes.value).set(publicationId, Math.max(0, Math.min(100, volume)));
	applyParticipantVolumes();
}

function setParticipantVolume(userId: string, volume: number): void {
	participantVolumes.value = new Map(participantVolumes.value).set(userId, Math.max(0, Math.min(200, volume)));
	applyParticipantVolumes();
	void volumeAudioContext?.resume().catch(() => { needsAudioResume.value = true; });
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
	audio.hidden = true;
	audio.srcObject = new MediaStream([track]);
	const item = { participantId: publication.participantId, element: audio, playback: Promise.resolve(), screenPublicationId: publication.screenPublicationId };
	remoteAudio.set(publication.id, item);
	if (publication.screenPublicationId != null) screenAudioIds.value = new Set(screenAudioIds.value).add(publication.screenPublicationId);
	applyParticipantVolumes();
	item.playback = (async () => {
		if (supportsOutputDevice) await audio.setSinkId(selectedOutputDevice.value);
		await Promise.all([audio.play(), volumeAudioContext?.resume()]);
	})().catch(error => { console.warn('[Calls] Audio playback failed', error); needsAudioResume.value = true; });
	window.document.body.append(audio);
	track.addEventListener('ended', () => {
		removeRemoteTrack(publication.id);
	}, { once: true });
}

async function loadMicrophones(): Promise<void> {
	if (navigator.mediaDevices?.enumerateDevices == null) return;
	const devices = await navigator.mediaDevices.enumerateDevices();
	microphones.value = devices.filter(device => device.kind === 'audioinput');
	cameras.value = devices.filter(device => device.kind === 'videoinput');
	outputDevices.value = devices.filter(device => device.kind === 'audiooutput');
	for (const [available, selected] of [[microphones.value, selectedMicrophone], [cameras.value, selectedCamera], [outputDevices.value, selectedOutputDevice]] as const) {
		if (available.some(device => device.deviceId !== '') && !available.some(device => device.deviceId === selected.value)) selected.value = '';
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
	mediaReady.value = false;
	const controller = new CallsMediaController(
		targetRoomId,
		participant.role,
		(state, failure) => {
			if (generation !== sessionGeneration || media.value !== controller) return;
			mediaState.value = state;
			mediaFailure.value = failure;
			if (state !== 'connected') mediaReady.value = false;
		},
		(track, publication) => { if (generation === sessionGeneration && media.value === controller) addRemoteTrack(track, publication); },
		(_stats, speaking) => connection.value?.setSpeaking(speaking),
		previousConnection,
		replaceExisting,
		{
			ready() {
				if (generation !== sessionGeneration || media.value !== controller) return;
				mediaReady.value = true;
				void announceMediaReady(controller, generation);
			},
			noiseSuppressionChanged(mode) {
				if (generation === sessionGeneration && media.value === controller) noiseSuppression.value = mode;
			},
			inputLevel(level, transmitting) {
				if (generation === sessionGeneration && media.value === controller) { inputLevel.value = level; inputTransmitting.value = transmitting; }
			},
			localTrack(_source, track, id) {
				if (generation !== sessionGeneration || media.value !== controller) return;
				const next = new Map(localVideos.value);
				if (track == null) next.delete(id);
				else next.set(id, new MediaStream([track]));
				localVideos.value = next;
			},
			remoteRemoved: removeRemoteTrack,
			error: error => {
				console.error('[Calls] Video connection failed', error);
				void alert({ type: 'error', text: i18n.ts._calls.videoFailed });
			},
		},
		canSpeak.value,
	);
	media.value = controller;
	controller.setMuted(muted.value);
	await controller.setAutoGainControl(autoGainControl.value);
	await controller.setNoiseSuppression(noiseSuppression.value);
	controller.setInputSensitivity(inputSensitivity.value);
	controller.setInputVolume(inputVolume.value);
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
	if (sessionSoundActive) playMisskeySfx('callsLeave');
	sessionSoundActive = false;
	cancelCameraPreview?.();
	clearCallsScreenWindows();
	sessionGeneration += 1;
	screenVolumes.value = new Map();
	screenAudioIds.value = new Set();
	const controller = media.value;
	media.value = null;
	mediaReady.value = false;
	sessionParticipant.value = null;
	disposeConnection();
	currentRoomId.value = null;
	mediaState.value = 'idle';
	inputLevel.value = -100;
	inputTransmitting.value = false;
	mediaFailure.value = null;
	muted.value = false;
	videoBusy.value = false;
	for (const id of remoteAudio.keys()) removeRemoteTrack(id);
	remoteAudio.clear();
	const previousVolumeContext = volumeAudioContext;
	volumeAudioContext = null;
	participantVolumes.value = new Map();
	localVideos.value = new Map();
	remoteVideos.value = new Map();
	needsAudioResume.value = false;
	const closingVolumeContext = previousVolumeContext?.close();
	await controller?.close().catch(() => undefined);
	await closingVolumeContext;
}

function attachConnection(roomId: string): CallsRoomConnection {
	disposeConnection();
	const next = retainCallsRoomConnection(roomId);
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
		const participant = await misskeyApi('calls/rooms/join', { roomId, reconnectToken });
		joinedNow = !alreadyParticipant;
		sessionParticipant.value = participant;
		next.identifyParticipant(participant.id);
		await next.refresh();
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
		if (!sessionSoundActive) playMisskeySfx('callsJoin');
		sessionSoundActive = true;
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
	if (!isSpeaker.value || !canSpeak.value) return;
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
	if (!canSpeak.value || currentRoomId.value == null || room.value?.mode !== 'stage' || myParticipant.value?.role !== 'listener') return;
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
	if (isSpeaker.value && media.value != null) await media.value.switchMicrophone(deviceId || undefined);
	selectedMicrophone.value = deviceId;
	prefer.commit('callsMicrophone', deviceId);
}

async function toggleVideo(source: CallsVideoSource, addScreen = false, videoId?: string): Promise<void> {
	const controller = media.value;
	if (!isSpeaker.value || joining.value || videoBusy.value || mediaState.value !== 'connected' || controller == null) return;
	const active = source === 'camera' ? localVideos.value.has('camera') : [...localVideos.value.keys()].some(id => id !== 'camera');
	if ((addScreen || !active) && !(source === 'camera' ? canPublishVideo.value : canShareScreenMedia.value)) return;
	videoBusy.value = true;
	try {
		if (!addScreen && active) await controller.stopVideo(source, videoId);
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
	if (joining.value || videoBusy.value || !isSpeaker.value || !(kind === 'camera' ? canPublishVideo.value : canSpeak.value)) return;
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
							prefer.commit('callsCamera', device.deviceId);
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
		...(kind === 'camera' ? [null, ...videoQualityMenu('camera')] : [null, { text: i18n.ts._calls.audioSettings, icon: 'ti ti-adjustments', action: () => openAudioSettings() }]),
	], target);
}

async function openAudioSettings(initialPage: 'general' | 'statistics' = 'general'): Promise<void> {
	const { default: MkCallsSettings } = await import('@/components/MkCallsSettings.vue');
	const { dispose } = popup(MkCallsSettings, {
		initialPage,
		getInfo: () => media.value?.getConnectionInfo() ?? Promise.resolve(null),
		getSettings: getAudioSettings,
		setDevice,
		refreshDevices,
		setInputVolume,
		setOutputVolume,
		setAutoGainControl,
		setNoiseSuppression,
		setInputSensitivity,
	}, { closed: () => dispose() });
}

function getAudioSettings() {
	return { autoGainControl: autoGainControl.value, noiseSuppression: noiseSuppression.value, inputSensitivity: inputSensitivity.value, inputLevel: inputLevel.value, transmitting: inputTransmitting.value && !muted.value, busy: audioSettingsBusy.value || videoBusy.value || joining.value, microphones: microphones.value, cameras: cameras.value, outputDevices: outputDevices.value, microphoneId: selectedMicrophone.value, cameraId: selectedCamera.value, outputDeviceId: selectedOutputDevice.value, inputVolume: inputVolume.value, outputVolume: outputVolume.value, supportsOutputDevice };
}

async function refreshDevices(): Promise<void> {
	if (audioSettingsBusy.value) return;
	audioSettingsBusy.value = true;
	try {
		await loadMicrophones();
		const stream = await navigator.mediaDevices.getUserMedia({ audio: microphones.value.length > 0, video: cameras.value.length > 0 });
		stream.getTracks().forEach(track => track.stop());
		await loadMicrophones();
	} catch (error) {
		console.error('[Calls] Device discovery failed', error);
		await alert({ type: 'error', text: i18n.ts._calls.mediaFailed });
	} finally {
		audioSettingsBusy.value = false;
	}
}

async function setDevice(kind: 'microphone' | 'camera' | 'output', deviceId: string): Promise<void> {
	if (audioSettingsBusy.value || joining.value || videoBusy.value) return;
	audioSettingsBusy.value = true;
	try {
		if (kind === 'microphone') await switchMicrophone(deviceId);
		else if (kind === 'camera') {
			if (localVideos.value.has('camera')) await media.value?.switchCamera(deviceId || undefined, videoQuality.value.camera);
			selectedCamera.value = deviceId;
			prefer.commit('callsCamera', deviceId);
		} else {
			if (!supportsOutputDevice) throw new Error('Audio output selection is unavailable');
			await Promise.all([...remoteAudio.values()].map(({ element }) => element.setSinkId(deviceId)));
			selectedOutputDevice.value = deviceId;
			prefer.commit('callsOutputDevice', deviceId);
		}
	} catch (error) {
		console.error('[Calls] Device change failed', error);
		await alert({ type: 'error', text: i18n.ts._calls.mediaFailed });
	} finally {
		audioSettingsBusy.value = false;
	}
}

function setInputVolume(volume: number): void {
	try {
		media.value?.setInputVolume(volume);
		inputVolume.value = volume;
		prefer.commit('callsInputVolume', volume);
	} catch (error) {
		console.error('[Calls] Input volume change failed', error);
		void alert({ type: 'error', text: i18n.ts._calls.mediaFailed });
	}
}

function setOutputVolume(volume: number): void {
	outputVolume.value = volume;
	prefer.commit('callsOutputVolume', volume);
	applyParticipantVolumes();
}

async function setAutoGainControl(enabled: boolean): Promise<void> {
	if (audioSettingsBusy.value) return;
	audioSettingsBusy.value = true;
	try {
		await media.value?.setAutoGainControl(enabled);
		autoGainControl.value = enabled;
		prefer.commit('callsAutoGainControl', enabled);
	} catch (error) {
		console.error('[Calls] Automatic gain control change failed', error);
		await alert({ type: 'error', text: i18n.ts._calls.mediaFailed });
	} finally {
		audioSettingsBusy.value = false;
	}
}

async function setNoiseSuppression(mode: CallsNoiseSuppressionMode): Promise<void> {
	if (audioSettingsBusy.value) return;
	audioSettingsBusy.value = true;
	try {
		await media.value?.setNoiseSuppression(mode);
		noiseSuppression.value = mode;
		prefer.commit('callsNoiseSuppression', mode);
	} catch (error) {
		console.error('[Calls] Noise suppression change failed', error);
		await alert({ type: 'error', text: i18n.ts.somethingHappened });
	} finally {
		audioSettingsBusy.value = false;
	}
}

function setInputSensitivity(threshold: number): void {
	try {
		media.value?.setInputSensitivity(threshold);
		inputSensitivity.value = threshold;
		prefer.commit('callsInputSensitivity', threshold);
	} catch (error) {
		console.error('[Calls] Input sensitivity change failed', error);
		void alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function setVideoQuality(source: CallsVideoSource, quality: CallsVideoQuality): Promise<void> {
	if (joining.value || videoBusy.value || !(source === 'camera' ? canPublishVideo.value : canShareScreenMedia.value)) return;
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
	if (joining.value || videoBusy.value || !canShareScreenMedia.value) return;
	popupMenu([
		...videoQualityMenu('screen'),
		{ type: 'divider' },
		{ text: i18n.ts._calls.addScreenSharing, icon: 'ti ti-plus', action: () => toggleVideo('screen', true) },
		...[...localVideos.value].filter(([id]) => id !== 'camera').map(([id, stream], index) => ({
			text: `${i18n.ts._calls.stopScreenSharing} · ${stream.getVideoTracks()[0]?.label || index + 1}`,
			icon: 'ti ti-screen-share-off', action: () => toggleVideo('screen', false, id),
		})),
	], event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined);
}

async function resumeAudio(): Promise<void> {
	await Promise.all([volumeAudioContext?.resume(), ...[...remoteAudio.values()].map(({ element }) => element.play())]);
	needsAudioResume.value = false;
	if (media.value != null) await announceMediaReady(media.value, sessionGeneration);
}

async function announceMediaReady(controller: CallsMediaController, generation: number): Promise<void> {
	const identity = controller.connectionIdentity;
	await Promise.all([...remoteAudio.values()].map(({ playback }) => playback));
	if (generation !== sessionGeneration || media.value !== controller || !mediaReady.value || needsAudioResume.value || identity == null) return;
	if (controller.connectionIdentity?.generation !== identity.generation) return;
	connection.value?.ready(identity.connectionId, identity.generation);
}

watch(videos, current => {
	for (const stream of callsScreenWindows.keys()) {
		if (!current.some(video => video.stream === stream)) clearCallsScreenWindow(stream);
	}
});

watch(participants, applyParticipantVolumes);

watch(() => participants.value.map(participant => participant.userId), (current, previous) => {
	if (!sessionSoundActive || joining.value || !isActive.value || !previous.includes($i?.id ?? '')) return;
	if (current.some(id => id !== $i?.id && !previous.includes(id))) playMisskeySfx('callsParticipantJoin');
	if (previous.some(id => id !== $i?.id && !current.includes(id))) playMisskeySfx('callsParticipantLeave');
});

watch(muted, value => {
	if (sessionSoundActive && !joining.value && isActive.value) playMisskeySfx(value ? 'callsMute' : 'callsUnmute');
}, { flush: 'sync' });

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
	if (previousRole === 'listener' && (role === 'speaker' || role === 'host') && room.value?.state === 'open') void reconnectMedia();
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
		getConnectionInfo() { return media.value?.getConnectionInfo() ?? Promise.resolve(null); },
		mediaState,
		mediaFailure,
		muted,
		controls,
		openDeviceMenu,
		openScreenSettings,
		videoQuality,
		noiseSuppression,
		inputSensitivity,
		openAudioSettings,
		getAudioSettings,
		setAutoGainControl,
		setNoiseSuppression,
		setInputSensitivity,
		setDevice,
		refreshDevices,
		setInputVolume,
		setOutputVolume,
		localVideos,
		videos,
		screenWindows: callsScreenWindows,
		showScreenWindow: showCallsScreenWindow,
		videoBusy,
		canShareScreen,
		toggleVideo,
		selectedMicrophone,
		microphones,
		screenAudioIds,
		getScreenVolume,
		setScreenVolume,
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
