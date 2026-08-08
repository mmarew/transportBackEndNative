# Plan: Single Reusable User-Provisioning Pipeline for Main E2E + Queue

Companion to `TEST_ROADMAP.md` (item P1).

## 1. Goal

One canonical, idempotent user pipeline (`create → verify → login → account fetch`) used by **every** suite (main E2E, Queue, and all sub-suites). Every role — `driver`, `shipper`, `systemAdmin`, `companyAdmin`, `queueAdmin`, `supperAdmin`, `admin` — is provisioned **once per run** and **reused everywhere** via `usersData`. No duplicated create/verify/login logic anywhere.

## 2. Target architecture

```
E2ETests/Auth/
  authApi.js        ← LOW-LEVEL: create / verifyOTP / login / fetchAccount (only file that talks to AUTH_ENDPOINTS)
  ensureUser.js     ← SINGLE entry point: ensureUser({userType, options})
  index.js          ← backward-compat wrappers (thin, then deleted)
  bootstrap.js      ← ensureCoreUsers(): provisions all 7 roles once, in order
```

## 3. `ensureUser({ userType, options })` contract

The single reusable function:

- **Idempotent**: if `usersData[userType].token` is set (and `options.force` not passed) → return cached user immediately. *Once a user is created, use that user only.*
- Otherwise: `create → verify → login → fetch account` and cache **every** step result back into `usersData[userType]` (token, accountData, authState).
- **Role-aware provisioning** via a `provisioners` map, so one function handles all roles:

| userType | create path | post-verify |
|---|---|---|
| `supperAdmin` | skip create (pre-seeded) | verify+login only |
| `admin` | `CREATE_USER_BY_ADMIN` with supperAdmin token | verify+login |
| `systemAdmin`, `companyAdmin`, `queueAdmin`, `shipper`, `driver` | public create | role account fetch |
| queue drivers | public create + admin `userRoleStatus → ACTIVE` | account fetch |

- **Step skipping**: each step records `authState` (`created|verified|loggedIn|ready`) so a partially-built user resumes instead of redoing work — no mid-run re-creation.

## 4. `bootstrap.js / ensureCoreUsers()`

Called once by both `E2ETests/index.js` and `E2ETests/Queue/index.js` (and available to any standalone suite). Provisions all 7 roles in dependency order: `supperAdmin → admin → companyAdmin → systemAdmin → queueAdmin → driver → shipper`, then freezes them. Queue drivers 2–4 are provisioned through the same pipeline with a `count` option (`ensureUser({ userType: "queueDriver", count: 2 })`), removing `seedQueueUsers()`.

## 5. Refactor matrix (kill the duplication)

| File | Today | After |
|---|---|---|
| `Auth/index.js` | two workflow fns | thin wrappers → delete |
| `Auth/RegisterUser.js`, `VerifyByOtp.js`, `LoginUser.js` | standalone | folded into `authApi.js` |
| `DataBaseManagement/index.js` | `testVerifyAndLoginUser(supperAdmin)` | `ensureUser({userType:"supperAdmin"})` |
| `Admin/index.js` | inline admin-create | `ensureUser({userType:"admin"})` |
| `Driver/index.js` | `testAuthWorkFlow({userType})` | `ensureUser({userType})` |
| `Shipper/Index.js`, `Company/index.js` | `testAuthWorkFlow({userType})` | `ensureUser({userType})` |
| `Queue/index.js` | `seedQueueUsers` + inline admin-create | `ensureCoreUsers()` |
| `Queue/helpers.js` | `registerQueueDrivers`, `registerQueueOrgAdmin`, `ensureShipper` | thin calls to `ensureUser` (helpers keep only queue-specific onboarding: vehicle + activation) |
| `constants.js` | runtime-injected queue users, no systemAdmin | add canonical `systemAdmin`, `queueAdmin` (+ `queueDriver` def), document canonical keys |

## 6. Sequencing & acceptance criteria

- **Sequence**: build `authApi.js` → `ensureUser.js` → `bootstrap.js` → migrate call sites (one suite at a time, verifying each) → delete old wrappers + `seedQueueUsers`.
- **Verify each step**: run main E2E and Queue independently AND Queue integrated into main, confirming the whole run reuses one `driver`/`shipper`/etc. (assert via a counter inside `ensureUser`: create+verify+login each fire once per role per run).
- **Acceptance**: `report` shows no duplicate creates; grep shows zero remaining direct `testAuthWorkFlow`/`CREATE_USER` callers outside `authApi.js`; main + Queue both green with the same `usersData` users.

## 7. Open decision before coding

`systemAdmin`: currently there is **no** dedicated systemAdmin user (system-admin endpoints run with the admin token). Either:
- (a) add a canonical `systemAdmin` role-5 user, or
- (b) alias `systemadmin → admin`.

This decides whether system-admin suites switch tokens.
