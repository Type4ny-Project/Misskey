/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent } from 'vue';
import * as Misskey from 'misskey-js';
import { apiUrl } from '@@/js/config.js';
import type { UploaderFeatures } from '@/composables/use-uploader.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { $i } from '@/i.js';
import { instance } from '@/instance.js';
import { globalEvents } from '@/events.js';
import { getProxiedImageUrl } from '@/utility/media-proxy.js';
import { genId } from '@/utility/id.js';

type UploadReturnType = {
	filePromise: Promise<Misskey.entities.DriveFile>;
	abort: () => void;
};

const CHUNK_UPLOAD_THRESHOLD = 20 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_RETRIES = 3;
const CHUNK_TRANSFER_PROGRESS_WEIGHT = 0.95;

const UPLOAD_ERROR_IDS = {
	inappropriate: 'bec5bd69-fba3-43c9-b4fb-2894b66ad5d2',
	noFreeSpace: 'd08dbc37-a6a9-463a-8c47-96c32ab5f064',
	maxFileSizeExceeded: 'b9d8c348-33f0-4673-b9a9-5d4da058977a',
	unallowedFileType: '4becd248-7f2c-48c4-a9f0-75edc4f9a1ea',
} as const;

type UploadOptions = {
	name?: string;
	folderId?: string | null;
	isSensitive?: boolean;
	caption?: string | null;
	onProgress?: (ctx: { total: number; loaded: number; }) => void;
};

type UploadErrorResponse = {
	error?: {
		message?: string;
		code?: string;
		id?: string;
	};
};

type ChunkUploadInitResponse = {
	sessionId: string;
	chunkSize?: number;
};

class UploadRequestError extends Error {
	public readonly responseJson?: UploadErrorResponse;

	constructor(
		public readonly status: number,
		public readonly responseText: string,
	) {
		super('Upload request failed');
		this.responseJson = parseResponseJson(responseText);
	}
}

export class UploadAbortedError extends Error {
	constructor() {
		super('Upload aborted');
	}
}

function parseResponseJson(responseText: string): UploadErrorResponse | undefined {
	if (responseText.length === 0) return undefined;

	try {
		return JSON.parse(responseText) as UploadErrorResponse;
	} catch {
		return undefined;
	}
}

function showUploadError(error: UploadRequestError): void {
	const errorId = error.responseJson?.error?.id;

	if (error.status === 413 || errorId === UPLOAD_ERROR_IDS.maxFileSizeExceeded) {
		os.alert({
			type: 'error',
			title: i18n.ts.failedToUpload,
			text: i18n.ts.cannotUploadBecauseExceedsFileSizeLimit,
		});
		return;
	}

	if (errorId === UPLOAD_ERROR_IDS.inappropriate) {
		os.alert({
			type: 'error',
			title: i18n.ts.failedToUpload,
			text: i18n.ts.cannotUploadBecauseInappropriate,
		});
		return;
	}

	if (errorId === UPLOAD_ERROR_IDS.noFreeSpace) {
		os.alert({
			type: 'error',
			title: i18n.ts.failedToUpload,
			text: i18n.ts.cannotUploadBecauseNoFreeSpace,
		});
		return;
	}

	if (errorId === UPLOAD_ERROR_IDS.unallowedFileType) {
		os.alert({
			type: 'error',
			title: i18n.ts.failedToUpload,
			text: i18n.ts.cannotUploadBecauseUnallowedFileType,
		});
		return;
	}

	if (error.responseJson?.error) {
		os.alert({
			type: 'error',
			title: i18n.ts.failedToUpload,
			text: `${error.responseJson.error.message}\n${error.responseJson.error.code}\n${error.responseJson.error.id}`,
		});
		return;
	}

	os.alert({
		type: 'error',
		title: 'Failed to upload',
		text: error.responseText,
	});
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw new UploadAbortedError();
	}
}

function waitWithAbort(signal: AbortSignal, ms: number): Promise<void> {
	return new Promise((resolve, reject) => {
		throwIfAborted(signal);

		const timer = window.setTimeout(() => {
			signal.removeEventListener('abort', abortHandler);
			resolve();
		}, ms);

		const abortHandler = () => {
			window.clearTimeout(timer);
			signal.removeEventListener('abort', abortHandler);
			reject(new UploadAbortedError());
		};

		signal.addEventListener('abort', abortHandler, { once: true });
	});
}

