# Queue Dispatcher (Role 12) — Implementation Plan

## Goal
Allow a queue organization to be run by **many staff members**, not one person
(an admin may be sick — an alternative must always be available).

## Model
- **Queue Organization Admin (11)** = owner/super. Only 11 (or platform admin 3/6)
  can add / remove / activate / deactivate staff.
- **Queue Dispatcher (12)** = staff. Runs the queue day-to-day (check-in/out, status,
  offer dispatch, remove entry, lane override, advance/release, history) but **cannot
  manage members**.
- Queue-org memberships are **staff only** (roles 11, 12). Shippers/drivers are NOT
  members of a queue organization.
- Keep it **numeric (global role 12)** — no `QueueRoles` table, no company-parity refactor.

## Endpoints
| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| POST | `/api/queueOrganization/createUserByQueueAdmin` | 11 (or 3/6) | Queue Admin creates a Dispatcher (role 12) |
| POST | `/api/queueOrganization/:queueOrganizationUniqueId/members` | 11 (or 3/6) | Add staff (`roleId` 11 or 12) to an org |
| DELETE | `/api/queueOrganization/:queueOrganizationUniqueId/members/:membershipUniqueId` | 11 (or 3/6) | Remove staff |
| (all `DriverQueue.routes.js`) | check-in/out, status, offer, remove, lane override, advance/release, history | 11, 12, 3, 6 | Day-to-day queue operations |

## Configuration / Seed
- `Utils/ListOfSeedData.js`
  - `usersRoles.queueDispatcherRoleId = 12`
  - `usersRolesList.queueDispatcher = { roleId: 12, roleName: "Queue Dispatcher" }`
  - `roleList` row: `roleId 12`, name "Queue Dispatcher", description "queue org staff
    under the org admin: runs the dispatch queue but cannot add or remove staff."
- Seed role 12 into the live DB:
  `POST /api/admin/installPreDefinedData` (super-admin token) — idempotent ("already exists" skipped).

## Code Changes
1. **Validations/User.schema.js**
   - New `createUserByQueueAdmin`: `roleId` valid `[12]`, `fullName` + `phoneNumber` required.
   - `loginUser`, `verifyUserByOTP`: add `queueDispatcherRoleId` (12) to valid lists.
   - `createUser` (self-register) and `createUserByAdmin`: unchanged.

2. **Validations/QueueOrganization.schema.js**
   - `addMember` roleId valid → `[11, 12]` (drop shipper 1).
   - `getMembersQuery` roleId filter → `[11, 12]`.

3. **Services/User/User.registry.service.js**
   - New `createUserByQueueAdmin({ body, userUniqueId })`:
     - Guard `body.roleId === 12`.
     - Actor must be an active org-admin member (membership role 11)
       OR platform admin (UserRole 3/6).
     - Delegate to `createUserByAdminOrSuperAdmin`.
   - Include in module exports.

4. **Services/User.service.js** — wire `createUserByQueueAdmin` to the registry.

5. **Controllers/Auth/auth.controller.js**
   - New `createUserByQueueAdmin` handler (calls the service; deferred OTP/SMS with
     role name "Queue Dispatcher"); export it.

6. **Routes/auth/APIEndPoints.js + auth.routes.js**
   - `CREATE_USER_BY_QUEUE_ADMIN = "/api/queueOrganization/createUserByQueueAdmin"`.
   - Route: `verifyTokenOfAxios` → `verifyIfUserIsQueueOrgAdmin` →
     `validator(createUserByQueueAdmin)` → controller.

7. **Middleware/VerifyToken.js**
   - `verifyIfUserIsQueueOrgAdmin`: also allow role **12**.
   - `verifyIfUserIsAdminSuperAdminCompanyAdminOrQueueOrgAdmin` unchanged (org CRUD stays 11/3/6).

8. **Services/QueueOrganization.service.js**
   - New `assertCanAdministerMembers` guard: requires active membership with **roleId 11**
     (or platform admin 3/6). Used by `addMember`, `activateQueueMember`,
     `deactivateQueueMember`, `deleteQueueMember`.
   - `getMembers` keeps "any active member" (read-only for dispatchers).
   - `getQueueOrganizations` / `getQueueOrganization` membership scope → roles **11 OR 12**,
     so dispatchers see only their own org(s).

9. **Services/DriverQueue.service.js:4077** and **Services/DriverQueue/lifecycle.service.js:559**
   - Entry-history `isAdmin` bypass: also allow role **12** (dispatchers review any
     entry's history in their org).

10. **Suspension enforcement (active-membership gate)** — deactivating a staff
    membership actually revokes power:
    - `Middleware/VerifyToken.js` `verifyIfUserIsQueueOrgAdmin`: for roles 11/12,
      resolves the target org (params → body → query → via the queue entry for
      entry-based routes) and requires an **active** membership row
      (`roleId IN (11,12)`, `isActive = 1`, `membershipDeletedAt IS NULL`). Platform
      admins 3/6 always pass.
    - `Services/DriverQueue.service.js` `getEntryHistory`: same active-membership
      check in the entry-history route (drivers keep their own-entry access; that
      route is not middleware-gated).
    - Verified: active dispatcher → 200; `PATCH .../members/:membershipId/deactivate`
      → same call 403 "suspended or not active staff member"; reactivate → 200.

## Power Matrix
| Action | 11 (Org Admin) | 12 (Dispatcher) | 3/6 (Platform) |
|--------|:---:|:---:|:---:|
| Create dispatcher (`createUserByQueueAdmin`) | ✓ | ✗ | ✓ |
| Add / remove / activate / deactivate staff | ✓ | ✗ | ✓ |
| List members / view org(s) | ✓ | ✓ | ✓ |
| Run the queue (check-in/out, status, offer, remove, lane override, advance/release) | ✓ | ✓ | ✓ |
| View any entry history | ✓ | ✓ | ✓ |
| Create / edit / delete a queue org | ✓ | ✗ | ✓ |

## Verification
1. `node --check` on all edited files.
2. Restart server; confirm roles list includes **12: Queue Dispatcher**.
3. Smoke (super-admin token):
   - `POST /api/queueOrganization/createUserByQueueAdmin` `{fullName, phoneNumber, roleId:12}` → user created.
   - `POST /api/queueOrganization/:id/members` `{userUniqueId, roleId:12}` → success.
   - `roleId:1` on add member → 400 "must be one of [11, 12]".
   - Login/OTP as role 12 works; queue endpoints accessible; member add/remove → 403 for dispatcher.
4. Queue E2E suite unchanged (it only reads role-11 creator memberships).

## Out of Scope
- `QueueRoles` table / company-parity refactor.
- "Only one org admin (11) per org" enforcement.
- Shippers/drivers as membership roles.