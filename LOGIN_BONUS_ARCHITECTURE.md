# Login Bonus Architecture & Data Flow

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (Vue.js)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────┐    ┌──────────────────────────────┐  │
│  │  Admin Settings Page     │    │   User Profile Display       │  │
│  │  (settings.vue)          │    │   (shows loginBonus stats)   │  │
│  │                          │    │                              │  │
│  │ • enableLoginBonus       │    │ • Points balance             │  │
│  │   toggle                 │    │ • Login streak               │  │
│  │                          │    │ • Login history              │  │
│  └──────────────────────────┘    └──────────────────────────────┘  │
│          │                                 ▲                         │
│          │ POST /admin/update              │                        │
│          ▼                                 │ GET /api/i              │
└─────────────────────────────────────────────────────────────────────┘
          │                                  │
          │                                  │
          ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Backend (NestJS)                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  API Layer                                                           │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Endpoint: GET /api/i (UserController)                      │    │
│  │ ─────────────────────────────────────────────────────────── │    │
│  │ 1. Check if loggedInDates.includes(today)                  │    │
│  │ 2. If NO:                                                   │    │
│  │    a. Fetch meta.enableLoginBonus                          │    │
│  │    b. Fetch user permissions (loginBonusGrantEnabled)      │    │
│  │    c. If both true → call LoginBonusService.awardBonus()  │    │
│  │ 3. Return packed user entity                               │    │
│  └────────────────────────────────────────────────────────────┘    │
│                           │                                          │
│                           ▼                                          │
│  Service Layer                                                       │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ LoginBonusService                                        │      │
│  │ ──────────────────────────────────────────────────────── │      │
│  │ • awardLoginBonus(userId)                                │      │
│  │   - Generate random points (1-5)                         │      │
│  │   - Update User.points                                   │      │
│  │   - Create 'loginBonus' notification                     │      │
│  │   - Append to loggedInDates                              │      │
│  │                                                          │      │
│  │ • getLoginBonusStats(userId)                             │      │
│  │   - Calculate streaks from loggedInDates                 │      │
│  │   - Return {totalPoints, totalAwards, streak info}       │      │
│  │                                                          │      │
│  │ • Visibility & Notification Config methods               │      │
│  └──────────────────────────────────────────────────────────┘      │
│         │                  │                 │                      │
│         ▼                  ▼                 ▼                      │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐       │
│  │ MetaService    │  │ RoleService  │  │ NotificationSvc │       │
│  │                │  │              │  │                 │       │
│  │ • fetch()      │  │ • getPolicies│  │ • createNotify()│       │
│  │ Checks enabled │  │ Checks perms │  │ Type: loginBonus│       │
│  └────────────────┘  └──────────────┘  └─────────────────┘       │
│                                                                      │
│  Repositories (Data Layer)                                          │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │ UsersRepository          UserProfilesRepository         │       │
│  │ ─────────────────────────────────────────────────────── │       │
│  │ Update: points           Update: loggedInDates          │       │
│  │         (increment)              (append)              │       │
│  │                          Get: notificationRecieveConfig │       │
│  │                          Get: loginBonusIsVisible       │       │
│  └─────────────────────────────────────────────────────────┘       │
│                           │                                         │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐      ┌──────────────────┐     ┌──────────┐        │
│  │ user        │      │ user_profile     │     │ meta     │        │
│  ├─────────────┤      ├──────────────────┤     ├──────────┤        │
│  │ id (PK)     │      │ userId (PK)      │     │ id (PK)  │        │
│  │ points      │◄─────│ loggedInDates[]  │     │ enable   │        │
│  │ ...         │      │ loginBonusVisible│     │ LoginBonus
│  │             │      │ notificationRec. │     │ ...      │        │
│  │             │      │ ...              │     │          │        │
│  └─────────────┘      └──────────────────┘     └──────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Daily Login Bonus

```
User Opens App (First Time Today)
            │
            ▼
┌─────────────────────────────────────┐
│ GET /api/i (endpoint call)          │
└─────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│ Parse date: today = YYYY/M/D        │
└─────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│ Fetch UserProfile                   │
│ (get loggedInDates array)           │
└─────────────────────────────────────┘
            │
            ▼
     ┌──────────────────┐
     │ Is today in      │ ─── YES ──► [Return user data] (skip bonus)
     │ loggedInDates?   │
     └──────────────────┘
            │ NO
            ▼
┌─────────────────────────────────────┐
│ Fetch Meta                          │
│ Check enableLoginBonus              │
└─────────────────────────────────────┘
            │
            ▼
     ┌──────────────────┐
     │ enableLoginBonus  │ ─── FALSE ─► [Return user data] (skip bonus)
     │ enabled?         │
     └──────────────────┘
            │ TRUE
            ▼
┌─────────────────────────────────────┐
│ Fetch User Policies via RoleService │
│ Check loginBonusGrantEnabled        │
└─────────────────────────────────────┘
            │
            ▼
     ┌──────────────────┐
     │ User has         │ ─── FALSE ─► [Return user data] (skip bonus)
     │ permission?      │
     └──────────────────┘
            │ TRUE (All checks passed!)
            ▼
┌─────────────────────────────────────┐
│ Award Bonus                         │
│ ┌─────────────────────────────────┐ │
│ │ 1. bonusPoints = random(1, 6)   │ │
│ │    (1-5 inclusive)              │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 2. User.points += bonusPoints   │ │
│ │    UPDATE user SET              │ │
│ │    points = points + 5          │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 3. Create Notification          │ │
│ │    type: 'loginBonus'           │ │
│ │    payload: {points: 5}         │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 4. Record Login Date            │ │
│ │    loggedInDates.push(today)    │ │
│ │    UPDATE user_profile SET      │ │
│ │    loggedInDates = [...]        │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│ Return User Profile                 │
│ (with updated points)               │
└─────────────────────────────────────┘
            │
            ▼
User sees "+5 points" notification
```