function sendUploadRequest<T>(endpoint: string, body: FormData | string, options: {
	signal: AbortSignal;
	contentType?: string;
	onProgress?: (ev: ProgressEvent<EventTarget>) => void;
}): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		throwIfAborted(options.signal);

		const xhr = new XMLHttpRequest();
		const abortHandler = () => xhr.abort();

		const cleanup = () => {
			options.signal.removeEventListener('abort', abortHandler);
		};

		xhr.open('POST', `${apiUrl}/${endpoint}`, true);
		if (options.contentType != null) {
			xhr.setRequestHeader('Content-Type', options.contentType);
		}

		if (options.onProgress != null) {
			xhr.upload.onprogress = options.onProgress;
		}

		xhr.onload = () => {
			cleanup();

			try {
				if (xhr.status === 200) {
					resolve((xhr.responseText.length === 0 ? undefined : JSON.parse(xhr.responseText)) as T);
					return;
				}

				if (xhr.status === 204) {
					resolve(undefined as T);
					return;
				}

				reject(new UploadRequestError(xhr.status, xhr.responseText));
			} catch (error) {
				reject(error);
			}
		};

		xhr.onerror = () => {
			cleanup();
			reject(new UploadRequestError(xhr.status, xhr.responseText));
		};

		xhr.onabort = () => {
			cleanup();
			reject(new UploadAbortedError());
		};

		options.signal.addEventListener('abort', abortHandler, { once: true });
		xhr.send(body);
	});
}

async function uploadFileSingleRequest(file: File | Blob, options: UploadOptions, signal: AbortSignal): Promise<Misskey.entities.DriveFile> {
	const formData = new FormData();
	formData.append('i', $i!.token);
	formData.append('force', 'true');
	formData.append('file', file);
	formData.append('name', options.name ?? (file instanceof File ? file.name : 'untitled'));
	formData.append('isSensitive', options.isSensitive ? 'true' : 'false');
	if (options.caption != null) formData.append('comment', options.caption);
	if (options.folderId) formData.append('folderId', options.folderId);

	const driveFile = await sendUploadRequest<Misskey.entities.DriveFile>('drive/files/create', formData, {
		signal,
		onProgress: options.onProgress == null ? undefined : ev => {
			if (ev.lengthComputable && options.onProgress != null) {
				options.onProgress({
					total: ev.total,
					loaded: ev.loaded,
				});
			}
		},
	});

	globalEvents.emit('driveFileCreated', driveFile);
	return driveFile;
}

async function uploadFileChunked(file: File | Blob, options: UploadOptions, signal: AbortSignal): Promise<Misskey.entities.DriveFile> {
	const initResponse = await sendUploadRequest<ChunkUploadInitResponse>('drive/files/upload-init', JSON.stringify({
		i: $i!.token,
		name: options.name ?? (file instanceof File ? file.name : 'untitled'),
		size: file.size,
		folderId: options.folderId ?? null,
		isSensitive: options.isSensitive ?? false,
		comment: options.caption ?? null,
		force: true,
	}), {
		signal,
		contentType: 'application/json',
	});

	throwIfAborted(signal);

	const chunkSize = initResponse.chunkSize != null && initResponse.chunkSize > 0 ? initResponse.chunkSize : DEFAULT_CHUNK_SIZE;

	const chunks: { index: number; blob: Blob }[] = [];
	for (let start = 0, index = 0; start < file.size; start += chunkSize, index++) {
		const end = Math.min(start + chunkSize, file.size);
		chunks.push({ index, blob: file.slice(start, end) });
	}

	const CONCURRENCY = 3;
	const chunkProgress = new Map<number, number>();

	const emitTransferProgress = () => {
		if (options.onProgress == null) return;

		const transferredBytes = Array.from(chunkProgress.values()).reduce((sum, loaded) => sum + loaded, 0);
		const scaledLoaded = file.size === 0
			? 0
			: Math.min(file.size * CHUNK_TRANSFER_PROGRESS_WEIGHT, transferredBytes * CHUNK_TRANSFER_PROGRESS_WEIGHT);

		options.onProgress({
			total: file.size,
			loaded: scaledLoaded,
		});
	};

	async function uploadChunkWithRetry(chunk: (typeof chunks)[0]): Promise<void> {
		let attempt = 0;
		chunkProgress.set(chunk.index, 0);

		while (attempt <= MAX_RETRIES) {
			try {
				const formData = new FormData();
				formData.append('i', $i!.token);
				formData.append('sessionId', initResponse.sessionId);
				formData.append('index', chunk.index.toString());
				formData.append('file', chunk.blob);

				await sendUploadRequest<void>('drive/files/upload-chunk', formData, {
					signal,
					onProgress: options.onProgress == null ? undefined : ev => {
						if (ev.lengthComputable) {
							chunkProgress.set(chunk.index, Math.min(chunk.blob.size, ev.loaded));
							emitTransferProgress();
						}
					},
				});

				chunkProgress.set(chunk.index, chunk.blob.size);
				emitTransferProgress();

				return;
			} catch (error) {
				if (error instanceof UploadAbortedError) throw error;

				if (error instanceof UploadRequestError) {
					if (error.status >= 400 && error.status < 500) throw error;

					chunkProgress.set(chunk.index, 0);
					emitTransferProgress();
					attempt++;
					if (attempt > MAX_RETRIES) throw error;

					const delay = Math.pow(2, attempt - 1) * 1000;
					await waitWithAbort(signal, delay);
					continue;
				}

				throw error;
			}
		}
	}

	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (true) {
			throwIfAborted(signal);
			const currentIndex = nextIndex++;
			if (currentIndex >= chunks.length) return;
			await uploadChunkWithRetry(chunks[currentIndex]);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker()),
	);

	throwIfAborted(signal);
	options.onProgress?.({
		total: file.size,
		loaded: file.size * CHUNK_TRANSFER_PROGRESS_WEIGHT,
	});

	const driveFile = await sendUploadRequest<Misskey.entities.DriveFile>('drive/files/upload-commit', JSON.stringify({
		i: $i!.token,
		sessionId: initResponse.sessionId,
	}), {
		signal,
		contentType: 'application/json',
	});

	options.onProgress?.({
		total: file.size,
		loaded: file.size,
	});

	globalEvents.emit('driveFileCreated', driveFile);
	return driveFile;
}

