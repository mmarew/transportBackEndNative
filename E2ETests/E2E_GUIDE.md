# E2E Testing Guide — Transport Backend

> **Last updated:** June 2026  
> **Runner:** `npm run test:e2e` (or `node E2ETests/index.js`)  
> **Environment:** Local (`http://127.0.0.1:3000`) — never run against production

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Directory Structure](#2-directory-structure)
3. [Prerequisites & Setup](#3-prerequisites--setup)
4. [Shared Utilities](#4-shared-utilities)
5. [How to Write a New Test File](#5-how-to-write-a-new-test-file)
6. [Full Test Execution Order](#6-full-test-execution-order)
   - [Phase 0 — Reset Database](#phase-0--reset-database)
   - [Phase 1 — Core Users Setup](#phase-1--core-users-setup)
   - [Phase 2 — Driver Onboarding & Document Approval](#phase-2--driver-onboarding--document-approval)
   - [Phase A — Reference Data CRUD](#phase-a--reference-data-crud)
   - [Phase B — Individual Journey Flow](#phase-b--individual-journey-flow)
   - [Phase C — Company Journey Flow](#phase-c--company-journey-flow)
   - [Phase D — Post-Journey CRUD](#phase-d--post-journey-crud)
   - [Phase E — Delinquency Lifecycle](#phase-e--delinquency-lifecycle)
7. [Individual Journey Flow — Step by Step](#7-individual-journey-flow--step-by-step)
8. [Company Journey Flow — Step by Step](#8-company-journey-flow--step-by-step)
9. [Delinquency Lifecycle — Step by Step](#9-delinquency-lifecycle--step-by-step)
10. [Journey Status State Machine](#10-journey-status-state-machine)
11. [Running the Tests](#11-running-the-tests)
12. [Test Data Reference](#12-test-data-reference)
13. [Error Handling Conventions](#13-error-handling-conventions)
14. [Checklist — Before Adding a New Flow](#14-checklist--before-adding-a-new-flow)

---

## 1. Overview & Architecture

These are **end-to-end integration tests** that call the live HTTP API. They run as plain Node.js scripts — not Jest unit tests — and exercise the full stack including database writes.

### Design Principles

| Principle | How it is applied |
|-----------|------------------|
| **Sequential execution** | Every `async/await` step must resolve before the next starts |
| **Shared in-memory state** | `usersData` in `constants.js` stores tokens, IDs, and data across all test files |
| **Fail-fast** | Critical failures `throw` immediately; the top-level runner catches and exits with code 1 |
| **Graceful skips** | Non-critical steps that lack prerequisites log a `⏩ Skipped` message and `return { skipped: true }` |
| **No silent failures** | Every `catch` block logs with `❌` prefix and re-throws; empty catch blocks are forbidden |
| **Idempotent where possible** | Duplicate-check guards (e.g., company already exists, document already uploaded) prevent data pollution on re-runs |
| **Emoji log markers** | `✅ ❌ ⚠️ ⏩ 📋 🔄` give instant visual feedback in the terminal |

---

## 2. Directory Structure

```
E2ETests/
│
├── index.js                      ← Main runner / orchestrator (5 phases)
├── constants.js                  ← Shared state: tokens, IDs, user data, caches
├── Utils.js                      ← authConfig(token) header helper
├── dummy.txt                     ← Fake file used for multipart document uploads
├── E2E_GUIDE.md                  ← THIS FILE
├── TESTING_TEMPLATE.md           ← Boilerplate template for new test files
│
├── Auth/
│   ├── RegisterUser.js           ← POST /api/user/createUser
│   ├── VerifyByOtp.js            ← POST /api/user/verifyUserByOTP  → stores token
│   ├── LoginUser.js              ← POST /api/user/loginUser
│   └── index.js                  ← testAuthWorkFlow, testVerifyAndLoginUser
│
├── DataBaseManagement/
│   └── index.js                  ← dropTables, createTables, installPredefinedData, resetDatabase
│
├── Admin/
│   ├── index.js                  ← testCreateAdminFlow (SuperAdmin creates Admin)
│   ├── fetchData.js              ← fetchUnAuthorizedDrivers
│   └── AuthorizeDocs.js          ← authorizeDriversDocuments
│
├── Roles/
│   ├── index.js                  ← testGetRoles, testCreateRoles, testRolesWorkFlows
│   └── UserStatus.js             ← testUserStatusWorkflow (Status CRUD)
│
├── Driver/
│   ├── index.js                  ← testDriverOnboardingFlow
│   ├── RequirementOfDriver.js    ← getDriversAccountData, evaluateDriversDocumentVehicleRequirement
│   ├── VehicleDriver.js          ← createVehicle, attachVehiclesDocuments
│   ├── DriversDocuments.js       ← createDriverDocument
│   ├── DriverRequest.js          ← testCreateDriverRequest, testCancelDriverRequest, …
│   ├── DriverJourneyStatus.js    ← getDriverJourneyStatus, acceptShipperRequest,
│   │                                acceptCompanyAssignment, startJourney, completeJourney
│   └── DriversFinance/
│       ├── DriverBalance.js      ← Driver wallet balance queries
│       ├── DriverDeposit.js      ← Deposit to driver wallet
│       ├── DriverSubscription.js ← Activate/check driver subscription
│       ├── DriverTransfer.js     ← Wallet transfer between drivers
│       ├── DriverWallet.js       ← Full wallet flow
│       ├── SubscriptionPlan.js   ← Subscription plan CRUD
│       ├── SubscriptionPlanPricing.js ← Pricing CRUD
│       ├── FinancialInstitutions.js   ← Bank account CRUD
│       └── DepositSources.js     ← Deposit source CRUD
│
├── Shipper/
│   ├── Index.js                  ← testShipperOnboardingFlow
│   ├── ShipperRequest.js         ← testCreateShipperRequest, testAcceptDriverRequest,
│   │                                testRejectDriverOffer, testCancelShipperRequest,
│   │                                testGetCancellationNotification, testMarkJourneyCancellationAsSeen
│   ├── VerifyShipperStatus.js    ← verifyShipperStatus
│   └── CreatedShipper.js         ← Shipper profile helpers
│
├── Company/
│   ├── index.js                  ← createCompanyAdminFlow (full setup), exports delinquency tests
│   ├── CompanyProfileManagement.js ← createCompanies, attachCompanyDocuments,
│   │                                  approveCompanyDocuments, approveCompanyStatus
│   ├── BidManagement.js          ← getAvailableBids, participateInBid, acceptCompanyOffer,
│   │                                initiateCompanyBiddingWorkFlow
│   ├── CompanyVehicle.js         ← assignVehicleToCompany
│   ├── AssignDrivers.js          ← assignDrivers
│   ├── CompanyDelinquency.js     ← testCompanyDelinquencyWorkflow, testCreateCompanyDelinquency,
│   │                                testCreateCompanyDelinquencyResponse
│   ├── CompanyAdminDecision.js   ← testCompanyAdminDecisionWorkflow (full CRUD)
│   └── CompanyBan.js             ← testCompanyBanWorkflow, testBanCompany, testUnbanCompany
│
├── Journey/
│   ├── Journey.js                ← testJourneyWorkflow, testGetJourneys, testGetOngoingJourney,
│   │                                testGetCompletedJourneys (CREATE is system-driven)
│   ├── JourneyStatus.js          ← testJourneyStatusWorkflow (full CRUD)
│   ├── JourneyDecisions.js       ← testJourneyDecisionsWorkflow, testGetJourneyDecisions,
│   │                                testUpdateJourneyDecision (CREATE is system-driven)
│   ├── JourneyRoutePoints.js     ← testJourneyRoutePointsWorkflow (full CRUD, needs active journey)
│   ├── CanceledJourneys.js       ← testCanceledJourneysWorkflow (GET/UPDATE/mark seen,
│   │                                system-populated on cancellations)
│   ├── CancellationReasonsType.js ← testCancellationReasonsTypeWorkflow (full CRUD)
│   └── index.js                  ← exports all journey tests
│
├── Vehicles/
│   ├── VehicleType.js            ← testVehicleTypeWorkflow (full CRUD)
│   ├── VehicleStatusType.js      ← testVehicleStatusTypeWorkflow (full CRUD)
│   ├── VehicleOwnership.js       ← testVehicleOwnershipWorkflow (uses driver onboarding data)
│   ├── VehicleDriver.js          ← testVehicleDriverWorkflow (uses driver onboarding data)
│   ├── VehiclesProfile.js        ← testVehicleProfileWorkflow (vehicle GET/UPDATE, uses existing)
│   └── index.js                  ← exports all vehicle tests
│
├── Documents/
│   ├── DocumentTypes.js          ← testDocumentTypesWorkflow (full CRUD)
│   ├── RoleDocumentRequirements.js ← testRoleDocumentRequirementsWorkflow (full CRUD)
│   └── index.js                  ← exports all document tests
│
├── Status/
│   ├── Status.js                 ← testStatusWorkflow (full CRUD for global status list)
│   ├── UserRoleStatus.js         ← testUserRoleStatusWorkflow (GET current, GET by phone, UPDATE)
│   └── index.js                  ← exports all status tests
│
├── Finance/
│   ├── CommissionStatus.js       ← testCommissionStatusWorkflow (full CRUD)
│   ├── TariffRate.js             ← testTariffRateWorkflow (full CRUD)
│   ├── DepositSource.js          ← testDepositSourceWorkflow (full CRUD)
│   ├── FinancialInstitutionAccount.js ← testFinancialInstitutionAccountWorkflow (full CRUD)
│   ├── SubscriptionPlan.js       ← testSubscriptionPlanWorkflow (full CRUD)
│   ├── Ratings.js                ← testRatingsWorkflow (GET/CRUD, skips if no journey data)
│   └── index.js                  ← exports all finance tests
│
└── Delinquency/
    ├── DelinquencyTypes.js       ← testDelinquencyTypesWorkflows (full CRUD)
    ├── Delinquency.js            ← testDelinquencyWorkflow (full CRUD for user delinquencies)
    ├── DelinquencyResponse.js    ← testDelinquencyResponseWorkflow (driver dispute response)
    ├── AdminDecision.js          ← testAdminDecisionWorkflow (admin ruling on user delinquency)
    ├── BannedUsers.js            ← testBanWorkflow (ban/update/deactivate)
    └── index.js                  ← testFullDelinquencyLifecycle (chained lifecycle test)
```

---

## 3. Prerequisites & Setup

### Environment

| Requirement | Notes |
|-------------|-------|
| Node.js ≥ 18 | Run `npm install` first |
| Local server running | `npm run dev` on port 3000 |
| `.env` contains `API_KEY` | Used by dev-only bypass endpoints |
| MySQL database reachable | Connection string in `.env` |

### Environment Variables (`.env`)

```env
API_KEY=dev-api-key   # Must match x-api-key header in DataBaseManagement tests
```

### Pre-seeded SuperAdmin

The SuperAdmin (`supperAdmin@supperAdmin.com`, phone `+251983222221`) must exist in the auth system **before** `resetDatabase()` runs. It survives the reset because the test uses OTP verification (not registration) to get its token. The OTP is always `101010`.

---

## 4. Shared Utilities

### `constants.js` — Central State Store

All test functions read from and write back to this single object:

```js
const { usersData } = require("../constants");

// Key fields populated during the test run:
usersData.supperAdmin.token
usersData.admin.token
usersData.driver.token
usersData.driver.accountData        // Full account: vehicle, userData, unAttachedDocumentTypes
usersData.driver.journeyStatus      // Latest journey state: { status, uniqueIds, companyAssignment }
usersData.shipper.token
usersData.companyAdmin.token
usersData.companyAdmin.companies    // Array of company objects
usersData.companyAdmin.bids         // Bid lists keyed by bidStatus string
```

Other shared caches:

```js
const { listOfDelinquencyTypes, listOfRoles } = require("../constants");
// Populated by testGetDelinquencyTypes() and testGetRoles()
```

### `Utils.js` — `authConfig(token)`

Always use this helper — never hardcode headers:

```js
const { authConfig } = require("../Utils");

await axios.get(url, authConfig(token));
await axios.post(url, payload, authConfig(token));
await axios.put(url, payload, authConfig(token));
await axios.delete(url, authConfig(token));
```

---

## 5. How to Write a New Test File

Every test file follows the same pattern: four CRUD functions + one workflow that chains them.

### 5.1 File skeleton

```js
// CRUD for [EntityName]
// Brief description of what this entity does

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/[full-path]";
const cache = { data: null }; // module-level cache for GET results

// ── GET ────────────────────────────────────────────────────────────────────────
const testGet[Entity] = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ [Entity] fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGet[Entity]:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreate[Entity] = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.post(backendURL + BASE_URL, payload, authConfig(token));
    console.log("✅ [Entity] created:", result.data.[uniqueIdField] || result.data.data?.[uniqueIdField]);
    return result.data;
  } catch (error) {
    console.error("❌ testCreate[Entity]:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdate[Entity] = async ({ user, [uniqueIdField], payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = [uniqueIdField] || cache.data?.[0]?.[uniqueIdField];
    if (!id) throw new Error("No ID found to update");
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, payload, authConfig(token));
    console.log("✅ [Entity] updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdate[Entity]:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDelete[Entity] = async ({ user, [uniqueIdField] } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = [uniqueIdField] || cache.data?.[0]?.[uniqueIdField];
    if (!id) throw new Error("No ID found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ [Entity] deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDelete[Entity]:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const test[Entity]Workflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── [Entity] Workflow ──");

  await testGet[Entity]({ user });

  const created = await testCreate[Entity]({ user, payload: { /* required fields */ } });
  const uniqueId = created?.[uniqueIdField] || created?.data?.[uniqueIdField];
  if (!uniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGet[Entity]({ user });
  await testUpdate[Entity]({ user, [uniqueIdField]: uniqueId, payload: { /* update fields */ } });
  await testGet[Entity]({ user });
  await testDelete[Entity]({ user, [uniqueIdField]: uniqueId });
  await testGet[Entity]({ user });

  console.log("── [Entity] Workflow complete ──\n");
  return { uniqueId };
};

module.exports = {
  test[Entity]Workflow,
  testGet[Entity],
  testCreate[Entity],
  testUpdate[Entity],
  testDelete[Entity],
};
```

### 5.2 Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| File | PascalCase | `CancellationReasonsType.js` |
| Functions | `test[Action][Entity]` | `testCreateShipperRequest` |
| Workflow | `test[Entity]Workflow` | `testJourneyStatusWorkflow` |
| Log success | `✅ Entity action: id` | `✅ Journey status created: abc-123` |
| Log failure | `❌ testFunctionName: message` | `❌ testGetJourneyStatuses: 404` |
| Log skip | `⏩ Skipping — reason` | `⏩ Skipping — no journeyDecisionUniqueId` |

### 5.3 Graceful Skips vs. Hard Failures

```js
// SKIP (non-critical — missing prerequisite data)
if (!companyUniqueId) {
  console.warn("⏩ Skipped — run company setup flow first");
  return { skipped: true };
}

// THROW (critical — test cannot meaningfully continue)
if (!usersData.driver.token) {
  throw new Error("Driver token not set — cannot continue");
}
```

### 5.4 Registering a New Flow in `index.js`

```js
// 1. Import at top of index.js
const { testMyEntityWorkflow } = require("./MyDomain/MyEntity");

// 2. Call in the correct phase function
const runReferenceCRUD = async () => {
  // ...
  await testMyEntityWorkflow({});
};
```

---

## 6. Full Test Execution Order

The `index.js` runner executes these phases **in strict order**. Each phase depends on all previous phases having succeeded.

```
Phase 0 → Phase 1 → Phase 2 → Phase A → Phase B → Phase C → Phase D → Phase E
```

### Phase 0 — Reset Database

**File:** `DataBaseManagement/index.js` → `resetDatabase()`

```
1. POST /api/admin/dropAllTables       → wipe entire schema
2. POST /api/admin/createTable         → recreate all tables
3. POST /api/user/verifyUserByOTP      → verify SuperAdmin (survives reset)
4. GET  /api/admin/installPreDefinedData → install all seed data:
     - Roles (10 roles)
     - Statuses (8 statuses)
     - VehicleStatusTypes (6 types)
     - VehicleTypes (8 types)
     - JourneyStatuses (17 statuses)
     - DocumentTypes (11 types)
     - RoleDocumentRequirements (driver, shipper, company, vehicle, companyAdmin, dispatcher)
     - CancellationReasons (65 reasons)
     - DelinquencyTypes (9 types)
     - TariffRates, CommissionRates, DepositSources, SubscriptionPlans
     - FinancialInstitutionAccounts, CommissionStatuses, PaymentMethods, PaymentStatuses
```

> **After this phase:** `usersData.supperAdmin.token` is set.

---

### Phase 1 — Core Users Setup

```
1. testCreateAdminFlow({})
   └─ SuperAdmin calls POST /api/admin/createUserByAdminOrSuperAdmin
   └─ New admin verifies via OTP → usersData.admin.token set

2. testGetRoles()
   └─ GET /api/admin/roles → listOfRoles.data populated
```

> **After this phase:** `usersData.admin.token` is set and roles cache is ready.

---

### Phase 2 — Driver Onboarding & Document Approval

```
1. testDriverOnboardingFlow({ userType: "driver" })
   ├─ Register → POST /api/user/createUser
   ├─ Verify OTP → POST /api/user/verifyUserByOTP → usersData.driver.token set
   ├─ Login → POST /api/user/loginUser
   ├─ GET /api/driver/account → fetch account state
   ├─ If no vehicle → POST /api/user/vehicles/driverUserUniqueId/self
   ├─ GET /api/driver/account → re-fetch with vehicle
   └─ For each unattached document:
       ├─ roleId 9 (vehicle doc) → POST /api/vehicle/attachDocuments/:vehicleUniqueId
       └─ roleId 2 (user doc)   → POST /api/user/attachDocuments/self

2. fetchUnAuthorizedDrivers({})
   └─ GET /api/admin/getUnAuthorizedDriver → finds PENDING documents

3. authorizeDriversDocuments({})
   └─ PUT /api/admin/acceptRejectAttachedDocuments (action: "ACCEPTED")
```

> **After this phase:** Driver is fully authorized. `usersData.driver.accountData` is populated.

---

### Phase A — Reference Data CRUD

Safe to run before journey flows. Tests full CRUD on all lookup/configuration tables.

| Test | Table | Route |
|------|-------|-------|
| `testVehicleTypeWorkflow` | VehicleTypes | `GET/POST/PUT/DELETE /api/admin/vehicleTypes` |
| `testVehicleStatusTypeWorkflow` | VehicleStatusTypes | `GET /api/vehicleStatusTypes`, `POST/PUT/DELETE /api/vehicleStatusType` |
| `testJourneyStatusWorkflow` | JourneyStatus | `GET/POST/PUT/DELETE /api/admin/journeyStatus` |
| `testCancellationReasonsTypeWorkflow` | CancellationReasonsType | `GET/POST/PUT/DELETE /api/admin/cancellationReasons` |
| `testDocumentTypesWorkflow` | DocumentTypes | `GET/POST/PUT/DELETE /api/documentTypes` |
| `testRoleDocumentRequirementsWorkflow` | RoleDocumentRequirements | `GET/POST/PUT/DELETE /api/RoleDocumentRequirements` |
| `testStatusWorkflow` | Statuses | `GET/POST/PUT/DELETE /api/admin/statuses` |
| `testDelinquencyTypesWorkflows` | DelinquencyTypes | `GET/POST/PUT/DELETE /api/admin/delinquencyTypes` |
| `testTariffRateWorkflow` | TariffRate | `GET/POST/PUT/DELETE /api/finance/tariffRate` |
| `testDepositSourceWorkflow` | DepositSource | `GET/POST/PUT/DELETE /api/finance/depositSource` |
| `testFinancialInstitutionAccountWorkflow` | FinancialInstitutionAccount | `GET/POST/PUT/DELETE /api/finance/financialInstitutionAccount` |
| `testSubscriptionPlanWorkflow` | SubscriptionPlan | `GET/POST/PUT/DELETE /api/finance/subscriptionPlan` |
| `testCommissionStatusWorkflow` | CommissionStatus | `GET/POST/PUT/DELETE /api/finance/commissionStatus/admin/commission-statuses` |

---

### Phase B — Individual Journey Flow

One driver, one shipper, one truck. Auto-matched by GPS.

```
1. testShipperOnboardingFlow({ requestMode: "individual_target" })
   ├─ Register/verify/login shipper
   └─ POST /api/shipperRequest/createRequest { requestMode: "individual_target", ... }

2. testCreateDriverRequest(token)
   └─ POST /api/driver/request { currentLocation: { lat, lng, description } }
      → Backend auto-matches driver to the waiting shipper request

3. getDriverJourneyStatus()
   └─ GET /api/driver/verifyDriverJourneyStatus → { status: 2, uniqueIds: { ... } }

4. acceptShipperRequest({ shippingCostByDriver: 5000 })  [status == 2]
   └─ PUT /api/driver/acceptShipperRequest
      { driverRequestUniqueId, shipperRequestUniqueId, journeyDecisionUniqueId, shippingCostByDriver }

5. testAcceptDriverRequest({ uniqueIds })  [status == 3]
   └─ PUT /api/shipper/acceptDriverRequest
      { driverRequestUniqueId, journeyDecisionUniqueId, shipperRequestUniqueId }

6. startJourney()  [status == 4]
   └─ PUT /api/driver/startJourney
      { driverRequestUniqueId, shipperRequestUniqueId, journeyDecisionUniqueId, latitude, longitude }

7. completeJourney()  [status == 5]
   └─ PUT /api/driver/completeJourney
      { driverRequestUniqueId, shipperRequestUniqueId, journeyDecisionUniqueId,
        journeyUniqueId, latitude, longitude }
```

---

### Phase C — Company Journey Flow

Fleet freight request. Company wins bid, assigns its own driver.

```
1. testShipperOnboardingFlow({ requestMode: "company_target" })
   └─ POST /api/shipperRequest/createRequest { requestMode: "company_target", numberOfVehicles: 10+ }

2. createCompanyAdminFlow({})
   ├─ Register/verify/login companyAdmin
   ├─ POST /api/company/companies → create company
   ├─ POST /api/company/attachDocuments/:companyUniqueId → attach documents
   ├─ PUT  /api/admin/acceptRejectAttachedDocuments → admin approves docs
   └─ PATCH /api/company/companies/:companyUniqueId/approve → admin approves company

3. initiateCompanyBiddingWorkFlow()
   ├─ GET  /api/company/bids?target=available&companyUniqueId=... → available freight bids
   └─ POST /api/company/bids { shipperRequestBatchId, companyUniqueId, proposedCostPerVehicle }

4. acceptCompanyOffer({ bid })
   └─ PATCH /api/company/bids/:companyBidRequestUniqueId/status { bidStatus: "accepted_by_shipper" }

5. assignVehicleToCompany({})
   └─ POST /api/company/fleet { companyUniqueId, vehicleUniqueId }

6. assignDrivers({ bid: acceptedBid })
   └─ POST /api/company/assignments { ... driver and vehicle assignment data }

7. acceptCompanyAssignment()  [driver side]
   └─ PATCH /api/company/assignments/:assignmentUniqueId/status
      { assignmentStatus: "confirmed_by_driver", originLatitude, originLongitude, originPlace }

8. startJourney()  [status == 4]
   └─ PUT /api/driver/startJourney { ... same as individual flow }

9. completeJourney()  [status == 5]
   └─ PUT /api/driver/completeJourney { ... same as individual flow }
```

---

### Phase D — Post-Journey CRUD

Tests entities that can only be meaningfully exercised after journey data exists.

| Test | Description |
|------|-------------|
| `testJourneyWorkflow` | GET journeys, GET by ID, UPDATE fare, GET ongoing/completed |
| `testJourneyDecisionsWorkflow` | GET decisions, UPDATE decision fields |
| `testCanceledJourneysWorkflow` | GET canceled records, UPDATE, mark seen by admin |
| `testRatingsWorkflow` | GET ratings; CREATE rating if journeyDecisionUniqueId available |
| `testVehicleProfileWorkflow` | UPDATE vehicle color; uses existing vehicle from driver onboarding |
| `testUserRoleStatusWorkflow` | GET current statuses, GET by phone, UPDATE (admin reactivate) |

---

### Phase E — Delinquency Lifecycle

Tests the full delinquency system for both users and companies.

**User Delinquency Chain:**

```
testDelinquencyWorkflow()
  └─ Admin creates delinquency on driver
  └─ Admin updates delinquency
  └─ Admin deletes delinquency
  └─ Full CRUD on /api/admin/userDelinquency

testDelinquencyResponseWorkflow()
  └─ Creates fresh delinquency (skipDuplicateCheck: true)
  └─ Driver submits response: POST /api/user/delinquencyResponse/response
  └─ Driver updates response: PUT /api/user/delinquencyResponse/:id
  └─ Driver deletes response: DELETE /api/user/delinquencyResponse/:id

testAdminDecisionWorkflow()
  └─ Creates fresh delinquency (if none provided)
  └─ Admin issues ruling: POST /api/admin/userDelinquencyDecisions
     { userDelinquencyUniqueId, decisionOutcome: "UPHELD"|"DISMISSED"|"REDUCED"|"EXONERATED" }
  └─ GET decisions to verify

testBanWorkflow()
  └─ Uses driver's userRoleUniqueId from accountData
  └─ Admin bans: POST /api/admin/bannedUsers { userRoleUniqueId, reason, banDuration }
     → Service resolves userUniqueId + roleId from UserRole table
  └─ Admin updates ban: PUT /api/admin/bannedUsers/:banUniqueId { reason }
  └─ Admin deactivates: PATCH /api/admin/bannedUsers/:banUniqueId/deactivate
```

**Company Delinquency Chain:**

```
testCompanyDelinquencyWorkflow()
  └─ Admin creates delinquency on company:
     POST /api/company/admin/delinquency { companyUniqueId, delinquencyTypeUniqueId, ... }
  └─ Company submits dispute response:
     POST /api/company/delinquency-response/response { companyDelinquencyUniqueId, response }
  └─ Admin deletes delinquency:
     DELETE /api/company/admin/delinquency/:companyDelinquencyUniqueId

testCompanyAdminDecisionWorkflow()
  └─ Admin issues ruling:
     POST /api/company/admin/delinquency-decisions
     { companyDelinquencyUniqueId, decisionOutcome: "ACCEPTED"|"REJECTED"|"REDUCED"|"DISMISSED" }
  └─ Admin updates text: PUT /api/company/admin/delinquency-decisions/:id
  └─ Admin deletes: DELETE /api/company/admin/delinquency-decisions/:id

testCompanyBanWorkflow()
  └─ Admin bans company:
     POST /api/company/admin/delinquency/bans
     { companyUniqueId, companyDelinquencyUniqueId, banReason, banDurationDays }
  └─ Admin unbans:
     PATCH /api/company/admin/delinquency/bans/:companyBanUniqueId/unban
```

---

## 7. Individual Journey Flow — Step by Step

```
SHIPPER side                          DRIVER side
────────────────────────────────────────────────────────────────────
POST createRequest (individual)
status: 1 (waiting)
                                      POST /api/driver/request
                                      ↓ Backend auto-matches driver GPS
                                      status: 2 (matched)
                                      ↓
                                      PUT acceptShipperRequest
                                      { shippingCostByDriver: 5000 }
                                      status: 3 (bid submitted)
PUT acceptDriverRequest
(shipper picks this driver)
status: 4 (accepted by shipper)
                                      ↓
                                      PUT startJourney
                                      { lat, lng }
                                      status: 5 (in progress)
                                      ↓
                                      PUT completeJourney
                                      { journeyUniqueId, lat, lng }
                                      status: DONE
────────────────────────────────────────────────────────────────────
Cancellation at any point:
  Driver: PUT cancelDriverRequest?ownerUserUniqueId=self&roleId=2&cancellationReasonsTypeId=N
  Shipper: PUT cancelShipperRequest/:userUniqueId { shipperRequestUniqueId }
```

---

## 8. Company Journey Flow — Step by Step

```
SHIPPER side                COMPANY side                 DRIVER side
──────────────────────────────────────────────────────────────────────
POST createRequest
(company_target,
numberOfVehicles: 10)
                            GET available bids
                            POST /api/company/bids
                            { proposedCostPerVehicle }
                            ↓ bid submitted
PATCH accept bid
(bidStatus: accepted)
                            GET accepted bids
                            POST /api/company/fleet
                            (assign vehicle)
                            POST /api/company/assignments
                            (assign driver to shipper request)
                                                         PATCH confirm assignment
                                                         (assignmentStatus: "confirmed_by_driver")
                                                         status: 4 (accepted)
                                                         ↓
                                                         PUT startJourney
                                                         status: 5 (in progress)
                                                         ↓
                                                         PUT completeJourney
                                                         status: DONE
──────────────────────────────────────────────────────────────────────
```

---

## 9. Delinquency Lifecycle — Step by Step

```
USER DELINQUENCY LIFECYCLE
──────────────────────────────────────────────────────────────────────
Admin                        Driver                       System
─────                        ──────                       ──────
POST userDelinquency
{ userUniqueId, roleId,
  delinquencyTypeUniqueId }
                             POST delinquencyResponse
                             { userDelinquencyUniqueId,
                               userDelinquencyResponse }
Admin reviews response
POST userDelinquencyDecisions
{ decisionOutcome: "UPHELD" }
                                                          Auto-ban check:
                                                          If accumulated points ≥ threshold
                                                          → INSERT BannedUsers
Admin can also manually ban:
POST bannedUsers
{ userRoleUniqueId, reason }
                                                          Driver role status → 6 (banned)
Admin can deactivate:
PATCH bannedUsers/:id/deactivate
──────────────────────────────────────────────────────────────────────

COMPANY DELINQUENCY LIFECYCLE
──────────────────────────────────────────────────────────────────────
Admin                        Company                      System
─────                        ───────                      ──────
POST company/admin/delinquency
{ companyUniqueId,
  delinquencyTypeUniqueId }
                             POST company/delinquency-response
                             { companyDelinquencyUniqueId,
                               companyDelinquencyResponse }
Admin reviews response
POST company/admin/delinquency-decisions
{ decisionOutcome: "REJECTED" }
                                                          Auto-ban check:
                                                          If points ≥ threshold
                                                          → company approvalStatus: "suspended"
Admin can manually ban:
POST company/admin/delinquency/bans
{ companyUniqueId, banDurationDays }
Admin unban:
PATCH company/admin/delinquency/bans/:id/unban
──────────────────────────────────────────────────────────────────────
```

---

## 10. Journey Status State Machine

```
null
  │
  ▼ POST /api/driver/request (driver posts GPS, system matches)
  1  waiting (shipper request exists, searching for driver)
  │
  ▼ Driver auto-matched to shipper request
  2  requested (driver received the match)
  │
  ▼ PUT /api/driver/acceptShipperRequest
  3  acceptedByDriver (driver bid submitted, awaiting shipper)
  │
  ▼ PUT /api/shipper/acceptDriverRequest
  4  acceptedByShipper (shipper picked this driver, ready to start)
  │
  ▼ PUT /api/driver/startJourney
  5  journeyStarted (trip in progress)
  │
  ▼ PUT /api/driver/completeJourney
  6  journeyCompleted ✅

Cancellation / rejection paths (from any active status):
  7   cancelledByShipper        (shipper cancelled the whole request)
  8   rejectedByShipper         (shipper rejected this specific driver)
  9   cancelledByDriver         (driver cancelled after accepting)
  10  cancelledByAdmin
  13  noAnswerFromDriver         (driver did not respond in time)
  14  notSelectedInBid           (driver bid but shipper picked someone else)
  15  rejectedByDriver           (driver rejected before accepting)
  16  replacedByCompanyAssignment

Both parties must acknowledge cancellations:
  Driver: PUT /api/driver/markNegativeStatusAsSeen { driverRequestUniqueId }
  Shipper: PUT /api/shipperRequest/markCancellationAsSeen
```

### Status Branch Logic (in tests)

```js
let driverStatus = await getDriverJourneyStatus({ userType: "driver" });

if (driverStatus?.status == 2) await acceptShipperRequest({ shippingCostByDriver: 5000 });
if (driverStatus?.status == 3) await testAcceptDriverRequest({ uniqueIds: driverStatus.uniqueIds });
if (driverStatus?.status == 4) await startJourney({ userType: "driver" });
if (driverStatus?.status == 5) await completeJourney({ userType: "driver" });
if (driverStatus?.status == 14) await testMarkNegativeStatusAsSeen({ token, uniqueIds });
```

---

## 11. Running the Tests

### Full suite from scratch

```bash
node E2ETests/index.js
```

### Run a single domain workflow

```bash
# Roles CRUD only
node -e "require('./E2ETests/Roles').testRolesWorkFlows()"

# Journey status CRUD only
node -e "require('./E2ETests/Journey/JourneyStatus').testJourneyStatusWorkflow()"

# Vehicle type CRUD only
node -e "require('./E2ETests/Vehicles/VehicleType').testVehicleTypeWorkflow()"

# Finance tariff rate CRUD only
node -e "require('./E2ETests/Finance/TariffRate').testTariffRateWorkflow()"

# Full delinquency lifecycle
node -e "require('./E2ETests/Delinquency').testFullDelinquencyLifecycle()"

# Company delinquency workflow
node -e "require('./E2ETests/Company/CompanyDelinquency').testCompanyDelinquencyWorkflow()"

# Database reset only
node -e "require('./E2ETests/DataBaseManagement').resetDatabase()"
```

### Toggle phases in `index.js`

Comment/uncomment phases during development:

```js
const initiateTest = async () => {
  await resetDatabase();           // ← always required
  await testCreateAdminFlow({});   // ← always required
  await testGetRoles();

  await testDriverOnboardingFlow({ userType: "driver" });
  await fetchUnAuthorizedDrivers({});
  await authorizeDriversDocuments({});

  await runReferenceCRUD();        // ← comment out to skip CRUD tests
  await runIndividualFlow();       // ← comment out to skip individual journey
  await runCompanyFlow();          // ← comment out to skip company journey
  await runPostJourneyCRUD();      // ← comment out to skip post-journey CRUD
  await runDelinquencyTests();     // ← comment out to skip delinquency tests
};
```

---

## 12. Test Data Reference

### Users (`constants.js`)

| User | Phone | OTP | Role |
|------|-------|-----|------|
| `supperAdmin` | `+251983222221` | `101010` | SuperAdmin (roleId 6) |
| `admin` | `+251993333333` | `101010` | Admin (roleId 3) |
| `driver` | `+251991111112` | `101010` | Driver (roleId 2) |
| `shipper` | `+251992222222` | `101010` | Shipper (roleId 1) |
| `companyAdmin` | `+251994444444` | `101010` | CompanyAdmin (roleId 7) |

### Role IDs (`usersRoles`)

| Role | ID |
|------|----|
| Shipper | 1 |
| Driver | 2 |
| Admin | 3 |
| VehicleOwner | 4 |
| System | 5 |
| SuperAdmin | 6 |
| CompanyAdmin | 7 |
| Company (entity) | 8 |
| Vehicle (entity) | 9 |
| Dispatcher | 10 |

### Journey Status IDs

| Status Name | ID |
|-------------|----|
| waiting | 1 |
| requested | 2 |
| acceptedByDriver | 3 |
| acceptedByShipper | 4 |
| journeyStarted | 5 |
| journeyCompleted | 6 |
| cancelledByShipper | 7 |
| rejectedByShipper | 8 |
| cancelledByDriver | 9 |
| cancelledByAdmin | 10 |
| completedByAdmin | 11 |
| cancelledBySystem | 12 |
| noAnswerFromDriver | 13 |
| notSelectedInBid | 14 |
| rejectedByDriver | 15 |
| replacedByCompanyAssignment | 16 |
| partiallyCancelled | 17 |

---

## 13. Error Handling Conventions

### Always re-throw in catch blocks

```js
} catch (error) {
  console.error("❌ testCreate[Entity]:",
    error.response?.data?.error?.details ||
    error.response?.data?.error ||
    error.response?.data ||
    error.message
  );
  throw error; // never swallow
}
```

### Critical failures — `throw`

Makes the runner stop immediately and exit with code 1:

```js
if (!usersData.driver.token) {
  throw new Error("Driver token not set — cannot continue");
}
```

### Graceful skips — `return { skipped: true }`

Used when a prerequisite is missing but the test suite can continue:

```js
if (!journeyDecisionUniqueId) {
  console.warn("⏩ Skipped — no journeyDecisionUniqueId (run full journey flow first)");
  return { skipped: true };
}
```

### Never use empty catch blocks

```js
// ❌ WRONG — silently hides errors
} catch (error) {}

// ✅ CORRECT — always log and re-throw
} catch (error) {
  console.error("❌ testSomething:", error.response?.data?.error || error.message);
  throw error;
}
```

---

## 14. Checklist — Before Adding a New Flow

- [ ] Check `Routes/EndPoints/` for the correct URL constants
- [ ] Check `Validations/` for required request body fields
- [ ] Use `authConfig(token)` from `Utils.js` — never hardcode headers
- [ ] Use `usersData.admin?.token` as fallback when user token not provided
- [ ] Store returned IDs to module-level `cache` for fallback use in update/delete
- [ ] Store important IDs back to `usersData` if downstream tests will need them
- [ ] Add duplicate/idempotency guard if the entity has unique constraints
- [ ] Use `⏩ Skipped` pattern for non-critical missing prerequisites
- [ ] Use `throw` for critical missing prerequisites
- [ ] Log `✅` on success with the unique ID, `❌` on failure with error message
- [ ] Export the workflow function and all CRUD functions
- [ ] Import and call it in the correct phase in `index.js`
- [ ] Update `E2E_GUIDE.md` directory structure section

---

## 15. Suggested Improvements / Future Enhancements

As the test suite grows, consider adopting these improvements:

1. **Selective Execution / Filtering**: Allow running specific phases or even single files by passing arguments (e.g. `npm run test:e2e -- --phase=delinquency`).
2. **Environment Parameterization**: Extract hardcoded values (`101010` OTPs, `http://127.0.0.1:3000`) into configurable options or environment variables, making it easier to target a staging or CI/CD environment.
3. **Structured Reporting**: Generate a JSON or HTML report at the end of the suite summarizing which modules passed, failed, or were skipped, rather than solely relying on console output.
4. **Resilience / Retry Mechanics**: Introduce a utility to retry a flaky endpoint a set number of times before failing, particularly useful if external system boundaries (like sending an SMS or email) are occasionally delayed.