---

## State Model

```typescript
// User Entity
interface MiUser {
  id: string;
  // ... other fields
  points: number;  // ← Login bonus points accumulate here
}

// UserProfile Entity
interface MiUserProfile {
  userId: string;
  loggedInDates: string[];           // ← ["2025/1/1", "2025/1/2", "2025/1/3"]
  loginBonusIsVisible: boolean;      // ← false = hide points on profile
  notificationRecieveConfig: {
    loginBonus?: {
      type: 'all' | 'never' | 'following' | 'follower' | 'mutualFollow' | 'followingOrFollower' | 'list',
      userListId?: string;
    };
    // ... other notification types
  };
  // ... other fields
}

// Meta Entity
interface MiMeta {
  id: string;
  enableLoginBonus: boolean;  // ← Global feature toggle
  // ... other fields
}

// Notification Entity (created when bonus awarded)
interface Notification {
  userId: string;
  type: 'loginBonus';  // ← Special type for login bonus
  data: {
    points: number;  // ← Amount awarded (1-5)
  };
  // ... other fields
}
```

---

## Calculation: Login Streaks

```typescript
async getLoginBonusStats(userId: string) {
  const loginDates = userProfile.loggedInDates
    .map(date => new Date(date))
    .sort((a, b) => b.getTime() - a.getTime());  // Newest first
  
  let currentStreak = 0;
  let longestStreak = 0;
  let previousDate = null;
  
  for (const loginDate of loginDates) {
    if (previousDate == null) {
      // First iteration (today)
      currentStreak = 1;
      longestStreak = 1;
    } else {
      // Calculate days difference
      const diffMs = Math.abs(previousDate.getTime() - loginDate.getTime());
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        // Consecutive day!
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        // Gap in streak
        currentStreak = 1;
      }
    }
    previousDate = loginDate;
  }
  
  return {
    totalPoints: user.points,
    totalAwards: loginDates.length,
    currentStreak,
    longestStreak
  };
}
```

**Example:**
```
loggedInDates = ["2025/1/5", "2025/1/4", "2025/1/3", "2025/1/2", "2025/1/1"]
                  (today)

Iteration 1: currentStreak=1, longestStreak=1
Iteration 2: diff=1 day → currentStreak=2, longestStreak=2
Iteration 3: diff=1 day → currentStreak=3, longestStreak=3
Iteration 4: diff=1 day → currentStreak=4, longestStreak=4
Iteration 5: diff=1 day → currentStreak=5, longestStreak=5

Result: {currentStreak: 5, longestStreak: 5}
```

---

## Service Dependency Graph

```
EndpointController (i.ts)
    │
    ├─► UserEntityService (pack user)
    ├─► MetaService (check enableLoginBonus)
    ├─► RoleService (check permission)
    ├─► NotificationService (create notification)
    ├─► UsersRepository (get user, update points)
    └─► UserProfilesRepository (get profile, update loggedInDates)

LoginBonusService
    ├─► MetaService
    ├─► RoleService
    ├─► NotificationService
    ├─► UsersRepository
    └─► UserProfilesRepository

PointService
    └─► UsersRepository
```

---

## Database Schema Changes

```sql
-- Migration: 1768938654000-addLoginBonusColumns.js
ALTER TABLE "user" 
ADD COLUMN IF NOT EXISTS "points" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "user_profile" 
ADD COLUMN IF NOT EXISTS "loginBonusIsVisible" BOOLEAN NOT NULL DEFAULT true;

-- Migration: 1769400000000-addMetaEnableLoginBonus.js
ALTER TABLE "meta" 
ADD COLUMN IF NOT EXISTS "enableLoginBonus" BOOLEAN NOT NULL DEFAULT false;

-- Existing columns used:
-- user_profile.loggedInDates (VARCHAR[]) - already existed
-- user_profile.notificationRecieveConfig (JSONB) - already existed
```

---

## Role-Based Permissions

```
RoleService.getUserPolicies(userId)
    │
    └─► policies: {
        loginBonusGrantEnabled: boolean  ← Check this
        // ... other policies
      }

User receives bonus ONLY if:
  ✅ Meta.enableLoginBonus = true
  ✅ policies.loginBonusGrantEnabled = true
  ✅ !loggedInDates.includes(today)
```

---

## Notification Type Integration

```
notificationTypes Array (types.ts)
└── 'loginBonus' ← Added to this array

When bonus awarded:
notificationService.createNotification(userId, 'loginBonus', {
  points: 5
})

User's notification config (UserProfile.notificationRecieveConfig):
{
  loginBonus: {
    type: 'following'  // Only show if from followers
  }
}
```