export function uploadFile(file: File | Blob, options: {
	name?: string;
	folderId?: string | null;
	isSensitive?: boolean;
	caption?: string | null;
	onProgress?: (ctx: { total: number; loaded: number; }) => void;
} = {}): UploadReturnType {
	const abortController = new AbortController();
	const { signal } = abortController;

	const filePromise = new Promise<Misskey.entities.DriveFile>((resolve, reject) => {
		if ($i == null) return reject();

		// こっち側で検出するMIME typeとサーバーで検出するMIME typeは異なる場合があるため、こっち側ではやらないことにする
		// https://github.com/misskey-dev/misskey/issues/16091
		//const allowedMimeTypes = $i.policies.uploadableFileTypes;
		//const isAllowedMimeType = allowedMimeTypes.some(mimeType => {
		//	if (mimeType === '*' || mimeType === '*/*') return true;
		//	if (mimeType.endsWith('/*')) return file.type.startsWith(mimeType.slice(0, -1));
		//	return file.type === mimeType;
		//});
		//if (!isAllowedMimeType) {
		//	os.alert({
		//		type: 'error',
		//		title: i18n.ts.failedToUpload,
		//		text: i18n.ts.cannotUploadBecauseUnallowedFileType,
		//	});
		//	return reject();
		//}

		if ((file.size > instance.maxFileSize) || (file.size > ($i.policies.maxFileSizeMb * 1024 * 1024))) {
			os.alert({
				type: 'error',
				title: i18n.ts.failedToUpload,
				text: i18n.ts.cannotUploadBecauseExceedsFileSizeLimit,
			});
			return reject();
		}

		const uploadPromise = file.size > CHUNK_UPLOAD_THRESHOLD
			? uploadFileChunked(file, options, signal)
			: uploadFileSingleRequest(file, options, signal);

		uploadPromise.then(resolve).catch(error => {
			if (error instanceof UploadAbortedError) {
				reject(error);
				return;
			}

			if (error instanceof UploadRequestError) {
				showUploadError(error);
			} else {
				os.alert({
					type: 'error',
					title: i18n.ts.failedToUpload,
					text: error instanceof Error ? error.message : String(error),
				});
			}

			reject();
		});
	});

	const abort = () => {
		abortController.abort();
	};

	return { filePromise, abort };
}

export function chooseFileFromPcAndUpload(
	options: {
		multiple?: boolean;
		features?: UploaderFeatures;
		folderId?: string | null;
	} = {},
): Promise<Misskey.entities.DriveFile[]> {
	return new Promise((res, rej) => {
		os.chooseFileFromPc({ multiple: options.multiple }).then(files => {
			if (files.length === 0) return;
			os.launchUploader(files, {
				folderId: options.folderId,
				features: options.features,
			}).then(driveFiles => {
				res(driveFiles);
			});
		});
	});
}

