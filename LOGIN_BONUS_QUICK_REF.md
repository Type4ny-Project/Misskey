# Login Bonus Quick Reference

## Files at a Glance

### Core Files (7 files total)

```
Backend:
├── packages/backend/src/core/
│   ├── LoginBonusService.ts          # Main service
│   └── PointService.ts               # Point operations
├── packages/backend/src/models/
│   ├── User.ts                       # points field
│   ├── UserProfile.ts                # loggedInDates, visibility, config
│   └── Meta.ts                       # enableLoginBonus toggle
├── packages/backend/src/server/api/endpoints/
│   └── i.ts                          # Bonus award trigger
├── packages/backend/src/
│   └── types.ts                      # 'loginBonus' notification type
├── packages/backend/migration/
│   ├── 1768938654000-addLoginBonusColumns.js
│   └── 1769400000000-addMetaEnableLoginBonus.js

Frontend:
└── packages/frontend/src/pages/admin/
    └── settings.vue                  # Admin control (enableLoginBonus form)
```

## Key Facts

| Aspect | Details |
|--------|---------|
| **Award Trigger** | First `/api/i` call each day |
| **Award Amount** | 1-5 points randomly |
| **Daily Limit** | 1 per user per day |
| **Stored In** | `User.points` field |
| **Checked Via** | `UserProfile.loggedInDates` array |
| **Date Format** | `YYYY/M/D` |
| **Admin Control** | `Meta.enableLoginBonus` boolean |
| **Permission** | `policies.loginBonusGrantEnabled` from role |
| **Notification Type** | `'loginBonus'` |
| **Visibility Setting** | `UserProfile.loginBonusIsVisible` |

## Method Quick Lookup

### LoginBonusService
```typescript
// Award bonus (returns {points, notificationId} or null)
awardLoginBonus(userId: string): Promise<LoginBonusAward | null>

// Get user's current points
getUserPoints(userId: string): Promise<number>

// Check eligibility
canReceiveLoginBonus(userId: string): Promise<boolean>

// Visibility
getLoginBonusVisibility(userId: string): Promise<boolean>
setLoginBonusVisibility(userId: string, isVisible: boolean): Promise<void>

// Notifications
getLoginBonusNotificationConfig(userId: string): Promise<{type, userListId?}>
setLoginBonusNotificationConfig(userId: string, config: {...}): Promise<void>

// History & Stats
getLoginHistory(userId: string): Promise<string[]>
getLoginBonusStats(userId: string): Promise<{
  totalPoints, totalAwards, currentStreak, longestStreak
}>
```

### PointService
```typescript
// Add points
addPoints(userId: string, amount: number): Promise<number>

// Get balance
getBalance(userId: string): Promise<number>

// Transfer
sendPoints(senderId: string, recipientId: string, amount: number): Promise<{
  success, senderBalance, recipientBalance
}>
```

## Important Code Snippets

### Where Bonus is Awarded (i.ts endpoint)
```typescript
const today = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;

if (!userProfile.loggedInDates.includes(today)) {
  const meta = await this.metaService.fetch();
  if (meta.enableLoginBonus) {
    const policies = await this.roleService.getUserPolicies(user.id);
    if (policies.loginBonusGrantEnabled) {
      const bonusPoints = randomInt(1, 6); // 1-5
      await this.usersRepository.update(user.id, {
        points: currentUser.points + bonusPoints,
      });
      this.notificationService.createNotification(user.id, 'loginBonus', {
        points: bonusPoints,
      });
      await this.userProfilesRepository.update({ userId: user.id }, {
        loggedInDates: [...userProfile.loggedInDates, today],
      });
    }
  }
}
```

### Streak Calculation (LoginBonusService)
```typescript
// Iterates through login dates (sorted newest first)
// If diff between dates == 1 day: currentStreak++
// Otherwise: currentStreak = 1
```

## Database Schema

```sql
-- Users table
ALTER TABLE "user" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;

-- UserProfile table
ALTER TABLE "user_profile" ADD COLUMN "loggedInDates" VARCHAR[] DEFAULT '{}';
ALTER TABLE "user_profile" ADD COLUMN "loginBonusIsVisible" BOOLEAN NOT NULL DEFAULT true;

-- Meta table
ALTER TABLE "meta" ADD COLUMN "enableLoginBonus" BOOLEAN NOT NULL DEFAULT false;

-- UserProfile has JSONB column: notificationRecieveConfig
-- Contains: notificationRecieveConfig['loginBonus'] = {type: string, userListId?: string}
```

## Common Operations

### Enable/Disable Bonus (Admin)
- Go to `/admin/settings`
- Find `loginBonusForm.enableLoginBonus` toggle

### Check if Today's Bonus Given
```typescript
const today = `${new Date().getFullYear()}/${new Date().getMonth() + 1}/${new Date().getDate()}`;
const hasBonus = userProfile.loggedInDates.includes(today);
```

### Get Total Points
```typescript
const user = await usersRepository.findOneByOrFail({ id: userId });
const totalPoints = user.points;
```

### View User's Statistics
```typescript
const stats = await loginBonusService.getLoginBonusStats(userId);
// Returns: {totalPoints, totalAwards, currentStreak, longestStreak}
```

## Testing Checklist

- [ ] Feature toggle works (Meta.enableLoginBonus)
- [ ] Permission check works (role policy)
- [ ] Points awarded (1-5 range)
- [ ] Login date recorded (YYYY/M/D format)
- [ ] Only once per day per user
- [ ] Notification sent
- [ ] Streak calculated correctly
- [ ] Visibility setting respected
- [ ] Notification config respected

## Known Limitations

- ⚠️ Uses `as any` in notification payload (type safety gap)
- ⚠️ Notification ID hardcoded to empty string
- ⚠️ Month/day not zero-padded in date format (could cause issues?)
- ℹ️ No claim/collection mechanism - automatic on login

## Integration Points

- **RoleService**: For permission checking
- **MetaService**: For feature toggle
- **NotificationService**: For creating notifications
- **UsersRepository**: For points storage
- **UserProfilesRepository**: For login dates tracking
