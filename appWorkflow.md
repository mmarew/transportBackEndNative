# Application Workflow — Users, Roles & Statuses

> **Purpose:** A complete, step-by-step guide — from empty database to fully operational users with role assignments and status lifecycle — written so every team member can understand the system, and so every E2E test can serve as a validation checkpoint.

---

## 1. Data Model — Core Tables

All tables live in `Database/Database.js`. Every `*UniqueId` column is a UUID natural key; all are soft-deletable via `isDeleted` + `*DeletedAt` + `*DeletedBy`.

| Table                     | Purpose                                               | Key Relationships                                                                     |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Users**                 | One row per human / system actor                      | `userUniqueId` (PK UUID), `phoneNumber` + `email` (unique identity pair)              |
| **Roles**                 | Global role definitions (driver, shipper, admin)      | `roleId` (PK int) — referenced everywhere                                             |
| **UserRole**              | Join: assigns a role to a user                        | FK`userUniqueId -> Users`, FK `roleId -> Roles`; **unique on (userUniqueId, roleId)** |
| **Statuses**              | Global status definitions (Active, Inactive-\*)       | `statusId` (PK int)                                                                   |
| **UserRoleStatusCurrent** | Exactly one active status per role assignment         | FK`userRoleId -> UserRole`, FK `statusId -> Statuses`                                 |
| **UserRoleStatusHistory** | Immutable audit log of every status transition        | FK`userRoleId -> UserRole`, previous + new status IDs                                 |
| **usersCredential**       | Auth credentials (password hash + verification flags) | FK`userUniqueId -> Users`; one row per user                                           |
| **UsersHistory**          | Audit trail of all user record changes                | FK`userUniqueId -> Users`                                                             |

### Key invariant

`UserRoleStatusCurrent` is **insert-only** — a new status is never written on top of an existing one. Status transitions are performed by `updateUserRoleStatus`, which moves the current row to history before inserting the new one.

---

## 2. Seed Data — What Exists Before Any User Is Created

Installed at database initialization (endpoint: `installPreDefinedData`), these rows populate the `Roles` and `Statuses` tables. They cannot be re-seeded — the seed system checks for existing rows.

### 2.1 Roles (`roleList`)

| ID  | Name                 | Notes                                       |
| --- | -------------------- | ------------------------------------------- |
| 1   | **Shipper**          | Creates transport requests                  |
| 2   | **Driver**           | Accepts / fulfills transport requests       |
| 3   | **Admin**            | System management; admin-panel operator     |
| 4   | **Vehicle Owner**    | Owns vehicles in the fleet                  |
| 5   | **System**           | Automated system processes (no human login) |
| 6   | **Super Admin**      | Highest privilege; creates admins           |
| 7   | **Unknown Role**     | Default for unclassified registrations      |
| 8   | **Company Admin**    | Manages company-level operations            |
| 9   | **Queue Org Admin**  | Manages queue/dispatch org                  |
| 10  | **Queue Dispatcher** | Dispatch within a queue org                 |
| 11  | **Dispatcher**       | General dispatch role                       |
| 12  | **Vehicle Entity**   | Vehicle-level operations                    |

Roles 8-12 are added by the application after initial seeding. E2E tests reference all 12 via `UsersRoles` constants in `E2ETests/constants.js`.

### 2.2 Statuses (`statusList`)

| ID  | Name                                      | Meaning                                 |
| --- | ----------------------------------------- | --------------------------------------- |
| 1   | **Active**                                | Fully operational; all requirements met |
| 2   | **Inactive - Vehicle Not Registered**     | Driver has no registered vehicle        |
| 3   | **Inactive - Required Documents Missing** | Missing mandatory documentation         |
| 4   | **Inactive - Documents Rejected**         | Submitted documents were rejected       |
| 5   | **Inactive - Documents Pending**          | Documents awaiting review               |
| 6   | **Inactive - User Banned**                | Admin-banned                            |
| 7   | **Inactive - No Subscription**            | No active subscription (drivers)        |

---

## 3. Bootstrap Flow — How the First Users Appear

Before any user can log in, the server must create two system users. This happens at application startup (not via API):

```
Server start
  +-- createUserSystem()           [Services/User/User.registry/system.service.js]
       |-- system (roleId=5, statusId=1 ACTIVE)
       +-- Supper Admin (roleId=6, statusId=1 ACTIVE)
```

Both are created via `createUserByAdminOrSuperAdmin` with:

- Credentials sourced from `Config.SUPER_ADMIN.{FULL_NAME, PHONE, EMAIL, TEMP_PASSWORD}`
- `userUniqueId` hardcoded: `"system"` and `"Supper Admin"`
- Status **Active (1)** immediately — no verification step

E2E verification: `E2ETests/Auth/bootstrap.js` calls `apiLoginUser` for supperAdmin; the test suite asserts the test password is accepted and a JWT is returned.

---

## 4. User Provisioning — The Three Paths

All paths converge on `handleUserRoleStatus()` in `credentials.service.js`, which inserts the `UserRole` row and the initial `UserRoleStatusCurrent` row.

### Path A — Public Self-Register

**Endpoint:** `POST /api/user/createUser`

| Field                       | Required | Notes                                          |
| --------------------------- | -------- | ---------------------------------------------- |
| `fullName`                  | yes      | Display name                                   |
| `phoneNumber`               | yes      | Primary identity (normalized internally)       |
| `email`                     | optional | Auto-generated placeholder if absent           |
| `roleId`                    | yes      | Must be a public role (1, 2, 8, 9)             |
| `statusId`                  | optional | Validated if present; no status row if omitted |
| `userRoleStatusDescription` | optional | Stored with initial status                     |

**Flow:**

```
POST /api/user/createUser
  |-- Phone lookup (+ email if non-placeholder)
  |    |-- FOUND  -> handleExistingUser -> OTP login (no new account)
  |    +-- NOT FOUND -> registerNewUser()
  |         |-- Insert -> Users
  |         |-- Insert -> UserRole (roleId)
  |         |-- Insert -> UserRoleStatusCurrent (statusId if provided)
  |         |-- Insert -> usersCredential (rawPassword, verified=0)
  |         +-- Send OTP (SMS + optional email)
  +-- Return { phone, email, needsOtp }
```

**Special case — Street hail:** `requestedFrom: "street"` allows a driver to register a shipper using a phone already tied to a different real email. This bypasses the identity-hijacking guard.

E2E: `E2ETests/Auth/User.js` — `apiCreateUser` (line 63); `E2ETests/Auth/ensureUser.js` (line 170) calls this for driver/shipper.

### Path B — Admin / Super Admin Creates a User

**Endpoint:** `POST /api/admin/createUserByAdminOrSuperAdmin`

Same field set, but no `requestedFrom` — admin is the actor; `userUniqueId` in the header identifies the admin.

| Who can call         | What roles they can assign                     |
| -------------------- | ---------------------------------------------- |
| Super Admin (role 6) | Admin (3), CompanyAdmin (8), QueueOrgAdmin (9) |
| Admin (role 3)       | CompanyAdmin (8), QueueOrgAdmin (9)            |

**Flow:**

```
POST /api/admin/createUserByAdminOrSuperAdmin
  |-- Validate caller's role + requested role
  |-- Insert -> Users
  |-- Insert -> UserRole + UserRoleStatusCurrent
  |-- Insert -> usersCredential (rawPassword, verified=0)
  +-- Return { userUniqueId }
```

E2E: `E2ETests/Auth/User.js` — `apiCreateUserByAdmin` (line 74); `E2ETests/Auth/ensureUser.js` (line 210) calls this for admin, companyAdmin, queueOrgAdmin.

### Path C — Queue Admin Creates a User

**Endpoint:** `POST /api/queueOrganization/createUserByQueueAdmin`

Wraps Path B internally (delegates to `createUserByAdminOrSuperAdmin`). Used for dispatchers and drivers within a queue organization.

E2E: `E2ETests/Auth/ensureUser.js` (line 242).

### Provisioning Order in E2E Tests

The `bootstrap.js` file defines `CORE_USER_TYPES` — dependency order that must be respected:

```javascript
const CORE_USER_TYPES = [
  "supperAdmin", // 1. Seed; login only (status ACTIVE, verified)
  "systemAdmin", // 2. Created by supperAdmin (path B)
  "admin", // 3. Created by supperAdmin (path B)
  "companyAdmin", // 4. Created by admin (path B)
  "queueOrgAdmin", // 5. Created by admin (path B)
  "driver", // 6. Self-register (path A)
  "shipper", // 7. Self-register (path A)
];
```

Each role depends on the previous:

- supperAdmin must exist to call `createUserByAdminOrSuperAdmin`
- admin must exist to create companyAdmin and queueOrgAdmin
- companyAdmin / queueOrgAdmin must exist for queue-related operations

---

## 5. Verify — OTP and Email/Phone

### 5.1 Verify by OTP

**Endpoint:** `POST /api/user/verifyUserByOTP`

```json
{ "phoneNumber": "+2519...", "OTP": "123456", "roleId": 2 }
```

- `roleId` is required — a user can hold multiple roles; the OTP verifies a specific role
- Sets `usersCredential.verified = 1`
- JWT is returned on success

E2E: `E2ETests/Auth/VerifyByOtp.js`; `ensureUser.js` calls `apiVerifyUserByOTP` (line 337) for all non-system roles.

### 5.2 Verify Email

**Endpoints:**

- `GET /api/user/verify-email?token=<jwt>` — single-click from email link
- `POST /api/user/verify-email` — programmatic; body: `{ verificationCode }`
- `POST /api/user/verification-link` — request a new verification link

### 5.3 Verify Phone

**Endpoint:** `POST /api/user/verify-phone`

---

## 6. Login — JWT Issued

**Endpoint:** `POST /api/user/loginUser`

```json
{ "phoneNumber": "+2519...", "password": "..." }
```

**Guards:**

- Account must exist
- Password must match
- OTP must be verified (`usersCredential.verified = 1`)
- At least one role must have `statusId = 1` (Active) — otherwise rejected

**Returns:**

```json
{ "accessToken": "<JWT>", "refreshToken": "<JWT>", "user": {...} }
```

E2E: `E2ETests/Auth/authApi.js` — `apiLoginUser` (line 93); `ensureUser.js` (line 358) calls this for all non-system roles.

---

## 7. Role = The Key — Role-Centric Authorization

Once a user is created and verified, **role determines everything**:

- Which API endpoints are accessible
- Which account profile is returned
- What data the user can see/modify

### 7.1 Account Endpoints (per-role)

