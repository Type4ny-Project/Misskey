/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setImmediate } from 'node:timers/promises';
import * as mfm from 'mfm-js';
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { extractCustomEmojisFromMfm } from '@/misc/extract-custom-emojis-from-mfm.js';
import { extractHashtags } from '@/misc/extract-hashtags.js';
import { MiNote, IMentionedRemoteUsers } from '@/models/Note.js';
import type { NotesRepository, DriveFilesRepository, UsersRepository } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser, MiLocalUser, MiRemoteUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';
import { SearchService } from '@/core/SearchService.js';
import type { IPoll } from '@/models/Poll.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { RelayService } from '@/core/RelayService.js';
import { In } from 'typeorm';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import util from 'util';

export type NoteUpdateData = {
	updatedAt?: Date | null;
	text?: string | null;
	cw?: string | null;
	files?: MiDriveFile[];
	apHashtags?: string[];
	apEmojis?: string[];
	poll?: IPoll | null;
};

@Injectable()
export class NoteUpdateService implements OnApplicationShutdown {
	#shutdownController = new AbortController();

	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private globalEventService: GlobalEventService,
		private searchService: SearchService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
		private userEntityService: UserEntityService,
		private relayService: RelayService,
		private activeUsersChart: ActiveUsersChart,
	) {
	}

	/**
	 * Update an existing note
	 * @param user The user updating the note
	 * @param data The new note data
	 * @param note The note to update
	 * @param silent Whether to suppress notifications
	 * @returns The updated note
	 */
	@bindThis
	public async update(
		user: MiUser,
		data: NoteUpdateData,
		note: MiNote,
		silent = false,
	): Promise<MiNote> {
		// Only the author can edit their own note
		if (note.userId !== user.id) {
			throw new Error('You can only edit your own notes');
		}

		// Cannot edit renotes (only quotes with text are allowed)
		if (note.renoteId !== null && note.text === null) {
			throw new Error('Cannot edit a pure renote');
		}

		const now = data.updatedAt ?? new Date();

		// Save current text to history before updating
		const previousText = note.text ?? '';
		const noteEditHistory = [...note.noteEditHistory, previousText];
		const updatedAtHistory = note.updatedAtHistory
			? [...note.updatedAtHistory, now]
			: [now];

		// Extract new emojis and hashtags if text changed
		let emojis: string[] = data.apEmojis ?? note.emojis;
		let tags: string[] = data.apHashtags ?? note.tags;

		if ((!data.apHashtags || !data.apEmojis) && data.text !== undefined && data.text !== note.text) {
			const tokens = data.text ? mfm.parse(data.text) : [];
			if (!data.apEmojis) emojis = extractCustomEmojisFromMfm(tokens);
			if (!data.apHashtags) tags = extractHashtags(tokens);
		}

		// Prepare file IDs
		let fileIds: MiDriveFile['id'][] = note.fileIds;
		let attachedFileTypes: string[] = note.attachedFileTypes;

		if (data.files !== undefined) {
			fileIds = data.files.map(f => f.id);
			attachedFileTypes = data.files.map(f => f.type);
		}

		// Update the note
		await this.notesRepository.update(note.id, {
			text: data.text !== undefined ? data.text : note.text,
			cw: data.cw !== undefined ? data.cw : note.cw,
			fileIds,
			attachedFileTypes,
			emojis,
			tags,
			updatedAt: now,
			updatedAtHistory,
			noteEditHistory,
		});

		// Fetch the updated note
		const updatedNote = await this.notesRepository.findOneByOrFail({ id: note.id });

		if (!silent) {
			if (this.userEntityService.isLocalUser(user)) this.activeUsersChart.write(user);

			// Emit update event
			this.globalEventService.publishNoteStream(note.id, 'updated', {
				text: updatedNote.text ?? '',
				cw: updatedNote.cw,
				updatedAt: updatedNote.updatedAt?.toISOString() ?? new Date().toISOString(),
			});

			//#region AP deliver
			if (this.userEntityService.isLocalUser(user)) {
				setImmediate(async () => {
					// @ts-ignore
					const noteActivity = await this.renderNoteActivity(updatedNote, user);
					await this.deliverToConcerned(user, updatedNote, noteActivity);
				});
			}
			//#endregion
		}

		// Update search index
		if (data.text !== undefined) {
			await this.searchService.unindexNote(note);
			await this.searchService.indexNote(updatedNote);
		}

		return updatedNote;
	}

	@bindThis
	private async renderNoteActivity(note: MiNote, user: MiUser) {
		const content = this.apRendererService.renderUpdate(await this.apRendererService.renderNote(note, false), user);

		return this.apRendererService.addContext(content);
	}

	@bindThis
	private async getMentionedRemoteUsers(note: MiNote) {
		const where = [] as any[];

		// mention / reply / dm
		const uris = (JSON.parse(note.mentionedRemoteUsers) as IMentionedRemoteUsers).map(x => x.uri);
		if (uris.length > 0) {
			where.push(
				{ uri: In(uris) },
			);
		}

		// renote / quote
		if (note.renoteUserId) {
			where.push({
				id: note.renoteUserId,
			});
		}

		if (where.length === 0) return [];

		return await this.usersRepository.find({
			where,
		}) as MiRemoteUser[];
	}

	@bindThis
	private async deliverToConcerned(user: { id: MiLocalUser['id']; host: MiLocalUser['host']; }, note: MiNote, content: any) {
		await this.apDeliverManagerService.deliverToFollowers(user, content);
		await this.relayService.deliverToRelays(user, content);
		const remoteUsers = await this.getMentionedRemoteUsers(note);
		for (const remoteUser of remoteUsers) {
			await this.apDeliverManagerService.deliverToUser(user, content, remoteUser);
		}
	}

	@bindThis
	public dispose(): void {
		this.#shutdownController.abort();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
