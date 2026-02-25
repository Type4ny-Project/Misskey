# Login Bonus Documentation Index

This directory contains comprehensive documentation for the Misskey Login Bonus feature implementation.

## 📚 Documentation Files

### 1. **LOGIN_BONUS_IMPLEMENTATION.md** (348 lines)
**Comprehensive implementation guide** - Start here for complete understanding
- Overview of the feature
- Core files and components breakdown
- Service methods and their purposes
- API endpoint flow
- Frontend controls
- Type definitions
- Database migrations
- Complete data flow diagrams
- Permission system
- Notification integration
- Statistics and streak calculations
- Code examples and usage patterns

👉 **Best for:** Understanding the full system architecture and how all pieces fit together

---

### 2. **LOGIN_BONUS_QUICK_REF.md** (185 lines)
**Quick reference guide** - For quick lookups and checklists
- Files at a glance
- Key facts table
- Method quick lookup reference
- Database schema summary
- Common operations
- Testing checklist
- Known limitations
- Integration points

👉 **Best for:** Quick lookups, during development, testing, and debugging

---

### 3. **LOGIN_BONUS_ARCHITECTURE.md** (373 lines)
**Visual system design** - ASCII diagrams and data flow charts
- System architecture diagram
- Data flow: Daily login bonus process
- State model (TypeScript interfaces)
- Calculation: Login streak algorithm
- Service dependency graph
- Database schema changes
- Role-based permissions
- Notification type integration

👉 **Best for:** Understanding system design, integration points, and data flow

---

## 🎯 Quick Navigation

### I want to...

**Understand the whole system**
→ Read `LOGIN_BONUS_IMPLEMENTATION.md` completely

**Find a specific method**
→ Check `LOGIN_BONUS_QUICK_REF.md` > "Method Quick Lookup"

**See how data flows**
→ Look at `LOGIN_BONUS_ARCHITECTURE.md` > "Data Flow" diagrams

**Modify the award algorithm**
→ Edit `/packages/backend/src/core/LoginBonusService.ts`
→ Reference: `LOGIN_BONUS_IMPLEMENTATION.md` > "LoginBonusService"

**Add a new API endpoint**
→ Check: `LOGIN_BONUS_ARCHITECTURE.md` > "Service Dependency Graph"
→ Inject: `LoginBonusService`, `LoginBonusService`

**Enable/disable the feature**
→ Go to `/admin/settings`
→ See: `LOGIN_BONUS_IMPLEMENTATION.md` > "Frontend (Admin Settings)"

**Test the implementation**
→ Follow: `LOGIN_BONUS_QUICK_REF.md` > "Testing Checklist"

**Debug a streak calculation issue**
→ See: `LOGIN_BONUS_ARCHITECTURE.md` > "Calculation: Login Streaks"

**Understand permission system**
→ Read: `LOGIN_BONUS_QUICK_REF.md` > "Key Facts" table
→ Then: `LOGIN_BONUS_ARCHITECTURE.md` > "Role-Based Permissions"

---

## 📋 File Map

```
Project Root: /Users/mattyatea/WebstormProjects/misskey-typeany/

Backend Implementation:
├── packages/backend/src/core/
│   ├── LoginBonusService.ts          ← Main service (249 lines)
│   └── PointService.ts               ← Point operations (107 lines)
│
├── packages/backend/src/models/
│   ├── User.ts                       ← points field
│   ├── UserProfile.ts                ← loggedInDates, config (384 lines)
│   └── Meta.ts                       ← enableLoginBonus toggle
│
├── packages/backend/src/server/api/endpoints/
│   └── i.ts                          ← Main bonus trigger (107 lines)
│
├── packages/backend/src/
│   └── types.ts                      ← 'loginBonus' notification type
│
└── packages/backend/migration/
    ├── 1768938654000-addLoginBonusColumns.js
    └── 1769400000000-addMetaEnableLoginBonus.js

Frontend Implementation:
└── packages/frontend/src/pages/admin/
    └── settings.vue                  ← Admin toggle

Documentation:
├── LOGIN_BONUS_IMPLEMENTATION.md     ← THIS DIRECTORY
├── LOGIN_BONUS_QUICK_REF.md
└── LOGIN_BONUS_ARCHITECTURE.md
```

