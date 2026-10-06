/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { UsersRepository, MiUser } from '@/models/_.js';
import { PointService } from '@/core/PointService.js';
import { NotificationService } from '@/core/NotificationService.js';

describe('PointService', () => {
	const usersRepository = mockDeep<UsersRepository>();
	const notificationService = mockDeep<NotificationService>();
	const service = new PointService(usersRepository, notificationService);

	beforeEach(() => {
		usersRepository.findOneByOrFail.mockReset();
		usersRepository.update.mockReset();
		notificationService.createNotification.mockReset();
		usersRepository.findOneByOrFail.mockResolvedValueOnce({ id: 'sender', points: 100 } as MiUser);
		usersRepository.findOneByOrFail.mockResolvedValueOnce({ id: 'recipient', points: 20 } as MiUser);
	});

	test('notifies the recipient of the sender and amount after transferring points', async () => {
		const result = await service.sendPoints('sender', 'recipient', 30);

		expect(result).toEqual({ success: true, senderBalance: 70, recipientBalance: 50 });
		expect(usersRepository.update).toHaveBeenCalledWith('sender', { points: 70 });
		expect(usersRepository.update).toHaveBeenCalledWith('recipient', { points: 50 });
		expect(notificationService.createNotification).toHaveBeenCalledExactlyOnceWith(
			'recipient', 'pointReceived', { points: 30 }, 'sender',
		);
		expect(notificationService.createNotification.mock.invocationCallOrder[0]).toBeGreaterThan(
			usersRepository.update.mock.invocationCallOrder[1],
		);
	});

	test('does not notify when the sender has insufficient points', async () => {
		await expect(service.sendPoints('sender', 'recipient', 101)).rejects.toThrow('Insufficient points');
		expect(notificationService.createNotification).not.toHaveBeenCalled();
	});

	test('does not notify when the balance update fails', async () => {
		usersRepository.update.mockRejectedValueOnce(new Error('update failed'));
		await expect(service.sendPoints('sender', 'recipient', 30)).rejects.toThrow('update failed');
		expect(notificationService.createNotification).not.toHaveBeenCalled();
	});
});
