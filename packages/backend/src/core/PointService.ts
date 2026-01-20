/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class PointService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
	) {
	}

	/**
	 * Send points from one user to another
	 * @param senderId The ID of the user sending points
	 * @param recipientId The ID of the user receiving points
	 * @param amount The amount of points to send
	 * @returns Object containing success status and new balances
	 */
	@bindThis
	public async sendPoints(
		senderId: MiUser['id'],
		recipientId: MiUser['id'],
		amount: number,
	): Promise<{
		success: boolean;
		senderBalance: number;
		recipientBalance: number;
	}> {
		if (amount <= 0) {
			throw new Error('Amount must be positive');
		}

		if (senderId === recipientId) {
			throw new Error('Cannot send points to yourself');
		}

		// Get sender's current balance
		const sender = await this.usersRepository.findOneByOrFail({ id: senderId });
		const recipient = await this.usersRepository.findOneByOrFail({ id: recipientId });

		if (sender.points < amount) {
			throw new Error('Insufficient points');
		}

		// Perform the transfer
		const newSenderBalance = sender.points - amount;
		const newRecipientBalance = recipient.points + amount;

		await this.usersRepository.update(senderId, {
			points: newSenderBalance,
		});

		await this.usersRepository.update(recipientId, {
			points: newRecipientBalance,
		});

		return {
			success: true,
			senderBalance: newSenderBalance,
			recipientBalance: newRecipientBalance,
		};
	}

	/**
	 * Add points to a user (for admin use or login bonus)
	 * @param userId The ID of the user to add points to
	 * @param amount The amount of points to add
	 * @returns The new balance
	 */
	@bindThis
	public async addPoints(
		userId: MiUser['id'],
		amount: number,
	): Promise<number> {
		if (amount <= 0) {
			throw new Error('Amount must be positive');
		}

		const user = await this.usersRepository.findOneByOrFail({ id: userId });
		const newBalance = user.points + amount;

		await this.usersRepository.update(userId, {
			points: newBalance,
		});

		return newBalance;
	}

	/**
	 * Get a user's current point balance
	 * @param userId The ID of the user
	 * @returns The user's current point balance
	 */
	@bindThis
	public async getBalance(userId: MiUser['id']): Promise<number> {
		const user = await this.usersRepository.findOneByOrFail({ id: userId });
		return user.points;
	}
}