---

## 🔑 Key Concepts at a Glance

| Concept | Details | File |
|---------|---------|------|
| **Award Trigger** | First `/api/i` call each day | i.ts |
| **Award Amount** | 1-5 points randomly | LoginBonusService |
| **Storage** | `User.points` field | User.ts |
| **Daily Check** | `UserProfile.loggedInDates` | UserProfile.ts |
| **Feature Toggle** | `Meta.enableLoginBonus` | Meta.ts, settings.vue |
| **Permission** | `policies.loginBonusGrantEnabled` | RoleService |
| **Notification** | Type `'loginBonus'` | types.ts |
| **Visibility** | `UserProfile.loginBonusIsVisible` | UserProfile.ts |

---

## 🔍 Search Tips

**Looking for where bonus is awarded?**
→ Search files for: `awardLoginBonus` or `randomInt(1, 6)`

**Looking for date format?**
→ Search: `YYYY/M/D` or `getFullYear`

**Looking for notification logic?**
→ Search: `'loginBonus'` or `createNotification`

**Looking for streak calculation?**
→ Search: `currentStreak` or `longestStreak`

**Looking for permission checks?**
→ Search: `loginBonusGrantEnabled` or `policies`

---

## ✅ Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Database schema | ✅ Complete | 2 migrations deployed |
| LoginBonusService | ✅ Complete | All methods implemented |
| PointService | ✅ Complete | Transfer and add operations |
| API endpoint | ✅ Complete | Integrated in i.ts |
| Admin settings | ✅ Complete | Toggle working |
| Notification integration | ✅ Complete | Type registered |
| Streak calculation | ✅ Complete | Algorithm implemented |
| Statistics API | ✅ Complete | All stats available |
| Role-based permissions | ✅ Complete | Checked on award |

---

## ⚠️ Known Issues

1. **Type Safety** (LoginBonusService.ts:79)
   - Notification payload uses `as any`
   - Could be improved with proper typing

2. **Notification ID** (LoginBonusService.ts:88)
   - Hardcoded to empty string
   - Could track actual notification creation

3. **Date Format** (i.ts:63)
   - Month/day not zero-padded: `${now.getMonth() + 1}`
   - Could cause issues with comparisons
   - Consider: `String(now.getMonth() + 1).padStart(2, '0')`

---

## 🚀 Getting Started

### For First-Time Readers:
1. Start with **Quick Ref** to understand key facts
2. Read **Implementation** for complete overview
3. Review **Architecture** diagrams for integration

### For Modifications:
1. Check **Quick Ref** for file locations
2. Review **Implementation** for method signatures
3. Test against **Testing Checklist**

### For Integration:
1. Study **Architecture** > "Service Dependency Graph"
2. Check **Implementation** > "Usage Examples"
3. Follow **Quick Ref** > "Integration Points"

---

## 📝 Notes for Contributors

- Login bonus is **automatic** - no claim/collection mechanism
- Awards happen at **first `/api/i` call** each day
- Points are **non-fungible** (specific to this feature)
- Notifications are **optional** (user configurable)
- Feature requires **admin toggle** + user role permission

---

## 🔗 Related Files in Project

- User model: `packages/backend/src/models/User.ts`
- User profile: `packages/backend/src/models/UserProfile.ts`
- Meta/config: `packages/backend/src/models/Meta.ts`
- Notification service: `packages/backend/src/core/NotificationService.ts`
- Role service: `packages/backend/src/core/RoleService.ts`
- Type definitions: `packages/backend/src/types.ts`
- Admin settings: `packages/frontend/src/pages/admin/settings.vue`

---

## 📞 Questions?

Refer to the documentation files:
- **What?** → LOGIN_BONUS_IMPLEMENTATION.md
- **Where?** → LOGIN_BONUS_QUICK_REF.md
- **How?** → LOGIN_BONUS_ARCHITECTURE.md

---

*Documentation generated: February 26, 2025*
*Project: Misskey Type4ny*
