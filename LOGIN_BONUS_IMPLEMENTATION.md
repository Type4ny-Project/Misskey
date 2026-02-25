# Login Bonus Implementation Summary

## Overview
The login bonus feature is a system that rewards users with points for logging in. Points are accumulated in the `User.points` field and can be used for various purposes.

---

## Core Files & Components

### 1. **Backend Models**

#### `packages/backend/src/models/User.ts`
- **Field**: `points: number` (default: 0)
- **Comment**: "The accumulated points from login bonus and other sources."
- **Purpose**: Stores user's accumulated points balance

#### `packages/backend/src/models/UserProfile.ts`
- **Field**: `loggedInDates: string[]` (default: [])
  - Stores dates when user last logged in (format: `YYYY/M/D`)
  - Used to check if user already received bonus today
- **Field**: `loginBonusIsVisible: boolean` (default: true)
  - Controls whether login bonus points are visible on user profile
- **Field**: `notificationRecieveConfig: Record<...>`
  - Stores per-notification-type settings including `loginBonus`
  - Allows users to control which relationships receive login bonus notifications

#### `packages/backend/src/models/Meta.ts`
- **Field**: `enableLoginBonus: boolean` (default: false)
- **Purpose**: Server-wide toggle to enable/disable login bonus feature
- **Location**: Controlled by admins in `/admin/settings`

---

### 2. **Services**

#### `packages/backend/src/core/LoginBonusService.ts`
Main service managing all login bonus operations:

**Key Methods:**

1. **`awardLoginBonus(userId: string): Promise<LoginBonusAward | null>`**
   - Awards random points (1-5) to user if:
     - ✅ User hasn't logged in today
     - ✅ Feature is enabled (`meta.enableLoginBonus`)
     - ✅ User has permission (`policies.loginBonusGrantEnabled`)
   - Updates `User.points` directly
   - Creates notification of type `'loginBonus'`
   - Records login date in `loggedInDates`
   - Returns: `{ points: number, notificationId: string }` or `null`

2. **`getUserPoints(userId: string): Promise<number>`**
   - Returns user's current points balance

3. **`canReceiveLoginBonus(userId: string): Promise<boolean>`**
   - Checks if feature enabled and user has permission

4. **`getLoginBonusVisibility(userId: string): Promise<boolean>`**
   - Gets whether points are visible on profile

5. **`setLoginBonusVisibility(userId: string, isVisible: boolean): Promise<void>`**
   - Updates visibility setting

6. **`getLoginBonusNotificationConfig(userId: string)`**
   - Gets notification preferences for login bonus
   - Returns: `{ type: 'all'|'never'|'following'|'follower'|'mutualFollow'|'followingOrFollower'|'list', userListId?: string }`

7. **`setLoginBonusNotificationConfig(userId: string, config: {...}): Promise<void>`**
   - Updates notification preferences

8. **`getLoginHistory(userId: string): Promise<string[]>`**
   - Returns array of login dates

9. **`getLoginBonusStats(userId: string)`**
   - Returns: `{ totalPoints, totalAwards, currentStreak, longestStreak }`
   - Calculates login streaks based on consecutive days

#### `packages/backend/src/core/PointService.ts`
General points management service:

**Key Methods:**

1. **`sendPoints(senderId: string, recipientId: string, amount: number)`**
   - Transfers points between users
   - Validates: amount > 0, sender ≠ recipient, sender has balance
   - Returns: `{ success, senderBalance, recipientBalance }`

2. **`addPoints(userId: string, amount: number): Promise<number>`**
   - Adds points to user (for admin or other sources)
   - Returns new balance

3. **`getBalance(userId: string): Promise<number>`**
   - Returns user's current points balance

---

### 3. **API Endpoints**

#### `packages/backend/src/server/api/endpoints/i.ts` (GET /api/i)
**User's own profile endpoint** - Primary login bonus trigger

**Flow:**
```typescript
1. Get current date in YYYY/M/D format
2. Check if user already logged in today (in loggedInDates)
3. If NOT logged in today:
   - Check if feature enabled (meta.enableLoginBonus)
   - Check if user has permission (policies.loginBonusGrantEnabled)
   - Award random points 1-5 to User.points
   - Create notification of type 'loginBonus'
   - Append date to loggedInDates
4. Return user data
```

**Key Code:**
```typescript
const today = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;

if (!userProfile.loggedInDates.includes(today)) {
  // ... checks ...
  const bonusPoints = randomInt(1, 6); // 1-5 points
  await this.usersRepository.update(user.id, {
    points: currentUser.points + bonusPoints,
  });
  this.notificationService.createNotification(user.id, 'loginBonus', {
    points: bonusPoints,
  });
  // ... update loggedInDates ...
}
```

---

### 4. **Frontend (Admin Settings)**

#### `packages/frontend/src/pages/admin/settings.vue`
**Admin Panel Configuration**

**Form**: `loginBonusForm`
- **Field**: `enableLoginBonus: boolean`
- **Purpose**: Toggle login bonus feature server-wide
- State synced to `Meta.enableLoginBonus`

---

### 5. **Type Definitions**

#### `packages/backend/src/types.ts`
- **Notification Type**: `'loginBonus'` added to `notificationTypes` array
- Used for notification routing and configuration

---

### 6. **Database Migrations**

#### `packages/backend/migration/1768938654000-addLoginBonusColumns.js`
```sql
ALTER TABLE "user" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user_profile" ADD COLUMN "loginBonusIsVisible" BOOLEAN NOT NULL DEFAULT true;
```