| Role             | Account Endpoint                | Docs reference               |
| ---------------- | ------------------------------- | ---------------------------- |
| Driver (2)       | `GET /api/driver/account`       | `E2ETests/Auth/Account.js:3` |
| Shipper (1)      | `GET /api/shipper/account`      | same file                    |
| CompanyAdmin (8) | `GET /api/companyAdmin/account` | same file                    |
| Dispatcher (11)  | `GET /api/dispatcher/account`   | same file                    |
| All              | `GET /api/me/account`           | Me profile                   |
| All              | `GET /api/account/status`       | Current status for caller    |

### 7.2 Role and UserRole CRUD

**Roles** — definitions (`Routes/Role.routes.js`, mounted at `/api/admin/roles`):

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/admin/roles/` | Create a role definition |
| GET | `/api/admin/roles/` | All roles (pagination + search) |
| PUT | `/api/admin/roles/:roleUniqueId` | Update a role (admin identity required) |
| DELETE | `/api/admin/roles/:roleUniqueId` | Delete a role |

**UserRole** — assignments of users to roles (`Routes/UserRole.routes.js`, mounted at `/api/admin/userRole`):

| Method | Endpoint | Purpose | Guard |
|---|---|---|---|
| POST | `/api/admin/userRole/create` | Assign a role to a user | supperAdmin only |
| GET | `/api/admin/userRole/filter` | User-role list with pagination/filters | admin identity |
| PUT | `/api/admin/userRole/:userRoleUniqueId` | Update an assignment | token |
| DELETE | `/api/admin/userRole/:userRoleUniqueId` | Un-assign a role | token |

E2E: `E2ETests/Roles/index.js` (roles), user-role assignment also covered throughout `E2ETests/Auth/`.

### 7.3 Authorization pattern

Every protected route verifies:

1. JWT is valid
2. User exists and is not soft-deleted
3. Caller holds the required role(s)
4. Role's current status is **Active (1)**

If any check fails -> `401 Unauthorized`.

---

## 8. Status Lifecycle — Current vs History

### 8.1 How a status is born

When a role is first assigned (Path A/B/C), `handleUserRoleStatus()` inserts:

- **UserRole** row (if not already assigned)
- **UserRoleStatusCurrent** row (if not already assigned) — with the provided `statusId`

If `statusId` is omitted at creation time, no `UserRoleStatusCurrent` row is inserted until the account-status evaluation establishes one.

### 8.2 How a status transitions

Status transitions are performed by `updateUserRoleStatus()`, which:

```
1. READ current status from UserRoleStatusCurrent
2. INSERT into UserRoleStatusHistory (previous -> new)
3. UPDATE UserRoleStatusCurrent SET statusId = <new>
```

This guarantees:

- Every transition is auditable (history table is append-only)
- The current state is always explicit and queryable
- A (re)registration can never silently re-open a suspended account — the status is insert-only

### 8.3 Full CRUD API surface

**Statuses** — definitions (`Routes/Status.routes.js`, mounted at `/api/admin/statuses`):

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/admin/statuses/` | Create a status definition |
| GET | `/api/admin/statuses/` | List all statuses (pagination + search) |
| PUT | `/api/admin/statuses/:statusUniqueId` | Update a status |
| DELETE | `/api/admin/statuses/:statusUniqueId` | Delete a status |

**UserRoleStatus** — the current/history assignment (`Routes/UserRoleStatus.routes.js`, mounted at `/api/admin/userRoleStatus`):

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/admin/userRoleStatus/` | Create a user-role-status row (initial assignment) |
| GET | `/api/admin/userRoleStatus/current` | Current status by user/role, filterable (`userUniqueId`, `roleId`, `statusId`, dates, `sortBy`); supports `includeHistory=true` |
| GET | `/api/admin/userRoleStatus/byPhone` | Status lookup by phone number |
| PUT | `/api/admin/userRoleStatus/:userUniqueId` | Transition status — this calls `updateUserRoleStatus` and is the ONLY path that moves current -> history |
| DELETE | `/api/admin/userRoleStatus/:userRoleStatusUniqueId` | Delete a current row |

> `UserRoleStatusHistory` has **no direct CRUD route** — it is append-only and read through `includeHistory=true` on the `current` endpoint. Transitions are always driven by the PUT above (or by the account-status evaluation).

E2E: `E2ETests/Status/Status.js`, `E2ETests/Status/UserRoleStatus.js`, `E2ETests/Status/index.js`.

---

## 9. Complete User Lifecycle — The "Next Ways" at a Glance

```
[New User]
   |
   v
+-----------------------+   +------------------------------+   +---------------+
| A. Self-register      |   | B. Admin / SuperAdmin creates |   | C. QueueAdmin |
| POST /api/user/       |   | POST /api/admin/             |   |   creates     |
|   createUser          |   |   createUserByAdminOrSuper   |   | POST /api/    |
| (driver, shipper,     |   |   Admin                      |   |   queueOrg... |
|  companyAdmin,        |   | (admin, companyAdmin,        |   +---------------+
|  queueOrgAdmin)       |   |  queueOrgAdmin)              |
+-----------------------+   +------------------------------+
           |                            |                            |
           +----------------------------+----------------------------+
                                        |
                                        v
                        +-------------------------------+
                        | INSERT Users                 |
                        | INSERT UserRole (roleId)     |
                        | INSERT UserRoleStatusCurrent |
                        |   (statusId if provided)     |
                        | INSERT usersCredential       |
                        |   (rawPassword, verified=0)  |
                        +-------------------------------+
                                        |
                                        v
                     POST /api/user/verifyUserByOTP  { phoneNumber, OTP, roleId }
                                        |  (sets verified=1)
                                        v
                          POST /api/user/loginUser   -> JWT
                                        |
                                        v
              Role-centric access: /api/<role>/account, /api/account/status
                                        |
                                        v
              Status transitions: updateUserRoleStatus -> history + current
