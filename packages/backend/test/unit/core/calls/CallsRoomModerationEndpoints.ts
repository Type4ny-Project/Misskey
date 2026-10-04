/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import MuteParticipant from '@/server/api/endpoints/calls/rooms/mute-participant.js';
import StopParticipantVideo from '@/server/api/endpoints/calls/rooms/stop-participant-video.js';
import type { MiLocalUser } from '@/models/User.js';

const host = { id: 'ownera' } as MiLocalUser;
const params = { roomId: 'rooma', expectedRevision: 1 };

test('routes microphone and video moderation to the room service', async () => {
	const service = { muteParticipant: vi.fn(), stopParticipantVideo: vi.fn() };
	const input = { roomId: params.roomId, participantId: 'participanta', expectedRevision: 1 };
	await new MuteParticipant(service as never).exec(input, host, null);
	await new StopParticipantVideo(service as never).exec({ ...input, mediaSource: 'screen' }, host, null);
	expect(service.muteParticipant).toHaveBeenCalledWith(host, input.roomId, input.participantId, 1);
	expect(service.stopParticipantVideo).toHaveBeenCalledWith(host, input.roomId, input.participantId, 'screen', 1);
	await expect(new StopParticipantVideo(service as never).exec({ ...input, mediaSource: 'microphone' }, host, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
});