export function chooseDriveFile(options: {
	multiple?: boolean;
} = {}): Promise<Misskey.entities.DriveFile[]> {
	return new Promise((resolve, rej) => {
		let dispose: () => void;
		os.popupAsyncWithDialog(import('@/components/MkDriveFileSelectDialog.vue').then(x => x.default), {
			multiple: options.multiple ?? false,
		}, {
			done: files => {
				if (files) {
					resolve(files);
				}
			},
			closed: () => dispose(),
		}).then((d) => dispose = d.dispose, rej);
	});
}

export function chooseFileFromUrl(): Promise<Misskey.entities.DriveFile> {
	return new Promise((res, rej) => {
		os.inputText({
			title: i18n.ts.uploadFromUrl,
			type: 'url',
			placeholder: i18n.ts.uploadFromUrlDescription,
		}).then(({ canceled, result: url }) => {
			if (canceled || url == null) return;

			const marker = genId();

			// TODO: no websocketモード対応
			const connection = useStream().useChannel('main');
			connection.on('urlUploadFinished', urlResponse => {
				if (urlResponse.marker === marker) {
					res(urlResponse.file);
					connection.dispose();
				}
			});

			misskeyApi('drive/files/upload-from-url', {
				url: url,
				folderId: prefer.s.uploadFolder,
				marker,
			});

			os.alert({
				title: i18n.ts.uploadFromUrlRequested,
				text: i18n.ts.uploadFromUrlMayTakeTime,
			});
		});
	});
}

function select(anchorElement: HTMLElement | EventTarget | null, label: string | null, multiple: boolean, features?: UploaderFeatures): Promise<Misskey.entities.DriveFile[]> {
	return new Promise((res, rej) => {
		os.popupMenu([label ? {
			text: label,
			type: 'label',
		} : null, {
			text: i18n.ts.upload,
			icon: 'ti ti-upload',
			action: () => chooseFileFromPcAndUpload({ multiple, features }).then(files => res(files)),
		}, {
			text: i18n.ts.fromDrive,
			icon: 'ti ti-cloud',
			action: () => chooseDriveFile({ multiple }).then(files => res(files)),
		}, {
			text: i18n.ts.fromUrl,
			icon: 'ti ti-link',
			action: () => chooseFileFromUrl().then(file => res([file])),
		}], anchorElement);
	});
}

type SelectFileOptions<M extends boolean> = {
	anchorElement: HTMLElement | EventTarget | null;
	multiple: M;
	label?: string | null;
	features?: UploaderFeatures;
};

export async function selectFile<
	M extends boolean,
	MR extends M extends true ? Misskey.entities.DriveFile[] : Misskey.entities.DriveFile,
>(opts: SelectFileOptions<M>): Promise<MR> {
	const files = await select(opts.anchorElement, opts.label ?? null, opts.multiple ?? false, opts.features);
	return opts.multiple ? (files as MR) : (files[0]! as MR);
}

export async function createCroppedImageDriveFileFromImageDriveFile(imageDriveFile: Misskey.entities.DriveFile, options: {
	aspectRatio: number | null;
}): Promise<Misskey.entities.DriveFile> {
	return new Promise((resolve, reject) => {
		const imgUrl = getProxiedImageUrl(imageDriveFile.url, undefined, true);
		const image = new Image();
		image.src = imgUrl;
		image.onload = () => {
			const canvas = window.document.createElement('canvas');
			const ctx = canvas.getContext('2d')!;
			canvas.width = image.width;
			canvas.height = image.height;
			ctx.drawImage(image, 0, 0);
			canvas.toBlob(blob => {
				if (blob == null) {
					reject();
					return;
				}

				os.cropImageFile(blob, {
					aspectRatio: options.aspectRatio,
				}).then(croppedImageFile => {
					const { filePromise } = uploadFile(croppedImageFile, {
						name: imageDriveFile.name,
						folderId: imageDriveFile.folderId,
					});

					filePromise.then(driveFile => {
						resolve(driveFile);
					});
				});
			});
		};
	});
}

export async function selectDriveFolder(initialFolder: Misskey.entities.DriveFolder['id'] | null): Promise<{
	canceled: false;
	folders: (Misskey.entities.DriveFolder | null)[];
} | {
	canceled: true;
	folders: undefined;
}> {
	return new Promise((resolve, reject) => {
		let dispose: () => void;
		os.popupAsyncWithDialog(import('@/components/MkDriveFolderSelectDialog.vue').then(x => x.default), {
			initialFolder,
		}, {
			done: folders => {
				resolve(folders == null ? {
					canceled: true,
					folders: undefined,
				} : {
					canceled: false,
					folders,
				});
			},
			closed: () => dispose(),
		}).then(d => dispose = d.dispose, reject);
	});
}
