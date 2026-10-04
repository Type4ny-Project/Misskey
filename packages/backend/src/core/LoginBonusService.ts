/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { randomInt } from 'node:crypto';
import { DataSource } from 'typeorm';
import { MiUser } from '@/models/User.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { NotificationService } from '@/core/NotificationService.js';
import { MetaService } from '@/core/MetaService.js';
import { RoleService } from '@/core/RoleService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';

export interface LoginBonusAward {
  points: number;
  balance: number;
  notificationId: string;
}

@Injectable()
export class LoginBonusService {
  constructor(
    @Inject(DI.db)
    private db: DataSource,

    @Inject(DI.usersRepository)
    private usersRepository: UsersRepository,

    @Inject(DI.userProfilesRepository)
    private userProfilesRepository: UserProfilesRepository,

    private notificationService: NotificationService,
    private metaService: MetaService,
    private roleService: RoleService,
  ) {}

  /**
   * Award login bonus points to a user if they haven't received today's bonus
   */
  async awardLoginBonus(userId: string): Promise<LoginBonusAward | null> {
    const now = new Date();
    const today = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;

    const userProfile = await this.userProfilesRepository.findOne({
      where: { userId },
    });

    if (!userProfile) {
      throw new ApiError({ id: 'login-bonus-profile-not-found', message: 'User profile not found', code: 'USER_PROFILE_NOT_FOUND' });
    }

    if (userProfile.lastLoginBonusDate === today) {
      return null;
    }

    // Check if login bonus feature is enabled
    const meta = await this.metaService.fetch();
    if (!meta.enableLoginBonus) {
      return null;
    }

    // Check if user has permission to receive login bonus
    const policies = await this.roleService.getUserPolicies(userId);
    if (!policies.loginBonusGrantEnabled) {
      return null;
    }

    // Award random points (1-5)
    const bonusPoints = randomInt(1, 6);
    const balance = await this.db.transaction(async manager => {
      const claimed = await manager.createQueryBuilder()
        .update(MiUserProfile)
        .set({ lastLoginBonusDate: today })
        .where('"userId" = :userId', { userId })
        .andWhere('"lastLoginBonusDate" IS DISTINCT FROM :today', { today })
        .execute();

      if (claimed.affected === 0) return null;

      await manager.increment(MiUser, { id: userId }, 'points', bonusPoints);
      return (await manager.findOneByOrFail(MiUser, { id: userId })).points;
    });

    if (balance == null) return null;

    // Create login bonus notification
    await this.notificationService.createNotification(userId, 'loginBonus', {
      points: bonusPoints,
    } as any);

    return {
      points: bonusPoints,
      balance,
      notificationId: '',
    };
  }

  /**
   * Get user's current points balance
   */
  async getUserPoints(userId: string): Promise<number> {
    const user = await this.usersRepository.findOneByOrFail({ id: userId });
    return user.points;
  }

  /**
   * Check if user has permission to receive login bonus
   */
  async canReceiveLoginBonus(userId: string): Promise<boolean> {
    const meta = await this.metaService.fetch();
    if (!meta.enableLoginBonus) {
      return false;
    }

    const policies = await this.roleService.getUserPolicies(userId);
    return policies.loginBonusGrantEnabled;
  }

  /**
   * Get user's login bonus visibility setting
   */
  async getLoginBonusVisibility(userId: string): Promise<boolean> {
    const userProfile = await this.userProfilesRepository.findOne({
      where: { userId },
      relations: { user: true },
    });

    if (!userProfile) {
      throw new ApiError({ id: 'login-bonus-profile-not-found', message: 'User profile not found', code: 'USER_PROFILE_NOT_FOUND' });
    }

    return userProfile.pointsVisibility === 'public';
  }

  /**
   * Update user's login bonus visibility setting
   */
  async setLoginBonusVisibility(userId: string, isVisible: boolean): Promise<void> {
    await this.userProfilesRepository.update({ userId }, {
      pointsVisibility: isVisible ? 'public' : 'private',
    });
  }

  /**
   * Get user's login bonus notification configuration
   */
  async getLoginBonusNotificationConfig(userId: string): Promise<{
    type: 'all' | 'never' | 'following' | 'follower' | 'mutualFollow' | 'followingOrFollower' | 'list';
    userListId?: string;
  }> {
    const userProfile = await this.userProfilesRepository.findOne({
      where: { userId },
      relations: { user: true },
    });

    if (!userProfile) {
      throw new ApiError({ id: 'login-bonus-profile-not-found', message: 'User profile not found', code: 'USER_PROFILE_NOT_FOUND' });
    }

    const config = userProfile.notificationRecieveConfig['loginBonus'];
    return config || { type: 'all' };
  }

  /**
   * Update user's login bonus notification configuration
   */
  async setLoginBonusNotificationConfig(userId: string, config: {
    type: 'all' | 'never' | 'following' | 'follower' | 'mutualFollow' | 'followingOrFollower' | 'list';
    userListId?: string;
  }): Promise<void> {
    const userProfile = await this.userProfilesRepository.findOne({
      where: { userId },
      relations: { user: true },
    });

    if (!userProfile) {
      throw new ApiError({ id: 'login-bonus-profile-not-found', message: 'User profile not found', code: 'USER_PROFILE_NOT_FOUND' });
    }

    await this.userProfilesRepository.update({ userId }, {
      notificationRecieveConfig: {
        ...userProfile.notificationRecieveConfig,
        'loginBonus': config as any,
      },
    });
  }

  /**
   * Get user's login history
   */
  async getLoginHistory(userId: string): Promise<string[]> {
    const userProfile = await this.userProfilesRepository.findOne({
      where: { userId },
      relations: { user: true },
    });

    if (!userProfile) {
      throw new ApiError({ id: 'login-bonus-profile-not-found', message: 'User profile not found', code: 'USER_PROFILE_NOT_FOUND' });
    }

    return userProfile.loggedInDates;
  }

  /**
   * Get login bonus statistics for a user
   */
  async getLoginBonusStats(userId: string): Promise<{
    totalPoints: number;
    totalAwards: number;
    currentStreak: number;
    longestStreak: number;
  }> {
    const user = await this.usersRepository.findOneByOrFail({ id: userId });
    const userProfile = await this.userProfilesRepository.findOne({
      where: { userId },
      relations: { user: true },
    });

    if (!userProfile) {
      throw new ApiError({ id: 'login-bonus-profile-not-found', message: 'User profile not found', code: 'USER_PROFILE_NOT_FOUND' });
    }

    // Calculate streaks based on login dates
    const loginDates = userProfile.loggedInDates.map(date => new Date(date)).sort((a, b) => b.getTime() - a.getTime());
    
    let currentStreak = 0;
    let longestStreak = 0;
    let previousDate = null;

    for (const loginDate of loginDates) {
      if (previousDate == null) {
        currentStreak = 1;
        longestStreak = 1;
      } else {
        const diffTime = Math.abs(previousDate.getTime() - loginDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          currentStreak++;
          longestStreak = Math.max(longestStreak, currentStreak);
        } else {
          currentStreak = 1;
        }
      }
      previousDate = loginDate;
    }

    return {
      totalPoints: user.points,
      totalAwards: loginDates.length,
      currentStreak,
      longestStreak,
    };
  }
}
