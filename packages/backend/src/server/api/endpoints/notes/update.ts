/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { NoteUpdateService } from '@/core/NoteUpdateService.js';
import { DI } from '@/di-symbols.js';
import type { NotesRepository, DriveFilesRepository } from '@/models/_.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,

	limit: {
		duration: ms('1hour'),
		max: 60,
	},

	kind: 'write:notes',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			updatedNote: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'Note',
			},
		},
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '43997c27-32c0-4322-834f-039c394c86be',
		},

		forbidden: {
			message: 'You are not the author of this note.',
			code: 'FORBIDDEN',
			id: 'b5299496-e827-448e-a2b8-93f9c87d6023',
		},

		cannotEditPureRenote: {
			message: 'Cannot edit a pure renote.',
			code: 'CANNOT_EDIT_PURE_RENOTE',
			id: 'c1d93b3e-0f6b-7c1d-2a8e-4d5e6f7a8b9c',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		text: {
			type: 'string',
			optional: true, nullable: true,
			maxLength: MAX_NOTE_TEXT_LENGTH,
		},
		cw: {
			type: 'string',
			optional: true, nullable: true,
			maxLength: 100,
		},
		fileIds: {
			type: 'array',
			optional: true, nullable: false,
			items: { type: 'string', format: 'misskey:id' },
			maxItems: 16,
		},
	},
	required: ['noteId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private noteEntityService: NoteEntityService,
		private noteUpdateService: NoteUpdateService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.notesRepository.findOneBy({ id: ps.noteId });

			if (note == null) {
				throw new ApiError(meta.errors.noSuchNote);
			}

			if (note.userId !== me.id) {
				throw new ApiError(meta.errors.forbidden);
			}

			if (note.renoteId !== null && note.text === null) {
				throw new ApiError(meta.errors.cannotEditPureRenote);
			}

			const files = ps.fileIds ? await Promise.all(ps.fileIds.map(fileId =>
				this.driveFilesRepository.findOneByOrFail({ id: fileId, userId: me.id }),
			)) : undefined;

			const data = {
				text: ps.text,
				cw: ps.cw,
				files: files,
			};

			const updatedNote = await this.noteUpdateService.update(me, data, note, false);

			return {
				updatedNote: await this.noteEntityService.pack(updatedNote, me),
			};
		});
	}
}