#### `packages/backend/migration/1769400000000-addMetaEnableLoginBonus.js`
```sql
ALTER TABLE "meta" ADD COLUMN "enableLoginBonus" BOOLEAN NOT NULL DEFAULT false;
```

---

## How It Works: Flow Diagram

```
User Logs In (calls GET /api/i)
    ↓
Check: loggedInDates.includes(today)?
    ↓ NO (not logged in today)
    ├→ Check: meta.enableLoginBonus?
    │   ↓ YES
    │   ├→ Check: policies.loginBonusGrantEnabled?
    │   │   ↓ YES
    │   │   ├→ bonusPoints = randomInt(1, 6)
    │   │   ├→ User.points += bonusPoints
    │   │   ├→ Create notification 'loginBonus'
    │   │   └→ loggedInDates.push(today)
    │   ↓ NO → Skip bonus
    ↓ YES (already logged in today)
    └→ Skip bonus
    ↓
Return User Profile
```

---

## Permission System

**Role-based access control:**
- Field: `policies.loginBonusGrantEnabled` (from `RoleService`)
- Users without this permission cannot receive bonuses
- Controlled through role configuration system

---

## Data Flow: Points Management

### Adding Points
1. **Automatic** (via LoginBonusService)
   - `awardLoginBonus()` → directly updates `User.points`
   
2. **Manual** (via PointService)
   - `addPoints()` → admin/system use

3. **Transfer** (via PointService)
   - `sendPoints(from, to, amount)` → user-to-user transfers

### Checking Balance
```typescript
const balance = await pointService.getBalance(userId);
// or
const user = await usersRepository.findOneByOrFail({ id: userId });
console.log(user.points);
```

---

## Notification System Integration

**Notification Type**: `loginBonus`

**Notification Payload:**
```typescript
{
  points: number; // Number of points awarded
}
```

**User Configuration:**
- Stored in: `UserProfile.notificationRecieveConfig['loginBonus']`
- Options:
  - `{ type: 'all' }` - Show all login bonus notifications
  - `{ type: 'never' }` - Hide all
  - `{ type: 'following' }` - Only from users they follow
  - `{ type: 'follower' }` - Only from followers
  - `{ type: 'mutualFollow' }` - Only mutual follows
  - `{ type: 'followingOrFollower' }` - Either following or follower
  - `{ type: 'list', userListId: '...' }` - Only from specific list

---

## Statistics & Streaks

**LoginBonusService.getLoginBonusStats()** returns:
```typescript
{
  totalPoints: number;        // User's total accumulated points
  totalAwards: number;        // Total times bonus was awarded (= loggedInDates.length)
  currentStreak: number;      // Consecutive days logged in
  longestStreak: number;      // Best streak ever
}
```

**Streak Calculation:**
- Compares consecutive login dates
- If dates are exactly 1 day apart → streak continues
- Otherwise → streak resets to 1

---

## Key Implementation Details

### Points Range
- **Current**: Random 1-5 points per day
- **Code**: `randomInt(1, 6)` (6 is exclusive, so 1-5 inclusive)

### Login Date Format
- **Format**: `YYYY/M/D` (month and day not zero-padded)
- **Example**: `2025/1/5` for January 5, 2025

### Important Constraints
1. ✅ One bonus per user per day (checked via `loggedInDates`)
2. ✅ Feature must be enabled globally
3. ✅ User must have permission via role policy
4. ✅ Bonus awarded on first `/api/i` call each day
5. ✅ Notification is async (doesn't block response)

### Current Issues/Notes
- LoginBonusService uses `as any` in notification payload (line 79)
  - Proper typing could be improved
- Notification ID is hardcoded to empty string (line 88)
  - Could track notification creation for reference

---

## Related Files Summary

| File | Purpose | Key Content |
|------|---------|------------|
| `User.ts` | Model | `points` field |
| `UserProfile.ts` | Model | `loggedInDates`, `loginBonusIsVisible`, `notificationRecieveConfig` |
| `Meta.ts` | Model | `enableLoginBonus` |
| `LoginBonusService.ts` | Service | Award & manage bonuses |
| `PointService.ts` | Service | Generic point operations |
| `i.ts` | Endpoint | Primary bonus trigger |
| `types.ts` | Types | Notification type registration |
| `settings.vue` | Admin UI | Enable/disable toggle |
| Migration files | Database | Schema changes |

---

## Usage Examples

### Award bonus to user
```typescript
const result = await loginBonusService.awardLoginBonus(userId);
if (result) {
  console.log(`Awarded ${result.points} points`);
}
```

### Check if user can receive bonus
```typescript
const canReceive = await loginBonusService.canReceiveLoginBonus(userId);
```

### Get user's statistics
```typescript
const stats = await loginBonusService.getLoginBonusStats(userId);
console.log(`Current streak: ${stats.currentStreak} days`);
```

### Transfer points between users
```typescript
const result = await pointService.sendPoints(userId1, userId2, 100);
console.log(`New balance for user1: ${result.senderBalance}`);
```

---

## Summary

The login bonus system is a **player engagement mechanic** that:
- ✅ Awards 1-5 points daily on first login
- ✅ Tracks login streaks for achievement
- ✅ Allows users to control visibility & notifications
- ✅ Role-based permission control
- ✅ Server-wide toggle for admins
- ✅ Integrates with notification system
- ✅ Provides statistics API
- ✅ Supports point transfers

The implementation is **mature and functional**, with good separation of concerns between `LoginBonusService` and `PointService`.
