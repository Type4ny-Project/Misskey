/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Antenna } from '@/server/api/endpoints/i/import-antennas.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { SystemWebhookEventType } from '@/models/SystemWebhook.js';
import type { MiUser } from '@/models/User.js';
import type { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import type { IActivity } from '@/core/activitypub/type.js';
import type { SystemWebhookPayload } from '@/core/SystemWebhookService.js';
import type { UserWebhookPayload } from '@/core/UserWebhookService.js';
import type httpSignature from '@peertube/http-signature';

export type TenantScopedJobData = {
	tenantHost?: string;
};

export type DeliverJobData = {
	/** Actor */
	user: ThinUser;
	/** Activity */
	content: string;
	/** Digest header */
	digest: string;
	/** inbox URL to deliver */
	to: string;
	/** whether it is sharedInbox */
	isSharedInbox: boolean;
} & TenantScopedJobData;

export type InboxJobData = {
	activity: IActivity;
	signature: httpSignature.IParsedSignature;
} & TenantScopedJobData;

export type RelationshipJobData = {
	from: ThinUser;
	to: ThinUser;
	silent?: boolean;
	requestId?: string;
	withReplies?: boolean;
} & TenantScopedJobData;

export type DbJobData<T extends keyof DbJobMap> = DbJobMap[T];

export type DbJobMap = {
	deleteDriveFiles: DbJobDataWithUser;
	exportCustomEmojis: DbJobDataWithUser;
	exportAntennas: DBExportAntennasData;
	exportNotes: DbJobDataWithUser;
	exportFavorites: DbJobDataWithUser;
	exportFollowing: DbExportFollowingData;
	exportMuting: DbJobDataWithUser;
	exportBlocking: DbJobDataWithUser;
	exportUserLists: DbJobDataWithUser;
	importAntennas: DBAntennaImportJobData;
	importFollowing: DbUserImportJobData;
	importFollowingToDb: DbUserImportToDbJobData;
	importMuting: DbUserImportJobData;
	importBlocking: DbUserImportJobData;
	importBlockingToDb: DbUserImportToDbJobData;
	importUserLists: DbUserImportJobData;
	importCustomEmojis: DbUserImportJobData;
	deleteAccount: DbUserDeleteJobData;
};

export type DbJobDataWithUser = {
	user: ThinUser;
} & TenantScopedJobData;

export type DbExportFollowingData = {
	user: ThinUser;
	excludeMuting: boolean;
	excludeInactive: boolean;
} & TenantScopedJobData;

export type DBExportAntennasData = {
	user: ThinUser
} & TenantScopedJobData;

export type DbUserDeleteJobData = {
	user: ThinUser;
	soft?: boolean;
} & TenantScopedJobData;

export type DbUserImportJobData = {
	user: ThinUser;
	fileId: MiDriveFile['id'];
	withReplies?: boolean;
} & TenantScopedJobData;

export type DBAntennaImportJobData = {
	user: ThinUser,
	antenna: Antenna
} & TenantScopedJobData;

export type DbUserImportToDbJobData = {
	user: ThinUser;
	target: string;
	withReplies?: boolean;
} & TenantScopedJobData;

export type ObjectStorageJobData = ObjectStorageFileJobData | Record<string, unknown>;

export type ObjectStorageFileJobData = {
	key: string;
} & TenantScopedJobData;

export type EndedPollNotificationJobData = {
	noteId: MiNote['id'];
} & TenantScopedJobData;

export type PostScheduledNoteJobData = {
	noteDraftId: string;
} & TenantScopedJobData;

export type SystemWebhookDeliverJobData<T extends SystemWebhookEventType = SystemWebhookEventType> = {
	type: T;
	content: SystemWebhookPayload<T>;
	webhookId: MiWebhook['id'];
	to: string;
	secret: string;
	createdAt: number;
	eventId: string;
} & TenantScopedJobData;

export type UserWebhookDeliverJobData<T extends WebhookEventTypes = WebhookEventTypes> = {
	type: T;
	content: UserWebhookPayload<T>;
	webhookId: MiWebhook['id'];
	userId: MiUser['id'];
	to: string;
	secret: string;
	createdAt: number;
	eventId: string;
} & TenantScopedJobData;

export type ThinUser = {
	id: MiUser['id'];
};