```

> **System roles (5, 6) skip verification** — they are seeded Active directly by `createUserSystem()`.

---

## 10. Step -> API -> E2E Reference Table

| Step                      | API Endpoint                                         | E2E File / Line                                 |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| Seed roles/statuses       | `installPreDefinedData` (startup)                    | `E2ETests/Status/index.js`                      |
| Seed system + super admin | `createUserSystem()` (startup, no API)               | `E2ETests/Auth/bootstrap.js`                    |
| Create user (self)        | `POST /api/user/createUser`                          | `Auth/User.js:63`, `Auth/ensureUser.js:170,242` |
| Create user (admin)       | `POST /api/admin/createUserByAdminOrSuperAdmin`      | `Auth/User.js:74`, `Auth/ensureUser.js:210`     |
| Create user (queue admin) | `POST /api/queueOrganization/createUserByQueueAdmin` | `Auth/ensureUser.js:242`                        |
| Verify by OTP             | `POST /api/user/verifyUserByOTP`                     | `Auth/VerifyByOtp.js`, `Auth/ensureUser.js:337` |
| Verify email              | `GET/POST /api/user/verify-email`                    | —                                               |
| Verify phone              | `POST /api/user/verify-phone`                        | —                                               |
| Login                     | `POST /api/user/loginUser`                           | `Auth/authApi.js:93`, `Auth/ensureUser.js:358`  |
| Account (per role)        | `GET /api/driver/account` (also `/api/shipper/account`, `/api/companyAdmin/account`, `/api/dispatcher/account`) | `Auth/Account.js` |
| Role CRUD                 | `POST/GET/PUT/DELETE /api/admin/roles`(/`/:roleUniqueId`) | `Roles/index.js`                           |
| UserRole CRUD             | `POST /api/admin/userRole/create`,`GET /filter`,`PUT/DELETE /:userRoleUniqueId` | `Roles/index.js`, `Auth/*`        |
| Status CRUD               | `POST/GET/PUT/DELETE /api/admin/statuses`(/`/:statusUniqueId`) | `Status/Status.js`                     |
| UserRoleStatus CRUD       | `POST /api/admin/userRoleStatus/`,`GET /current`,`GET /byPhone`,`PUT /:userUniqueId`,`DELETE /:userRoleStatusUniqueId` | `Status/UserRoleStatus.js` |
| UserRoleStatusHistory     | read via `GET /api/admin/userRoleStatus/current?includeHistory=true` (append-only, no CRUD) | `Status/UserRoleStatus.js` |

---

## 11. How to Run the E2E Suite

```bash
# Provision all CORE_USER_TYPES in order, then verify
node E2ETests/Auth/index.js
node E2ETests/Roles/index.js
node E2ETests/Status/index.js
```

Each suite depends on the previous one completing (users must exist before roles/status tests run against them). The full production flow — and the E2E ordering rule — is documented in sections 12-19 below.

---

# Part II — The Full Lifecycle (All Tables)

The E2E phase order mirrors the business sequence (see `E2ETests/index.js`):

```
Phase 0 reset+seed → Phase 1 core users → Phase 2 driver onboarding + doc approval
→ Phase A reference-data CRUD → Phase B individual journey → Phase C company journey
→ Phase D post-journey CRUD → Phase E delinquency/ban → Phase F analytics
→ finance/document/socket suites → Phase Q queue dispatch
```

> **Coverage markers used below**
> - ✅ step is exercised explicitly by the E2E suite
> - 🟡 step exists in the code but is **jumped/skipped** by the E2E suite (reason + where it *is* covered)
> - ⚠️ documented gap or authorization caveat

---

## 12. Seed & Reference Data (Installed at DB Init)

Installed by `installPreDefinedData` during `resetDatabase()` (`E2ETests/DataBaseManagement/index.js`). These rows exist before any user acts and are the lookup tables every workflow references.

| Table | Seeded rows | Notes |
|---|---|---|
| `Roles` | 1-12 (shipper…queueDispatcher) | see section 2.1 |
| `Statuses` | 1-9 (Active…grace-expired) | see section 2.2 |
| `DocumentTypes` | driver license, vehicle registration, insurance, national ID, photo, tax, delegation… | mandatory sets per role in `RoleDocumentRequirements` |
| `RoleDocumentRequirements` | driver (license+photo), vehicle (insurance+registration), company, companyAdmin, dispatcher | the document gate for status eval |
| `VehicleTypes` | Isuzu FSR/NPR, Euro Tracker, Sino Truck… | picked at vehicle creation |
| `VehicleStatusTypes` | 1 ACTIVE, 2 INACTIVE, 3 DELETED, 4 SUSPENDED, 5 REJECTED, 6 RESERVED_BY_OTHER | |
| `JourneyStatus` | 1-20 (see section 16) | journey state machine |
| `SubscriptionPlan` + `SubscriptionPlanPricing` | free (30d) + paid 700/1800/6000 ETB (30/90/365d) | free plan auto-granted opportunistically |
| `DepositSource` | bank, telebirr, santimpay… | deposit `depositSourceUniqueId` |
| `FinancialInstitutionAccounts` | bank accounts for manual deposits | required for manual deposit |
| `PaymentMethod` / `PaymentStatus` | cash, bank transfer, telebirr; pending/completed/failed | |
| `CommissionRates` / `CommissionStatus` | default 10% | commission = rate × payment |
| `CancellationReasonsType` | per-role reasons, `requestMode` individual/company/both | driver reasons ~7-12, shipper ~1-6 |
| `DelinquencyTypes` | 9 standard types | see section 18 |
| `TariffRate` / `TariffRateForVehicleTypes` | freight tariff reference | |
| `SMSSender` | SMS gateway config | used by OTP delivery |

CRUD for all of the above is covered by `E2ETests/Phases/runReferenceCRUD.js` (Phase A) and the per-entity files in `E2ETests/Vehicles`, `E2ETests/Documents`, `E2ETests/Finance`.

---

## 13. Driver Onboarding — From Registration to ACTIVE

This is the sequence you asked about: register → user docs → vehicle → vehicle docs → **admin approves docs** → subscribe / **deposit → admin approves** → ACTIVE. One user, one `Users` row, role=2, plus a `Vehicle` entity (role=9) when they register a truck.

### 13.1 The sequential steps

| # | Actor | Action | HTTP endpoint | Tables written | Next dep |
|---|---|---|---|---|---|
| 1 | Driver | Register | `POST /api/user/createUser` `{fullName, phoneNumber, roleId:2}` | `Users`, `usersCredential`, `UserRole`, `UserRoleStatusCurrent` | account exists (status may be 2/3/5) |
| 2 | Driver | Verify OTP + login | `POST /api/user/verifyUserByOTP` then `POST /api/user/loginUser` | `usersCredential` (verified=1) + JWT | token for all later calls |
| 3 | Driver | Check account requirements | `GET /api/driver/account` | read-only eval | tells driver what is missing |
| 4 | Driver | Create vehicle | `POST /api/user/vehicles/driverUserUniqueId/self` `{vehicleTypeUniqueId, licensePlate, color}` | `Vehicle`, `VehicleStatus` (ACTIVE), `VehicleOwnership`, `VehicleDriver` (active) | vehicle exists for vehicle docs |
| 5 | Driver | Upload user docs | `POST /api/user/attachDocuments/self` (multipart; license + photo) | `AttachedDocuments` (PENDING), `AttachedDocumentsHistory` on later changes | docs PENDING |
| 6 | Driver | Upload vehicle docs | `POST /api/vehicle/attachDocuments/:vehicleUniqueId` (insurance + registration) | `AttachedDocuments` (PENDING, ownerType=vehicle) | vehicle docs PENDING |
| 7 | Admin | List unauthorized drivers | `GET /api/admin/getUnAuthorizedDriver?phone=...` | read | picks PENDING docs |
| 8 | Admin | Approve each doc | `PUT /api/admin/acceptRejectAttachedDocuments` `{attachedDocumentUniqueId, action:"ACCEPTED"\|"REJECTED", reason}` | `AttachedDocuments` (+`AttachedDocumentsHistory` snapshot) + status recalc → `UserRoleStatusCurrent`/`History` | docs ACCEPTED |
| 9 | Driver | (optional) Subscribe | `POST /api/finance/userSubscription/:driverUniqueId` `{subscriptionPlanPricingUniqueId}` | `UserSubscription`, `UserBalance` | active plan / net balance > 0 |
| 10 | Driver | Deposit | `POST /api/finance/userDeposit` `{driverUniqueId, depositAmount, depositSourceUniqueId, accountUniqueId}` | `UserDeposit` (status `requested`) | deposit awaiting approval |
| 11 | Admin | Approve deposit | `PUT /api/finance/userDeposit/:userDepositUniqueId` `{depositStatus:"approved"}` | `UserDeposit`, `UserBalance` (credit via `prepareAndCreateNewBalance`) | wallet credited |
| 12 | — | Status evaluation | next `accountStatus` call | `UserRoleStatusCurrent` | **ACTIVE (1)** |

### 13.2 The account-status ladder

`Services/Account/accountStatus.service.js` evaluates on every account fetch and after every doc/vehicle change. **Priority order** (first match wins):

```
6 banned  >  2 no vehicle  >  4 docs rejected  >  3 docs missing  >  5 docs pending  >  7 no subscription & balance ≤ 0  >  1 ACTIVE
```

- Free subscription (30d) is **auto-granted** by `checkAndGrantUserSubscription` when the driver's docs+vehicle are complete — that is why an approved driver becomes ACTIVE without a manual deposit in the E2E run.
- After the free plan lapses with `netBalance <= 0`, a 2-day grace keeps the driver "docs eligible"; past it → status **9 GRACE_PERIOD_EXPIRED**.
- E2E asserts the invariant at `E2ETests/index.js:166-175`: driver MUST be `USER_STATUS.ACTIVE(1)` after `authorizeDriversDocuments`.

> **⚠️ Vehicle approval gap:** there is **no admin vehicle-approval endpoint** — a vehicle is ACTIVE immediately on self-registration (`Services/Vehicle.service.js`). Admin can only flip status afterwards via the generic `PUT /api/vehicleStatus/:vehicleStatusUniqueId` (token-only, no admin-role gate).

E2E: `E2ETests/Driver/index.js` (onboarding), `E2ETests/Driver/RequirementOfDriver.js`, `E2ETests/Admin/fetchData.js`, `E2ETests/Admin/AuthorizeDocs.js`, `E2ETests/Driver/DriversFinance/DriverDeposit.js` + `DriverSubscription.js`.

---

## 14. Company Onboarding — Fleet Partner

A company user (companyAdmin, role=7) creates a `TransportCompany` entity (role=8) that owns `CompanyVehicle` (role=9) records and a fleet of drivers. The company must be **approved** before it can bid on freight.

| # | Actor | Action | HTTP endpoint | Tables written | Next dep |
|---|---|---|---|---|---|
| 1 | companyAdmin | Register + verify + login | `POST /api/user/createUser` (roleId 7) + OTP | `Users`, `usersCredential`, `UserRole`, `UserRoleStatusCurrent` | company admin can act |
| 2 | companyAdmin | Create company | `POST /api/company/companies` | `TransportCompany` (`approvalStatus=pending`), `CompanyMembership` (creator auto-admin), `CompanyProfileHistory` | company exists |
| 3 | companyAdmin | Attach company docs | `POST /api/company/attachDocuments/:companyUniqueId` | `AttachedDocuments` (PENDING, ownerType=company) | docs pending |
| 4 | Admin | Approve company docs | `PUT /api/admin/acceptRejectAttachedDocuments` | `AttachedDocuments` + history | docs accepted |
| 5 | Admin | Approve company | `PATCH /api/company/companies/:companyUniqueId/approve` | `TransportCompany` (`approvalStatus=approved`), `CompanyProfileHistory` | company can bid, join fleet |
| 6 | companyAdmin | Add company roles/members | `POST /api/company/roles`, `POST /api/company/members` | `CompanyRoles`, `CompanyMembership` (admins, dispatchers) | staff exist |
| 7 | companyAdmin | Register fleet vehicles | `POST /api/company/fleet` (`assignVehicleToCompany`) | `CompanyVehicle`, `VehicleDriver`, `VehicleOwnership` | **fleet gate** — required before bidding |
| 8 | — | Company status changes | ban/unban + rating | `CompanyBan`, `CompanyRating` | — |

**Profile audit:** `CompanyProfileHistory` (append-only) records every `approvalStatus` change (registration | document_approval | ban | unban | manual) plus edits to companyName/registrationNumber/phone/email/address.

**Fleet gate detail:** `POST /api/company/bids` returns 400 if the company has no assigned vehicle — `assignVehicleToCompany` must run first (E2E ordering note in `E2ETests/Phases/runCompanyFlow.js`).

E2E: `E2ETests/Company/index.js` (`createCompanyAdminFlow`), `CompanyProfileManagement.js`, `CompanyRole.js`, `CompanyMembership.js`, `CompanyVehicle.js`, `CompanyRating.js`, `Company/DriversAssignment.js`.

---

## 15. Queue Dispatch Org — Setup

Queue orgs (role=11 queueOrgAdmin plus role=12 queueDispatcher) run the loading-place FIFO/bid dispatch loop of section 16.3.

| # | Actor | Action | HTTP endpoint | Tables written | Next dep |
|---|---|---|---|---|---|
| 1 | queueAdmin | Create org | `POST /api/queueOrganization` | `QueueOrganization` (`approvalStatus=pending`, `queueEnabled=0`), creator auto role-11 membership, `QueueAuditLog` | org exists |
| 2 | Admin | Approve + enable | `PATCH /api/queueOrganization/:org/approve` (enables `queueEnabled`) | `QueueOrganization` (+audit) | **queue only runs when approved AND queueEnabled** |
| 3 | queueAdmin | Add staff | `POST /api/queueOrganization/:org/members` | `QueueOrganizationMembership` (role 11/12, `isActive=1`) | staff can run queue |
| 4 | Driver | Check in | `POST /api/queue/:queueOrganizationUniqueId/checkin` (within `checkinRadiusKm`, default 15) | `DriverQueue` (row per day, one queue per day) | driver joins `queueOrg:<org>:<date>` room |
| 5 | Driver | See position | `GET /api/queue/status` (`myPosition`) | read | sees waiting/offered state |
| 6 | — | Dispatch loop | `POST /api/queue/:org/dispatch` | `DriverQueue` + history + `DriverBid` (bid-base) | orders assigned (section 16.3) |
| 7 | — | History/audit | `GET /api/queue/history`, `QueueAuditLog` | `DriverQueueHistory`, `QueueAuditLog` | immutable trail |

**Guards:** only active role-11 (or admin/superAdmin) manage members; role-12 dispatchers run the queue but cannot manage members. Check-in rejects: same-day entry in another org (409), active journey (2-8) `alreadyInJourney`, idempotent for same-day same-org.

**Socket rooms** (`Utils/QueueSocket.js`): `queueOrg:<org>` (admins, all dates) and `queueOrg:<org>:<date>` (drivers + admins); messageTypes `queue_position_changed`, `queue_order_offered`, `queue_order_rejected`, `queue_order_reoffered`, `queue_refusal_moved_to_back`, `queue_order_assigned`, `queue_order_cancelled`.

E2E: `E2ETests/Queue/QueueOrg.js`, `QueueCheckin.js`, `QueueAdminOps.js`, `QueueHistory.js`, `DriverQueueHistory.js`; orchestrated by `E2ETests/Queue/index.js` (Phase Q).

---

## 16. Request -> Bid -> Journey (The Core Fulfilment Loop)

There are **three sub-flows** decided when the shipper creates the batch:

| Sub-flow | When | Bidder | Matching |
|---|---|---|---|
| **A. Individual** | `requestMode="individual_target"`, `numberOfVehicles` ≤ 9 | One driver | auto-match by GPS/distance |
| **B. Company** | `numberOfVehicles` > 9 → schema forces `requestMode="company_target"` (+`targetCompanyUniqueId`) | Transport company | company bid → assigns drivers |
| **C. Queue dispatch** | `queueOrganizationUniqueId` set (+optional `isBiddingApproved`) | Queue staff / bidders | FIFO front-driver, or bid-base |

> **Threshold:** `DOMAIN.MAX_INDIVIDUAL_TARGET_VEHICLES = 9` (`Utils/Constants.js:37`); enforced by Joi cross-field rule in `Validations/ShipperRequest.schema.js:60-76` — 10+ vehicles without `company_target` is rejected. Queue orders are exempt (each row goes to its own front driver).

### 16.0 Journey status state machine (single vocabulary, all flows)

| ID | Name | ID | Name |
|---|---|---|---|
| 1 | waiting | 11 | rejectedByShipper |
| 2 | requested | 12 | cancelledByDriver |
| 3 | acceptedByDriver | 13 | cancelledByAdmin |
| 4 | acceptedByShipper | 14 | completedByAdmin |
| 5 | **goToLoadingPlace** | 15 | cancelledBySystem |
| 6 | **loading** | 16 | noAnswerFromDriver |
| 7 | **loaded** | 17 | notSelectedInBid |
| 8 | **journeyStarted** | 18 | rejectedByDriver |
| 9 | journeyCompleted | 19 | replacedByCompanyAssignment |
| 10 | cancelledByShipper | 20 | partiallyCancelled |

Verified against `Utils/ListOfSeedData.js journeyStatusMap` (mirrored in `E2ETests/constants.js:22-43` and used by `Services/DriverQueue/position.service.js`). **The older `E2E_GUIDE.md` numbering (journeyStarted=5, 17 statuses) is stale — trust the tables above.**

### 16.1 Sub-flow A — Individual (auto-match, ≤ 9 vehicles)

| # | Actor | Action | HTTP endpoint | Status | Tables written | E2E |
|---|---|---|---|---|---|---|
| 1 | Shipper | Create request + batch | `POST /api/shipperRequest/createRequest` (`requestMode: individual_target`) | 1 | `ShipperRequest`, `ShipperRequestBatch` | ✅ `Shipper/ShipperRequest.js` |
| 2 | Driver | Post location (triggers match) | `POST /api/driver/request` | → match | `DriverRequest` | ✅ `runIndividualFlow` |
| 3 | Driver | Poll status | `GET /api/driver/verifyDriverJourneyStatus` | detects active match | read | ✅ `DriverJourneyStatus.js` |
| 4 | Driver | Accept match + submit bid price | `PUT /api/driver/acceptShipperRequest` `{shippingCostByDriver}` | 2→**3** | `JourneyDecisions` (+shippingCostByDriver), `DriverRequest`, `ShipperRequest` | ✅ |
| 5 | Shipper | **Receives bid price → accepts** | `PUT /api/shipper/acceptDriverOffer` | 3→**4** | `JourneyDecisions`, `ShipperRequest`, `DriverRequest` | ✅ `Shipper/ShipperRequest.js` |
| 6 | Driver | Go to loading place | `PUT /api/driver/goToLoadingPlace` | 4→**5** | `Journey`, `ShipperRequest`, `JourneyDecisions` | 🟡 jumped (16.4) |
| 7 | Driver | Start loading | `PUT /api/driver/startLoading` | 5→**6** | same | 🟡 jumped (16.4) |
| 8 | Driver | Finish loading | `PUT /api/driver/loadCompleted` | 6→**7** | same | 🟡 jumped (16.4) |
| 9 | Driver | Start journey | `PUT /api/driver/startJourney` `{journeyStartingLat/Lng}` | 4 or 7→**8** | `Journey` (+ starting GPS), `ShipperRequest`, `JourneyDecisions` | ✅ |
| 10 | Driver | Complete journey | `PUT /api/driver/completeJourney` `{journeyUniqueId}` | 8→**9** | `Journey` (+ completing GPS, `journeyCompletedAt`), `DriverRequest`, `JourneyPayments`, `Commission` | ✅ |
| 11 | Driver/Shipper | Delivery confirmation / rating / POD | `POST /api/deliveryConfirmations`, ratings | 9 | `DeliveryConfirmations`, `DeliveryConfirmationPhotos`, `Ratings`, `CompanyRating` | ✅ Phase D |

> **Note on 2-3:** the auto-match service (`Services/DriverRequest/statusVerification/*`) finds nearby shippers, creates the `JourneyDecision`, and sets `requested(2)` on the next `verifyDriverJourneyStatus` when a waiting match exists. A driver rejecting a match uses `PUT /api/driver/cancelDriverRequest` (real path → 18 rejectedByDriver).

**Reject path:** shipper can reject a driver's bid with `PUT /api/user/rejectDriverOffer` (→ 11 rejectedByShipper / 17 notSelectedInBid).

### 16.2 Sub-flow B — Company (fleet, 10+ vehicles)

| # | Actor | Action | HTTP endpoint | Tables written | E2E |
|---|---|---|---|---|---|
| 1 | Shipper | Create company batch (lazy — **0 `ShipperRequest` rows yet**) | `POST /api/shipperRequest/createRequest` `{requestMode:"company_target", numberOfVehicles:10+, targetCompanyUniqueId}` | `ShipperRequestBatch` (header only) | ✅ `Company/CompanyTargetLazyCreation.js` |
| 2 | Company | See available bids | `GET /api/company/bids?target=available` | read | ✅ |
| 3 | Company | **Bid** | `POST /api/company/bids` `{companyUniqueId, proposedCostPerVehicle}` | `CompanyBidRequest` (`submitted`), + socket `company_bid_joined` → queue-org | ✅ `BidManagement.js` |
| 4 | Shipper | **Accept bid** | `PATCH /api/company/bids/:companyBidRequestUniqueId/status` `{bidStatus:"accepted_by_shipper"}` | `CompanyBidRequest` → accepted; **N `ShipperRequest` rows created** (stage 4) | ✅ |
| 5 | Company | Assign fleet vehicle | `POST /api/company/fleet` | `CompanyVehicle` | ✅ |
| 6 | Company | Assign driver | `POST /api/company/assignments` | `CompanyAssignment`, `DriverRequest`, `CompanyBidVehicleAssignment` (slot) | ✅ `DriversAssignment.js` |
| 7 | Driver | Confirm assignment | `PATCH /api/company/assignments/:assignmentUniqueId/status` `{assignmentStatus:"confirmed_by_driver"}` | `CompanyAssignment` → confirmed, socket `queue_driver_confirmed_assignment` | ✅ |
| 8 | Driver | Journey ladder | same as individual 6-10 | → 5→8→9 | ✅ (loading 🟡 16.4) |

**Fleet-capacity propagation:** on completion, the assignment slot flips to `completed` and `journeyStatusId` is mirrored onto `CompanyBidRequest`.

> **⚠️ `CompanyCommission`** (`Database.js:1840`) is schema-only — no code inserts it. Commission rows are created via `Commission` for individual journeys only (`Services/Commission.service.js`). Do not assert on this table.

### 16.3 Sub-flow C — Queue dispatch at the loading place

An order created with `queueOrganizationUniqueId` is handled by queue staff, not open matching:

| # | Actor | Action | HTTP endpoint | Tables written | E2E |
|---|---|---|---|---|---|
| 1 | Shipper/queue staff | Create queue order | `POST /api/shipperRequest/createRequest` + `queueOrganizationUniqueId` (optional `isBiddingApproved`) | `ShipperRequestBatch(+ShipperRequest)`, `DriverQueue` | ✅ `QueueOrders.js` |
| 2 | Queue staff | **FIFO offer** → front waiting driver of matching vehicle type | `POST /api/queue/:org/dispatch` | `DriverQueue` (status 2 requested), `DriverRequest`, `JourneyDecisions`, socket `queue_order_offered` | ✅ |
| 3 | Driver | Accept within **3-min offer window** | driver accept | `DriverQueue` → AGREED(3), then journey ladder | ✅ `TimeoutReoffer.js` |
| — | Driver | Decline / timeout | `POST /api/queue/:org/reject`, or expiry scan | status 16 noAnswer + refusal policy → move to back, re-offer next driver (`applyRefusalPolicy`, `offerToNextDriver`), socket `queue_order_rejected`/`reoffered` | ✅ |
| 4 | Queue staff | **Bid-base** placement | order with `isBiddingApproved=true` bypasses FIFO | distance-match to nearby drivers; **queued drivers priority (≤5) then nearest**; bidders via `DriverBid` | ✅ `BidBasePlacement.js` |
| 5 | — | Driver journey → `DriverQueue` mirrors status (5-9) | loading-stage updates | `DriverQueue`, `DriverQueueHistory` | ✅ `verifyLoadingStages.js` |

**Loading-place decision logic (as designed):** queue staff can offer to **queued drivers** (FIFO authority) or **call the nearest driver** based on conditions; when shippers supply their own vehicles, choose from the queue to load goods, otherwise fall back to FIFO or bid-base placement.

**Enforced guards:** `QUEUE_OFFER_WINDOW_MINUTES=3`, `MAX_OFFERS_PER_SWEEP=50`, `QUEUE_REFUSAL_LIMIT` env; `HOLDING_QUEUE_STATUSES` = 2,3,5,6,7,8,16; a driver who declines ANY order of a batch is excluded from auto *re-offers* of that batch (targeted manual dispatch still allowed).

### 16.4 Loading Stages — Full Detail (statuses 4→5→6→7→8)

The loading stage sequence happens between shipper acceptance (status 4) and journey start (status 8). All four transitions write to the `Journey` table; each records GPS coordinates and a timestamp.

| # | Status | API endpoint | Actor | Journey columns written | Also writes |
|---|---|---|---|---|---|
| — | **4** `acceptedByShipper` | `PUT /api/shipper/acceptDriverOffer` | Shipper | *(Journey row created at this point)* | `JourneyDecisions`, `ShipperRequest`, `DriverRequest` |
| 1 | **5** `goToLoadingPlace` | `PUT /api/driver/goToLoadingPlace` | Driver | `journeyGoingToLoadingLat`, `journeyGoingToLoadingLng`, `journeyGoingToLoadingAt` | `ShipperRequest.journeyStatusId=5`, `JourneyDecisions.journeyStatusId=5` |
| 2 | **6** `loading` | `PUT /api/driver/startLoading` | Driver | `journeyLoadingStartedLat`, `journeyLoadingStartedLng`, `loadingStartedAt` | `ShipperRequest.journeyStatusId=6`, `JourneyDecisions.journeyStatusId=6` |
| 3 | **7** `loaded` | `PUT /api/driver/loadCompleted` | Driver | `journeyLoadingCompletedLat`, `journeyLoadingCompletedLng`, `loadingCompletedAt`, `journeyProofOfLoading` (JSON photo array) | `ShipperRequest.journeyStatusId=7`, `JourneyDecisions.journeyStatusId=7` |
| 4 | **8** `journeyStarted` | `PUT /api/driver/startJourney` `{journeyStartingLat, journeyStartingLng}` | Driver | `journeyStartingLat`, `journeyStartingLng`, `journeyStartedAt`, `journeyStartedByUser` | `ShipperRequest.journeyStatusId=8`, `JourneyDecisions.journeyStatusId=8` |
| 5 | **9** `journeyCompleted` | `PUT /api/driver/completeJourney` `{journeyUniqueId}` | Driver | `journeyCompletingLat`, `journeyCompletingLng`, `journeyCompletedAt`, `journeyCompletedByUser` | `JourneyPayments`, `Commission` |

**E2E skip note:** The individual and company E2E suites skip stages 5, 6, 7 — they call `startJourney` from status 4 directly (any status in `[5,6,7,8]` is treated as "already in transit"). Only the Queue suite exercises all stages via `verifyLoadingStages.js`.

**`startJourney` flexible entry:** the backend accepts `startJourney` from status **4** (acceptedByShipper) OR **7** (loaded) — this allows the driver to skip the loading stages if circumstances require.

**GPS continuity:** each stage persists its own lat/lng pair to the `Journey` row so analysts can reconstruct the full geographic trace: origin (from `ShipperRequest`) → goToLoadingPlace GPS → loadingStarted GPS → loadingCompleted GPS → journeyStarted GPS → journeyCompleted GPS.

**`journeyProofOfLoading`:** a JSON array stored in `Journey.journeyProofOfLoading` (TEXT column). Contains photo URLs submitted at `loadCompleted` time. Separate from `DeliveryConfirmationPhotos` (POD photos submitted after delivery).

### 16.5 E2E jump corrections (what the suite skips vs the real flow)

| # | Real step | E2E behavior | Where it IS covered |
|---|---|---|---|
| 16.1-6/7/8 | goToLoadingPlace(5), startLoading(6), loadCompleted(7) | 🟡 **Jumped.** `runIndividualFlow.js` treats any status in `[5,6,7,8]` (`JOURNEY_IN_PROGRESS`) as "already in transit" and calls `completeJourney` straight to 9 | Queue `verifyLoadingStages` + company assignment-loading progress (`going_to_loading_place/started_loading/completed_loading`) |
| 16.1-2 | driver `POST /api/driver/request` | E2E re-runs reuse completed state; leftover strays are rejected for real (`rejectLeftoversUntilFresh`, cap 15) until the fresh request matches — exercising batch-scoped rejection | `runIndividualFlow.js:52-80` |
| 16.2-8 | company loading stages | 🟡 same jump as individual | company `assignDrivers` → confirm → start/complete |
| 16.3 | re-offer after refusal | Queue tests are state-branched: if the entry already exists they don't re-run from check-in | `Queue/QueueCheckin.js`, `TimeoutReoffer.js` |
| Status evals | — | `resetDatabase` never truncates; interrupted runs strand rows at the same GPS, so matching picks FIFO (oldest non-rejected) | handled by `rejectLeftoversUntilFresh` |

**Why the doc presents the full ladder anyway:** the jump is purely a test shortcut — the backend has real `PUT /api/driver/goToLoadingPlace`, `/startLoading`, `/loadCompleted` handlers that transition 4→5→6→7→8. Clients walking stages individually get the full sequence; the E2E suite intentionally keeps the run short.

---

## 17. Finance Operations

Money flows all funnel through the wallet row (one `UserBalance` per user) created lazily at subscribe/deposit time. Ledger entries are append-only; balances only ever move via `prepareAndCreateNewBalance` (incoming) / `prepareAndCreateNewExpense` (outgoing) — there is no direct update/delete on `UserBalance`.

| # | Actor | Action | HTTP endpoint | Tables written | Next dep |
|---|---|---|---|---|---|
| 1 | Driver | Deposit (request) | `POST /api/finance/userDeposit` `{driverUniqueId, depositAmount, depositSourceUniqueId, accountUniqueId}` | `UserDeposit` (`status=requested`), `DepositSource` ref | admin approval |
| 2 | Admin | Approve deposit | `PUT /api/finance/userDeposit/:userDepositUniqueId` `{depositStatus:"approved"}` | `UserDeposit` → approved, `UserBalance` (+balance history) | wallet credited |
| 3 | Admin | Reject deposit | same endpoint `"rejected"` with reason | `UserDeposit` → rejected | no wallet change |
| 4 | Driver | Subscribe (optional) | `POST /api/finance/userSubscription/:driverUniqueId` `{subscriptionPlanPricingUniqueId}` | `UserSubscription`, `UserBalance` (plan deducted) | plan active |
| 5 | — | Balance transfer | `POST /api/finance/userBalanceTransfer/:transferredBy` `{fromDriverUniqueId, toDriverUniqueId, amount}` | `UserBalanceTransfer`, `UserBalance` (sender dr, receiver cr) | receiver credited |
| 6 | Admin/User | Refund | `POST /api/finance/userRefund/:userUniqueId`, then `UPDATE /api/finance/userRefund/:userRefundUniqueId` | `UserRefund` (+`RefundType`) | `netBalance` restored |
| 7 | — | Commission at completion | auto on `completeJourney` | `Commission` (rate × `JourneyPayments`) | admin payout |

**Ledger invariants to assert on:**
- `netBalance = totalCredited - totalDebited` (recomputed from history, never stored-updated directly).
- Wildlife check E2E: deposit amount appears verbatim in `UserBalance` (`$/totalCredited`) and `balanceHistory` rows — see `DriverDeposit.js`, `balanceCheck.js`.
- `Commission` snapshot: `commissionAmount = commissionRate × basePrice` against `CommissionRates.commissionPercentage`.

**⚠️ Gaps:**
- `UserRefund` status enum expected by seed (`PENDING_ADMIN_APPROVAL`) vs allowed values may mismatch — verify before wiring an automated refund flow.
- **No `Withdrawal`/payout endpoint or table exists** (no rules file). Payout is currently governed only by `Commission` + wallet balance; a payout flow must be built.
- No `CompanyCommission` write path (see 16.2). No balance-provisioning for company/queue users (wallet is created but requires a deposit to become ACTIVE).

E2E: `E2ETests/Finance/*` (suite in `E2ETests/Queue/index.js` Phase F alternatives), `E2ETests/Driver/DriversFinance/DriverDeposit.js`, `DriverSubscription.js`, `balanceCheck.js`, `Commision.js` [sic].

---

## 18. Delinquency & Bans

A user-safety + platform-trust layer that, once tripped, overrides every other status (ladder top: `BANNED > all`).

### 18.1 Individual driver

| # | Actor | Action | HTTP endpoint | Tables written | Next dep |
|---|---|---|---|---|---|
| 1 | System/Admin | Detect delinquency | `POST /api/admin/userDelinquency/` (types: DOCUMENT_REJECTION, CANCELLATION, REFUSED, NO_SHOW…) | `UserDelinquency`, `UserDelinquencyResponses` (auto, type-dependent) | 3 misses → escalate |
| 2 | Driver | View pending response | `GET /api/user/delinquencyResponse/pending` | read | driver must respond |
| 3 | Driver | Respond/appeal | `POST /api/user/delinquencyResponse` | `UserDelinquencyResponses` (response + note) | case resolved/denies |
| 4 | Admin | Decide escalation | `POST /api/admin/userDelinquencyDecisions` (camelCase mounts) | `UserDelinquencyDecision` (+ `UserBan` if applied) | ban may cascade |
| 5 | Admin | Ban/unban | `POST /api/admin/bannedUsers/` (`banByAdminOrSuperAdmin`) / unban | `UserBan`, `UserRoleStatusCurrent`→6 | driver locked out |

**Guardrail:** delinquency forgiveness window + escalation cap — 3 confirmed misses flip the user to `BANNED`; the ban itself becomes the priority status (6) so lifestyle statuses no longer re-evaluate.

### 18.2 Company mirror

| # | Actor | Action | HTTP endpoint | Tables written | Next dep |
|---|---|---|---|---|---|
| 1 | Admin | Flag company | `POST /api/admin/companyDelinquency/` | `CompanyDelinquency`, `CompanyDelinquencyDecisions` (auto) | escalation |
| 2 | Admin | Decide | `POST /api/admin/companyDelinquencyDecisions` | decision rows, `CompanyBan` on ban | company banned |
| 3 | Admin | Ban/unban company | `PATCH /api/company/companies/:companyUniqueId/ban` (+unban) | `CompanyBan`, `CompanyProfileHistory` (ban reason snapshot) | company + fleet blocked from bidding |

**Invariant:** banned company → `CompanyBidRequest` submissions rejected; banned driver → `activeJourney` denied, no new matches.

E2E: `E2ETests/Driver/DelinquencyProcess/{DriverDelinquency,DriverDelinquencyResponse,...}.js`, `E2ETests/Company/CompanyDelinquencyProcess/*`, `E2ETests/Admin/...Ban` — Phase E in `E2ETests/index.js`.

---

## 19. Complete Table Inventory — Every Table Described

All tables from `Database/Database.js`, grouped by domain. The **Phase** column shows when they are first written in the E2E run.

### 19.1 Auth & Identity

| Table | Purpose | Key columns | Phase |
|---|---|---|---|
| **Users** | One row per human/system actor. Primary identity record. | `userUniqueId` (UUID PK), `phoneNumber` (unique), `email` (unique), `isPhoneVerified`, `isEmailVerified`, `isDeleted` | 0 |
| **UsersHistory** | Append-only audit log of every UPDATE/DELETE on a `Users` row. | `userUniqueId` (FK), `actionType` ENUM(UPDATED, DELETED), `actionBy`, `actionAt` | 1 |
| **usersCredential** | Auth credentials per user: password hash, OTP codes, email verification token. One row per user (1:1). | `userUniqueId` (FK), `hashedPassword`, `phoneVerificationOTP`, `emailVerificationOTP`, `emailVerificationToken`, `emailVerificationExpiresAt`, `otpPlain` (dev only) | 1 |
| **UserProfileHistory** | Field-level audit log of profile + status changes. `source` ENUM: registration/profile_update/status_change/ban/unban/manual. | `userUniqueId` (FK), `fieldName`, `oldValue`, `newValue`, `source`, `referenceUniqueId` | 1+ |
| **DeviceTokens** | FCM/push tokens per device, per user+role. Revoked tokens kept with `revokedAt` set. Nullable `userUniqueId` for pre-login. | `userUniqueId` (FK nullable), `roleId` (FK), `token` (unique), `platform`, `appVersion`, `lastSeenAt`, `revokedAt` | 1 |

### 19.2 Roles & Statuses

| Table | Purpose | Key columns | Phase |
|---|---|---|---|
| **Roles** | Global role definitions. Seeded 1-12; CRUD by admin. | `roleId` (PK int), `roleUniqueId`, `roleName` (unique) | 0 |
| **UserRole** | Assigns a role to a user (N:M join). A user can hold multiple roles. | `userUniqueId` (FK), `roleId` (FK); unique on (userUniqueId, roleId) | 1 |
| **Statuses** | Global status definitions. Seeded 1-9; CRUD by admin. | `statusId` (PK int), `statusUniqueId`, `statusName` (unique) | 0 |
| **UserRoleStatusCurrent** | Exactly one active status per `UserRole` row. Insert-only in practice; transitions move current row to history first. | `userRoleId` (FK), `statusId` (FK), `userRoleStatusCurrentVersion` | 1 |
| **UserRoleStatusHistory** | Immutable audit log: every previous status for a `UserRole`. One row per past status transition. | `userRoleId` (FK), `statusId` (FK), `userRoleStatusUpdatedBy/At`, `userRoleStatusCurrentVersion` | 1+ |

### 19.3 Documents

| Table | Purpose | Key columns | Phase |
|---|---|---|---|
| **DocumentTypes** | Catalogue of accepted document kinds (license, insurance, photo…). Fields define FE form field names for uploads. | `documentTypeId`, `uploadedDocumentName`, `uploadedDocumentTypeId`, `uploadedDocumentDescription`, `uploadedDocumentExpirationDate`, `uploadedDocumentFileNumber`, `isDocumentTypeDeleted` | 0 |
| **DocumentTypesHistory** | Audit log for every UPDATE/DELETE on `DocumentTypes`. | `documentTypeId` (FK), `changeType` ENUM(UPDATE, DELETE), `changedByUserId` | 0+ |
| **RoleDocumentRequirements** | Which document types are required for which role. Controls the document-gate for status evaluation. | `roleId` (FK), `documentTypeId` (FK); unique on (roleId, documentTypeId), `isDocumentMandatory`, `isFileNumberRequired`, `isExpirationDateRequired`, `isDescriptionRequired` | 0 |
| **AttachedDocuments** | Live set of documents uploaded by users, companies, or vehicles. Polymorphic: `ownerType` ENUM(user, company, vehicle). | `ownerType`, `ownerUniqueId`, `documentTypeId` (FK), `attachedDocumentAcceptance` ENUM(PENDING, ACCEPTED, REJECTED), `attachedDocumentName` (file path), `documentVersion`, `attachedDocumentAcceptanceReason` | 2 |
| **AttachedDocumentsHistory** | Full snapshot audit trail of every change to an `AttachedDocuments` row. Self-contained — includes `ownerType`/`ownerUniqueId`. | mirrors `AttachedDocuments` + `attachedDocumentUpdatedByUserId`, `attachedDocumentIsExpired` | 2 |

### 19.4 Vehicles

| Table | Purpose | Key columns | Phase |
|---|---|---|---|
| **VehicleTypes** | Catalogue of vehicle classes (Isuzu FSR, Euro Tracker…). Includes cargo type gate. | `vehicleTypeUniqueId`, `vehicleTypeName`, `carryingCapacity`, `cargoType` ENUM(bulk_only, container_only, both) | 0 |
| **Vehicle** | One row per physical truck. Core identity for all fleet operations. | `vehicleUniqueId`, `vehicleTypeUniqueId` (FK), `licensePlate`, `color` | 2 |
| **VehicleStatusTypes** | Lookup: ACTIVE, INACTIVE, DELETED, SUSPENDED, REJECTED, RESERVED_BY_OTHER. | `VehicleStatusTypeId`, `VehicleStatusTypeName` | 0 |
| **VehicleStatus** | Current and historical status entries for a vehicle. New status = new row (not an update). | `vehicleUniqueId` (FK), `VehicleStatusTypeId` (FK), `statusStartDate`, `statusEndDate` | 2 |
| **VehicleOwnership** | Links a vehicle to its owner (user + role). Supports ownership transfers via `ownershipEndDate`. | `vehicleUniqueId` (FK), `userUniqueId` (FK), `roleId` (FK), `ownershipStartDate`, `ownershipEndDate` | 2 |
| **VehicleDriver** | Active assignment of a driver to a vehicle. `assignmentStatus` ENUM(active, inactive). One active driver per vehicle at a time. | `vehicleUniqueId` (FK), `driverUserUniqueId` (FK), `assignmentStatus`, `assignmentStartDate`, `assignmentEndDate` | 2 |

### 19.5 Journey — Requests & Decisions

| Table | Purpose | Key columns | Phase |
|---|---|---|---|
| **JourneyStatus** | Lookup: 20 statuses (waiting…partiallyCancelled). The single state machine for all flows. | `journeyStatusId` (1-20), `journeyStatusName` | 0 |
| **ShipperRequestBatch** | Header/summary for a group of shipper requests. Eager for individual_target; lazy for company_target (no `ShipperRequest` rows until bid accepted). Canonical `queueOrganizationUniqueId` lives here (DRY). | `batchUniqueId`, `shipperUserUniqueId` (FK), `vehicleTypeUniqueId` (FK), `totalVehicles`, `requestMode`, `targetCompanyUniqueId`, `queueOrganizationUniqueId`, `journeyStatusId`, `isPodRequired` | B |
| **ShipperRequest** | One row per vehicle slot in a batch. Unit of driver matching and journey tracking. `isBiddingApproved` opens a slot to the bidding board. | `shipperRequestUniqueId`, `shipperRequestBatchUniqueId` (FK), `userUniqueId` (FK shipper), `vehicleTypeUniqueId`, `journeyStatusId`, `requestMode`, `isBiddingApproved`, `originLatitude/Longitude/Place`, `destinationLatitude/Longitude/Place`, `isPodRequired`, `isCompletionSeen` | B |
| **DriverRequest** | Driver's availability row. DB-generated `activeRequestGuard` column makes it impossible to hold two active requests simultaneously at the DB level. | `driverRequestUniqueId`, `userUniqueId` (FK driver), `journeyStatusId`, `activeRequestGuard` (generated, UNIQUE with userUniqueId), `isCancellationByShipperSeenByDriver` | B |
| **JourneyDecisions** | The accepted match: links one `ShipperRequest` to one `DriverRequest`. Records agreed bid price, dates, and per-role seen flags. `decisionBy` ENUM: shipper/driver/admin/queue/company. | `shipperRequestId` (FK), `driverRequestId` (FK unique), `journeyStatusId`, `decisionBy`, `shippingCostByDriver`, `isNotSelectedSeenByDriver`, `isCancellationByDriverSeenByShipper`, `isRejectionByShipperSeenByDriver` | B |
| **Journey** | Active/completed journey record. Created at status 4. Stores GPS + timestamps for all 5 loading/journey stages (5→6→7→8→9) and `journeyProofOfLoading` (JSON photo URLs from stage 7). | `journeyUniqueId`, `journeyDecisionUniqueId` (FK unique), `journeyStatusId`; **Stage 5:** `journeyGoingToLoadingLat/Lng/At`; **Stage 6:** `journeyLoadingStartedLat/Lng`, `loadingStartedAt`; **Stage 7:** `journeyLoadingCompletedLat/Lng`, `loadingCompletedAt`, `journeyProofOfLoading`; **Stage 8:** `journeyStartingLat/Lng/At/ByUser`; **Stage 9:** `journeyCompletingLat/Lng/At/ByUser` | B |
| **JourneyRoutePoints** | Continuous GPS breadcrumb trail during an active journey. One row per location ping. Cascade-deleted with `JourneyDecisions`. | `journeyDecisionUniqueId` (FK cascade delete), `latitude`, `longitude`, `timestamp` | B |
| **CancellationReasonsType** | Predefined cancellation reasons per role, scoped to `requestMode` (individual/company/both). | `roleId` (FK), `cancellationReason`, `requestMode` ENUM(individual, company, both) | 0 |
| **CanceledJourneys** | Records every cancellation event with reason and actor. Polymorphic context: ShipperRequest, DriverRequest, JourneyDecisions, Journey, or ShipperRequestBatch. | `contextId`, `contextType` ENUM, `roleId` (FK), `canceledBy` (FK), `cancellationReasonsTypeId` (FK), `canceledTime`, `isSeenByAdmin` | B+ |
| **JourneyNotifications** | One notification per journey-status transition. Unique on (journeyUniqueId, journeyStatusUniqueId) prevents duplicates. | `journeyUniqueId` (FK), `journeyStatusUniqueId` (FK), `message`, `isSeen` | B+ |

### 19.6 Payments & Finance

| Table | Purpose | Key columns | Phase |
|---|---|---|---|
| **PaymentMethod** | Lookup: cash, bank transfer, telebirr, etc. | `paymentMethodId`, `paymentMethod` | 0 |
| **PaymentStatus** | Lookup: pending, completed, failed. | `paymentStatusId`, `paymentStatus` (unique) | 0 |
| **JourneyPayments** | Payment record for a completed journey (shipper → driver). Linked to `JourneyDecisions`. | `journeyDecisionUniqueId` (FK), `amount`, `paymentMethodUniqueId` (FK), `paymentStatusUniqueId` (FK), `paymentTime` | B complete |
| **CommissionRates** | Time-bounded commission rate definitions (e.g. 10%). Effective/expiration dates allow rate changes. | `commissionRate` (%), `commissionRateEffectiveDate`, `commissionRateExpirationDate` | 0 |
| **CommissionStatus** | Lookup: PAID, PENDING, REQUESTED, FREE, CANCELED. | `commissionStatusId`, `statusName` (unique) | 0 |
| **Commission** | Per-journey commission created at `completeJourney`. `commissionAmount = rate × JourneyPayments.amount`. | `journeyDecisionUniqueId` (FK), `paymentUniqueId` (FK optional), `commissionRateUniqueId` (FK), `commissionAmount`, `commissionStatusUniqueId` (FK) | B complete |
| **TariffRate** | Reference freight tariff rates: standing (pickup), journey (per km), timing (per time). Effective/expiry dates. | `standingTariffRate`, `journeyTariffRate`, `timingTariffRate`, `tariffRateEffectiveDate`, `tariffRateExpirationDate` | 0 |
| **TariffRateForVehicleTypes** | Links a tariff rate to a specific vehicle type. | `vehicleTypeUniqueId` (FK), `tariffRateUniqueId` (FK) | 0 |
| **SubscriptionPlan** | Subscription tier definitions (free 30d, paid 30/90/365d). `isFree` flag for the auto-grant plan. | `planName` (unique), `isFree`, `durationInDays` | 0 |
| **SubscriptionPlanPricing** | Time-bounded pricing per plan (ETB). Allows price changes without invalidating existing subscriptions. | `subscriptionPlanUniqueId` (FK), `price`, `effectiveFrom`, `effectiveTo` | 0 |
| **UserSubscription** | Active subscription for a driver. Links driver → specific pricing tier + date range. | `driverUniqueId` (FK), `subscriptionPlanPricingUniqueId` (FK), `startDate`, `endDate` | 2 |
| **DepositSource** | Lookup: how a deposit was funded (driver cash, bonus, admin manual, transfer). | `sourceKey` (unique), `sourceLabel` | 0 |
| **FinancialInstitutionAccounts** | Bank/mobile-money accounts where deposits are sent. Admin-managed. `accountType` ENUM(bank, mobile_money, wallet). | `institutionName`, `accountHolderName`, `accountNumber`, `accountType`, `isActive` | 0 |
| **UserDeposit** | Driver's deposit request. Lifecycle: `requested` → `approved`\|`rejected`. `depositURL` stores receipt scan. | `driverUniqueId` (FK), `depositAmount`, `depositSourceUniqueId` (FK), `accountUniqueId` (FK), `depositStatus`, `depositURL`, `acceptRejectReason` | 2 |
| **UserBalance** | Append-only ledger: one row per balance-affecting transaction (Deposit, Commission, Transfer, Refund, Subscription, freeGift). `netBalance` = running total at row time. **Never updated in place.** | `userUniqueId` (FK), `transactionType`, `transactionUniqueId`, `transactionTime`, `userBalanceAdjustmentType` ENUM(reversal, adjustment, creation), `netBalance` | 2 |
| **UserBalanceTransfer** | Peer-to-peer wallet transfer between two drivers. Appends debit + credit rows to `UserBalance`. | `fromDriverUniqueId` (FK), `toDriverUniqueId` (FK), `transferredAmount`, `transferredBy` (FK admin/system) | F |
| **UserRefund** | Refund request and approval. Links to `FinancialInstitutionAccounts` for payout. `refundUrl` stores proof document. | `userUniqueId` (FK), `refundAmount`, `refundStatus` ENUM(requested, approved), `accountUniqueId` (FK), `refundUrl`, `refundedBy` (FK admin) | F |

### 19.7 Ratings & Delivery Confirmation

| Table | Purpose | Key columns | Phase |
|---|---|---|---|
| **Ratings** | Mutual rating after a completed individual journey. One rating per journey decision (UNIQUE on `journeyDecisionUniqueId`). | `journeyDecisionUniqueId` (FK unique), `ratedBy` (FK), `rating` (int), `comment` | D |
| **DeliveryConfirmations** | Proof-of-delivery record for a completed journey. PENDING → CONFIRMED \| DISPUTED. Multiple sources: FORMAL_POD, RECEIPT_AUTO, SHIPPER_DIRECT, AUTO_NO_POD, DELINQUENCY_DISPUTE. Includes OTP-based Tier A signing and SHA-256 hash chain for tamper evidence. `liveJourneyKey` (generated) ensures only one live confirmation per journey while allowing soft-delete + re-create. | `journeyUniqueId` (FK), `receiverUserUniqueId` (FK), `confirmedByUserUniqueId` (FK), `deliveryConfirmationStatus`, `deliveryConfirmationSource`, `deliveryConfirmationCondition`, `deliveryConfirmationSignatureHash`, `deliveryConfirmationPreviousHash`, OTP fields (`otpHash`, `otpExpiresAt`, `otpAttempts`, `otpVerifiedAt`), `liveJourneyKey` | D |
| **DeliveryConfirmationPhotos** | Photo evidence set for a delivery confirmation. Append-only in normal operation. | `deliveryConfirmationUniqueId` (FK), `deliveryConfirmationPhotoUrl` | D |

### 19.8 Comms

| Table | Purpose | Key columns | Phase |
|---|---|---|---|
| **SMSSender** | SMS gateway config used by OTP delivery. Admin-managed credentials. | `phoneNumber`, `password` (hashed) | 0 |

### 19.9 Delinquency & Bans

| Table | Purpose | Key columns | Phase |
|---|---|---|---|
| **DelinquencyTypes** | Catalogue of violation types with default points and severity. `applicableRoles` FK controls which roles this type can be issued against. | `delinquencyTypeName` (unique), `defaultPoints`, `defaultSeverity` ENUM(LOW, MEDIUM, HIGH, CRITICAL), `applicableRoles` (FK → Roles.roleUniqueId), `isActive` | 0 |
| **UserDelinquency** | One accusation record per incident against a driver. Soft-deleted on EXONERATED. `responseDeadline` auto-set by severity (CRITICAL=1d, HIGH=3d, MEDIUM=5d, LOW=7d). | `userUniqueId` (FK), `roleId` (FK), `delinquencyTypeUniqueId` (FK), `delinquencySeverity`, `delinquencyPoints`, `journeyDecisionUniqueId` (FK optional), `responseDeadline`, `isDelinquencySeenByAdmin` | E |
| **UserDelinquencyResponse** | Driver's written defense against a delinquency. Optional — admin can rule without one. `isLateResponse` set if submitted after `responseDeadline`. | `userDelinquencyUniqueId` (FK), `userDelinquencyResponse` (TEXT), `isLateResponse` | E |
| **AdminDecisionOnUserDelinquency** | Admin's formal ruling on a user delinquency. UPHELD triggers automatic ban check. Outcomes: EXONERATED, UPHELD, REDUCED, DISMISSED. | `userDelinquencyUniqueId` (FK), `userDelinquencyResponseUniqueId` (FK nullable), `decisionOutcome` ENUM, `adminDecisionText`, `delinquencyPointsAfter` (set on REDUCED) | E |
| **BannedUsers** | Active bans against a driver+role. `isActive` flipped to false on unban. Graduated: 15pts→3d, 30pts→7d, 60pts→90d, 90pts→365d. | `userUniqueId` (FK), `roleId` (FK), `banAt`, `bannedBy`, `banReason`, `banDurationDays`, `banExpiresAt`, `isActive` | E |
| **BannedUserDelinquency** | Junction: links one ban to all contributing delinquencies. `pointsAtTime` snapshot per delinquency row. | `banUniqueId` (FK), `userDelinquencyUniqueId` (FK); unique on (banUniqueId, userDelinquencyUniqueId) | E |
| **CompanyDelinquency** | Violation record against a transport company. Mirrors `UserDelinquency` but uses `companyUniqueId`. Optional links to `JourneyDecisions` (driver leg) and `CompanyBidRequest` (entire contract). | `companyUniqueId` (FK), `delinquencyTypeUniqueId` (FK), `delinquencySeverity`, `delinquencyPoints`, `journeyDecisionUniqueId` (FK optional), `companyBidRequestUniqueId` (FK optional), `responseDeadline` | E |
| **CompanyDelinquencyResponse** | Company's written defense. `isLateResponse` if submitted after `responseDeadline`. | `companyDelinquencyUniqueId` (FK), `companyDelinquencyResponse` (TEXT), `isLateResponse` | E |
| **AdminDecisionOnDelinquency** | Admin's formal ruling on a company delinquency. Same EXONERATED/UPHELD/REDUCED/DISMISSED enum as user side. | `companyDelinquencyUniqueId` (FK), `companyDelinquencyResponseUniqueId` (FK nullable), `decisionOutcome` ENUM, `adminDecisionText`, `delinquencyPointsAfter` | E |
| **CompanyBan** | Active bans against a transport company. `banSource` ENUM(auto_threshold, admin_decision). Links to `AdminDecisionOnDelinquency` when admin-triggered. | `companyUniqueId` (FK), `bannedBy`, `banReason`, `banDurationDays`, `banExpiresAt`, `isActive`, `banSource`, `adminDecisionOnDelinquencyUniqueId` | E |
| **CompanyBanDelinquency** | Junction: links one company ban to all contributing delinquencies. `pointsAtTime` snapshot per delinquency. | `companyBanUniqueId` (FK), `companyDelinquencyUniqueId` (FK); unique on (companyBanUniqueId, companyDelinquencyUniqueId) | E |

### 19.10 Company Fleet

| Table | Purpose | Key columns | Phase |
|---|---|---|---|
| **TransportCompany** | Core entity for a registered freight company. `approvalStatus` ENUM(pending, approved, rejected, suspended). `isDeleted` soft-delete. | `companyUniqueId`, `companyName`, `companyRegistrationNumber` (unique nullable), `approvalStatus`, `approvedBy` (FK), `isDeleted` | C |
| **CompanyProfileHistory** | Append-only field-level audit log for company profile + status changes. `source` ENUM: registration, document_approval, ban, unban, profile_update, manual. | `companyUniqueId` (FK), `fieldName`, `oldValue`, `newValue`, `source`, `referenceUniqueId` | C |
| **CompanyRoles** | Company-internal role catalogue (owner, manager, dispatcher, driver). Separate from system `Roles`. | `companyRoleUniqueId`, `companyRoleName` (unique) | C |
| **CompanyMembership** | Links a user to a transport company with an internal role. One active membership per user per company (unique key). | `companyUniqueId` (FK), `userUniqueId` (FK), `companyRoleUniqueId` (FK), `isActive`, `membershipStartDate`, `membershipEndDate` | C |
| **CompanyVehicle** | Assigns a `Vehicle` to a company fleet. `assignmentStatus` ENUM(active, inactive). One vehicle per company at a time (unique key). | `companyUniqueId` (FK), `vehicleUniqueId` (FK), `assignmentStatus`, `assignmentStartDate`, `assignmentEndDate` | C |
| **CompanyBidRequest** | A company's bid on a shipper batch. One bid per company per batch (unique key). Lifecycle: submitted → accepted_by_shipper \| rejected_by_shipper \| cancelled_by_company \| expired \| completed. | `companyBidRequestUniqueId`, `shipperRequestBatchUniqueId` (FK), `companyUniqueId` (FK), `bidSubmittedByUserUniqueId` (FK), `numberOfVehiclesOffered`, `proposedCostPerVehicle`, `proposedTotalCost`, `bidStatus`, `journeyStatusId`, `isCancellationSeenByCompany` | C |
| **CompanyBidVehicleAssignment** | Per-slot assignment after bid acceptance: one `ShipperRequest` ↔ one `Vehicle` ↔ one `Driver`. Auto-creates a `DriverRequest` row in Step 1; creates `JourneyDecisions` in Step 2 (driver confirms). Lifecycle: assigned → confirmed_by_driver \| rejected_by_driver \| cancelled_by_* \| reassigned \| completed. | `companyBidRequestUniqueId` (FK), `shipperRequestUniqueId` (FK), `vehicleUniqueId` (FK), `driverUserUniqueId` (FK), `driverRequestUniqueId` (FK auto-created), `journeyDecisionUniqueId` (FK set at confirm), `assignmentStatus` | C |
| **CompanyCommission** | Commission charged per accepted bid. **Schema exists; no write path implemented yet.** One record per bid (unique key). | `companyBidRequestUniqueId` (FK unique), `companyUniqueId` (FK), `commissionRateUniqueId` (FK), `baseTotalCost`, `commissionRate`, `commissionAmount`, `commissionStatusUniqueId` (FK), `paidAt`, `paidBy` | ⚠️ schema only |
| **CompanyRating** | Shipper rates a company after a completed freight job. One rating per bid (UNIQUE on `companyBidRequestUniqueId`). `rating` 1-5. | `companyBidRequestUniqueId` (FK unique), `companyUniqueId` (FK), `ratedByUserUniqueId` (FK), `rating`, `comment` | D |

### 19.11 Queue Dispatch

| Table | Purpose | Key columns | Phase |
|---|---|---|---|
| **QueueOrganization** | A registered queue org (customs, factory, cement depot…). `queueEnabled` must be TRUE for dispatch to run. `checkinRadiusKm` enforced by Haversine at check-in. | `queueOrganizationUniqueId`, `queueOrganizationType` ENUM(customs, factory, cement, depot, other), `latitude`, `longitude`, `checkinRadiusKm` (default 15), `approvalStatus`, `queueEnabled`, `isDeleted` | Q |
| **QueueOrganizationMembership** | Links users (queueOrgAdmin role 9, dispatcher role 10) to a queue org. One active membership per user per org (unique key). | `queueOrganizationUniqueId` (FK), `userUniqueId` (FK), `roleId` (FK), `isActive`, `membershipStartDate` | Q |
| **DriverQueue** | The virtual waiting line per (org, date). `queueNumber` is FIFO position per (org, date, vehicleType). Re-check-in soft-deletes previous row and inserts a new one at the back. `targetedShipperUserUUID` reserves a position for orders from a specific shipper only. | `queueOrganizationUniqueId` (FK), `queueDate`, `queueNumber`, `queueRefusalCount`, `vehicleDriverUniqueId` (FK), `shipperRequestUniqueId` (FK nullable), `targetedShipperUserUUID` (FK nullable), `driverLatitude/Longitude`, `joinedAt`, `status` (journeyStatusId), `requestedAt`, `agreedAt` | Q |
| **DriverQueueHistory** | Full-snapshot audit trail for `DriverQueue`. Each mutation inserts a complete mirror of the row BEFORE the change + `historyEvent` + `performedBy`. INSERT events store the just-created row (no prior state). Reconstruct transitions by diffing consecutive snapshots. | mirrors all `DriverQueue` columns + `historyEvent` (checkin/recheckin/checkout/offer/accept/…), `performedBy` (FK), `performedAt` | Q |
| **QueueAuditLog** | Immutable log of supervisor overrides (override/remove/manual_checkin/dispatch). Stores before/after JSON snapshots and a reason. | `queueOrganizationUniqueId` (FK), `queueDate`, `queueUniqueId` (FK nullable), `action` ENUM, `beforeValue`, `afterValue`, `reason`, `performedBy` (FK) | Q |
| **DriverBid** | Individual driver bids on a queue order opened for bidding (`isBiddingApproved=true`). One bid per driver per order (unique key). Lifecycle: submitted → selected \| not_selected \| withdrawn \| expired. | `shipperRequestUniqueId` (FK), `shipperRequestBatchUniqueId` (FK), `driverUserUniqueId` (FK), `driverRequestUniqueId` (FK), `bidAmount`, `bidStatus`, `journeyStatusId` (FK) | Q |

---

## 20. Write Matrix — What Writes Which Table

Cross-map of every non-lookup table to the operational step that creates rows.

| Business step | Creates / writes |
|---|---|
| Seed (init) | `Roles`, `Statuses`, `VehicleTypes`, `DocumentTypes`, `RoleDocumentRequirements`, `VehicleStatusTypes`, `JourneyStatus`, `SubscriptionPlan`, `SubscriptionPlanPricing`, `DepositSource`, `FinancialInstitutionAccounts`, `PaymentMethod`, `PaymentStatus`, `CommissionRates`, `CommissionStatus`, `CancellationReasonsType`, `DelinquencyTypes`, `TariffRate`, `TariffRateForVehicleTypes`, `SMSSender` |
| Register user | `Users`, `usersCredential`, `UserRole`, `UserRoleStatusCurrent`, `UserRoleStatusHistory` |
| OTP / login | `usersCredential` (verified=1); `DeviceTokens` (FCM registration) |
| Profile update | `UsersHistory`, `UserProfileHistory` |
| Create vehicle (self) | `Vehicle`, `VehicleStatus`, `VehicleOwnership`, `VehicleDriver` |
| Upload / approve docs | `AttachedDocuments`, `AttachedDocumentsHistory` (+`RoleDocumentRequirements` check); on approve → `UserRoleStatusCurrent`/`History` recalc |
| Subscribe / deposit | `UserSubscription`, `UserDeposit`, `UserBalance` |
| Balance transfer | `UserBalanceTransfer`, `UserBalance` (debit + credit rows) |
| Refund | `UserRefund`, `UserBalance` (credit row) |
| Company create / approve | `TransportCompany`, `CompanyMembership`, `CompanyProfileHistory`, `CompanyRoles` |
| Company fleet | `CompanyVehicle`, `VehicleDriver`, `VehicleOwnership` |
| Queue setup | `QueueOrganization`, `QueueOrganizationMembership`, `QueueAuditLog` |
| Driver check-in | `DriverQueue`, `DriverQueueHistory` |
| Queue dispatch / re-offer | `DriverQueue` (status), `DriverQueueHistory` (snapshot), `DriverBid` (bid-base), `JourneyDecisions` |
| Shipper request | `ShipperRequest`, `ShipperRequestBatch` |
| Individual match | `DriverRequest`, `JourneyDecisions` (bid + accept/reject) |
| Company bid | `CompanyBidRequest` (+ socket event) |
| Company assignment | `CompanyBidVehicleAssignment`, `DriverRequest` (auto-created), `JourneyDecisions` (at driver confirm) |
| Journey ladder — all flows | `Journey` (stage 4-9 GPS columns), `JourneyDecisions`, `ShipperRequest` (+status), `DriverRequest` (+status), `JourneyRoutePoints` (GPS pings), `JourneyNotifications` |
| Cancellation | `CanceledJourneys`, `DriverRequest`/`ShipperRequest`/`JourneyDecisions` (+status) |
| Journey fees | `JourneyPayments`, `Commission` |
| Delivery confirmation | `DeliveryConfirmations`, `DeliveryConfirmationPhotos` |
| Ratings | `Ratings` (individual), `CompanyRating` (company bid) |
| Delinquency/ban (driver) | `UserDelinquency`, `UserDelinquencyResponse`, `AdminDecisionOnUserDelinquency`, `BannedUsers`, `BannedUserDelinquency`, `UserRoleStatusCurrent`/`History` (→ status 6 BANNED) |
| Delinquency/ban (company) | `CompanyDelinquency`, `CompanyDelinquencyResponse`, `AdminDecisionOnDelinquency`, `CompanyBan`, `CompanyBanDelinquency`, `CompanyProfileHistory` |

> **Not yet wired at runtime:** `CompanyCommission` (schema only), `VehicleStatus` transitions beyond creation (see 13.2 ⚠️).

### Known gaps / things to fix

1. **No admin vehicle-approval endpoint** — vehicle is ACTIVE on self-registration; statuses only change via generic token-only `PUT /api/vehicleStatus/:vehicleStatusUniqueId`. If a review gate is needed, it must be built.
2. **`E2E_GUIDE.md` status IDs are stale** (journeyStarted=5, 14-status map). The canonical map is section 16.0 / `E2ETests/constants.js:22-43`.
3. **`CompanyCommission`** is schema-only — individual `Commission` is the only live write path.
4. **`UserRefund` status enum** mismatch likely (see 17 ⚠️) — verify before wiring an automated refund flow.
5. E2E individual and company journeys skip loading stages (5/6/7) — section 16.5; loading stages verified only via Queue suite (`verifyLoadingStages.js`).
6. `resetDatabase` never truncates tables; re-running the suite relies on the fresh-match/leftover-rejection pattern, not clean state.
7. **`freight_bidding_lifecycle.md`** workflow uses stale endpoint name (`/api/shipper/createShipperRequestBatch`) and stale status IDs (startJourney=5, completeJourney=6) — the canonical reference is this document.

---

## 21. Quick Operational Cheat-Sheet (full sequence)

```
register+OTP+login
  └─ driver:  vehicle → user docs → vehicle docs → [admin approves] → auto free sub
              → deposit → [admin approves] → ACTIVE
  └─ company: company → docs → [approve] → roles/members → fleet → can bid
  └─ queue:   org → [approve+enable] → staff → drivers check-in

request (≤9 individual | >9 company | queue org)
  ├─ individual: createRequest → match(requested=2) → acceptShipperRequest(3)
  │              → acceptDriverOffer(4) → goToLoadingPlace(5) → startLoading(6)
  │              → loadCompleted(7) → startJourney(8) → completeJourney(9)
  ├─ company:   bid(submitted) → shipper accept → N x ShipperRequest
  │             → fleet → assignment → driver confirm(4) → same 5→6→7→8→9
  └─ queue:     dispatch → offer(3min) → accept(3) | refusal → re-offer
               → journey mirrors 5→6→7→8→9 → DriverQueueHistory

post-journey: delivery confirm + POD photos → ratings → Commission → withdrawal
enforcement:  delinquency x3 → ban → status ladder (banned overrides all)
```mpleted(7) → startJourney(8) → completeJourney(9)
  ├─ company: bid(submitted) → shipper accept → N x ShipperRequest
  │           → fleet → assignment → driver confirm → journey(4→8→9)
  └─ queue: dispatch → offer(3min) → accept | refusal → re-offer
           → journey mirrors 5-9 → DriverQueueHistory

post-journey: delivery confirm + POD → ratings → Commission → withdrawal
enforcement: delinquency x3 → ban → ladder (banned overrides)
```
