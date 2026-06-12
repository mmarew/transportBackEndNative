# E2E Testing Guide — Transport Backend

> **Last updated:** June 2026  
> **Runner:** `node E2ETests/index.js`  
> **Environment:** Local (`http://127.0.0.1:3000`) — never run against production

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Directory Structure](#2-directory-structure)
3. [Prerequisites & Setup](#3-prerequisites--setup)
4. [Shared Utilities](#4-shared-utilities)
5. [How to Write a New Test File](#5-how-to-write-a-new-test-file)
6. [Full E2E Journey — Step by Step](#6-full-e2e-journey--step-by-step)
   - [Phase 0 — Reset Database](#phase-0--reset-database)
   - [Phase 1 — Auth: Create, Verify & Login Users](#phase-1--auth-create-verify--login-users)
   - [Phase 2 — Documents: User & Company Documents](#phase-2--documents-user--company-documents)
   - [Phase 3 — Create & Verify Company](#phase-3--create--verify-company)
   - [Phase 4 — Shipper Creates a Request](#phase-4--shipper-creates-a-request)
   - [Phase 5 — Driver Posts Location & System Matches](#phase-5--driver-posts-location--system-matches)
   - [Phase 6 — Shipper Accepts Driver's Offer](#phase-6--shipper-accepts-drivers-offer)
   - [Phase 7 — Driver Starts Journey](#phase-7--driver-starts-journey)
   - [Phase 8 — Journey Completes](#phase-8--journey-completes)
   - [Phase 9 — Mid-Journey Cancellation by Driver](#phase-9--mid-journey-cancellation-by-driver)
7. [Journey Status State Machine](#7-journey-status-state-machine)
8. [Running the Tests](#8-running-the-tests)
9. [Test Data Reference (constants.js)](#9-test-data-reference-constantsjs)
10. [Error Handling Conventions](#10-error-handling-conventions)
11. [Checklist — Before Adding a New Flow](#11-checklist--before-adding-a-new-flow)

---

## 1. Overview & Architecture

These are **end-to-end integration tests** that call the live HTTP API. They are **not** Jest unit tests — they run as plain Node.js scripts that exercise the full request lifecycle, including database writes.

### Design Principles

| Principle | How it is applied |
|-----------|------------------|
| **Sequential execution** | Each `async/await` chain runs in strict order; no step starts before the previous resolves |
| **Shared in-memory state** | `usersData` (in `constants.js`) acts as a global store; tokens and IDs are written to it as the test progresses |
| **Fail-fast** | Critical failures `throw` immediately — the runner catches at the top level and exits with code 1 |
| **Idempotent where possible** | Duplicate-check guards (e.g., company already exists, document already uploaded) prevent data pollution on re-runs |
| **Emoji log markers** | `✅ ❌ ⚠️ 📋 🔄` give instant visual feedback in the terminal |

---

## 2. Directory Structure

```
E2ETests/
│
├── index.js                   ← Main runner / orchestrator
├── constants.js               ← Shared test users, base URL, cache objects
├── Utils.js                   ← authConfig() helper
├── TESTING_TEMPLATE.md        ← Boilerplate for new test files
├── E2E_GUIDE.md               ← THIS FILE
├── dummy.txt                  ← Fake file used for document upload tests
│
├── Auth/
│   ├── RegisterUser.js        ← POST /auth/createUser
│   ├── VerifyByOtp.js         ← POST /auth/verifyUserByOTP  (stores token)
│   ├── LoginUser.js           ← POST /auth/login
│   └── index.js               ← testAuthWorkFlow / testVerifyAndLoginUser
│
├── DataBaseManagement/
│   └── index.js               ← dropTables, createTables, installPredefinedData, resetDatabase
│
├── Admin/
│   ├── index.js               ← testCreateAdminFlow (SuperAdmin creates Admin)
│   ├── fetchData.js           ← fetchUnAuthorizedDrivers
│   └── AuthorizeDocs.js       ← authorizeDriversDocuments
│
├── Driver/
│   ├── index.js               ← testDriverOnboardingFlow, driversFinancialFlows
│   ├── RequirementOfDriver.js ← getDriversAccountData, evaluateDriversDocumentVehicleRequirement
│   ├── VehicleDriver.js       ← createVehicle, attachVehiclesDocuments
│   ├── DriversDocuments.js    ← createDriverDocument
│   ├── DriverRequest.js       ← All driver-side request actions (create, accept, start, complete, cancel…)
│   ├── DriverJourneyStatus.js ← getDriverJourneyStatus, acceptShipperRequest, startJourney, completeJourney
│   └── DriversFinance/        ← Balance, Deposit, Subscription, Transfer, Wallet flows
│
├── Shipper/
│   ├── Index.js               ← testShipperOnboardingFlow
│   ├── ShipperRequest.js      ← Create/accept/reject/cancel shipper requests, notifications
│   └── VerifyShipperStatus.js ← verifyShipperStatus
│
├── Company/
│   ├── index.js               ← createCompanyAdminFlow
│   ├── CompanyProfileManagement.js ← createCompanies, attachCompanyDocuments, approveCompanyDocuments…
│   ├── BidManagement.js       ← getAvailableBids, participateInBid, acceptCompanyOffer, initiateCompanyBiddingWorkFlow
│   ├── CompanyVehicle.js      ← assignVehicleToCompany
│   └── AssignDrivers.js       ← assignDrivers
│
├── Journey/
│   ├── Journey.js             ← CRUD helpers for the Journey entity
│   ├── JourneyStatus.js       ← CRUD helpers for JourneyStatus entity
│   └── index.js               ← Journey test exports
│
├── Documents/
│   └── DocumentTypes.js       ← CRUD tests for DocumentTypes
│
├── Delinquency/
│   ├── DelinquencyTypes.js
│   ├── Delinquency.js
│   ├── DelinquencyResponse.js
│   ├── AdminDecision.js
│   └── BannedUsers.js
│
├── Roles/
│   └── index.js
│
└── Vehicles/
    └── (VehicleType, VehicleStatus, VehicleOwnership, etc.)
```

---

## 3. Prerequisites & Setup

### 3.1 Environment

| Requirement | Notes |
|-------------|-------|
| Node.js ≥ 18 | `npm install` must be done first |
| Local server running | `npm run dev` on port 3000 |
| `.env` contains `API_KEY` | Used by dev-only bypass endpoints |
| Database accessible | MySQL / Postgres reachable from backend |

### 3.2 Environment Variables (`.env`)

```env
API_KEY=dev-api-key        # Must match x-api-key used in DataBaseManagement tests
```

### 3.3 Pre-seeded SuperAdmin

The **SuperAdmin** user (`supperAdmin@supperAdmin.com`, phone `+251983222221`) must exist in the auth system **before** `resetDatabase()` runs. This is the only record that survives a full reset because the OTP verification (not registration) is what the test uses.

---

## 4. Shared Utilities

### `constants.js`

The central state store. All test functions read from and write back to this object.

```js
const { usersData } = require("../constants");

// Key fields written during the test run:
usersData.driver.token          // JWT after OTP verify
usersData.driver.accountData    // Full account from GET /api/driver/account
usersData.driver.journeyStatus  // Latest journey state machine snapshot
usersData.shipper.token
usersData.admin.token
usersData.supperAdmin.token
usersData.companyAdmin.token
usersData.companyAdmin.companies    // Array of company objects
usersData.companyAdmin.bids         // Bid lists keyed by status
```

### `Utils.js` — `authConfig(token)`

A tiny helper that builds an Axios config with the `Authorization` header:

```js
const { authConfig } = require("../Utils");

// Usage:
const config = authConfig(token);
await axios.get(url, config);
await axios.post(url, payload, config);
```

---

## 5. How to Write a New Test File

Follow the pattern established in every existing test file.

### 5.1 File skeleton

```js
// CRUD for [EntityName]
// Brief description of what this entity does

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/[route-prefix]/[entity]";
const cache = { data: null }; // local cache for GET results

// ── GET all ────────────────────────────────────────────────────────────────────
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
const testCreate[Entity] = async ({ user, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const result = await axios.post(backendURL + BASE_URL, payload, authConfig(token));
    console.log("✅ [Entity] created:", result.data.[uniqueIdField]);
    return result.data;
  } catch (error) {
    console.error("❌ testCreate[Entity]:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdate[Entity] = async ({ user, uniqueId, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const id = uniqueId || cache.data?.[0]?.[uniqueIdField];
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
const testDelete[Entity] = async ({ user, uniqueId }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const id = uniqueId || cache.data?.[0]?.[uniqueIdField];
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
const test[Entity]Workflow = async ({ user = usersData.admin, createPayload = {}, updatePayload = {} } = {}) => {
  console.log("\n── [Entity] Workflow ──");

  await testGet[Entity]({ user });

  const created = await testCreate[Entity]({ user, payload: createPayload });
  const uniqueId = created?.[uniqueIdField];
  if (!uniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGet[Entity]({ user });
  await testUpdate[Entity]({ user, uniqueId, payload: updatePayload });
  await testGet[Entity]({ user });
  await testDelete[Entity]({ user, uniqueId });
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
| Workflows | `test[Entity]Workflow` | `testJourneyStatusWorkflow` |
| Log success | `✅ EntityName action:` | `✅ Journey started.` |
| Log failure | `❌ test[Entity]:` | `❌ testGetJourneyStatuses:` |

### 5.3 Registering a New Flow in `index.js`

```js
// 1. Import at top
const { testMyEntityWorkflow } = require("./MyDomain/MyEntity");

// 2. Call in initiateTest() at the correct order
await testMyEntityWorkflow({});
```

---

## 6. Full E2E Journey — Step by Step

This section describes the **canonical test sequence** that exercises the entire freight lifecycle from a clean database to a completed journey.

---

### Phase 0 — Reset Database

**File:** `DataBaseManagement/index.js` → `resetDatabase()`

**What it does:**

```
1. DELETE all tables  →  POST /api/admin/dropAllTables
2. Recreate schema   →  POST /api/admin/createTable
3. Verify SuperAdmin  →  POST /auth/verifyUserByOTP  { phoneNumber, OTP, roleId }
4. Install seed data  →  GET  /api/admin/installPreDefinedData  (SuperAdmin token)
```

**Why this order matters:**  
Seed data (roles, statuses, vehicle types, document requirements) must be installed before any user can register, because registration validators look up `roleId` in the `roles` table.

**Code reference:**

```js
const { resetDatabase } = require("./DataBaseManagement");

await resetDatabase();
// After this: usersData.supperAdmin.token is set
```

---

### Phase 1 — Auth: Create, Verify & Login Users

**Files:** `Auth/RegisterUser.js`, `Auth/VerifyByOtp.js`, `Auth/LoginUser.js`, `Auth/index.js`

#### Full Auth Workflow (Register → Verify → Login)

Used for **Driver**, **Shipper**, **CompanyAdmin**:

```js
// testAuthWorkFlow internally calls all three steps
await testAuthWorkFlow({ userType: "driver" });
await testAuthWorkFlow({ userType: "shipper" });
await testAuthWorkFlow({ userType: "companyAdmin" });
```

**Endpoints called:**

| Step | Method | Endpoint | Notes |
|------|--------|----------|-------|
| Register | POST | `/api/auth/createUser` | `{ fullName, email, phoneNumber, roleId }` |
| Verify OTP | POST | `/api/auth/verifyUserByOTP` | `{ phoneNumber, OTP, roleId }` — returns JWT token |
| Login | POST | `/api/auth/login` | `{ email, phoneNumber, OTP, roleId }` |

> **OTP in tests:** The test OTP is always `101010` (hardcoded in `constants.js`). The dev-only endpoint `GET /api/admin/dev/getUserOtp?phoneNumber=xxx` can also fetch the real OTP from the DB if needed.

#### Verify & Login Only (skip registration)

Used for **SuperAdmin** and **Admin** (pre-created users):

```js
await testVerifyAndLoginUser({ userType: "supperAdmin" });
await testVerifyAndLoginUser({ userType: "admin" });
```

#### Admin Creation Flow

SuperAdmin creates the Admin user via a privileged endpoint:

```js
// POST /api/auth/createUserByAdmin  (requires SuperAdmin token)
await testCreateAdminFlow();
// After: usersData.admin.token is set
```

**Token storage:**  
After `testVerifyUserByOTP()` resolves, the returned JWT is stored:

```js
usersData[userType].token = res.data.token;
```

Every subsequent call reads its token from `usersData[userType].token`.

---

### Phase 2 — Documents: User & Company Documents

**Files:** `Driver/RequirementOfDriver.js`, `Driver/DriversDocuments.js`, `Driver/VehicleDriver.js`, `Shipper/Index.js`, `Admin/AuthorizeDocs.js`

#### Driver Document & Vehicle Flow

```
1. GET /api/driver/account             → fetch current state
2. If no vehicle → POST /api/vehicle   → create vehicle
3. GET /api/driver/account             → re-fetch with vehicle included
4. For each unAttachedDocumentType:
   - roleId === 9 (vehicle doc)  → POST /api/vehicle/attachDocuments/:vehicleUniqueId
   - roleId === 2 (user doc)     → POST /api/user/attachDocuments/self
5. Admin: GET  unauthorized drivers     → find PENDING documents
6. Admin: PUT  /api/admin/acceptRejectAttachedDocuments  → ACCEPTED
```

```js
await evaluateDriversDocumentVehicleRequirement();
// then Admin side:
await fetchUnAuthorizedDrivers({});
await authorizeDriversDocuments({});
```

#### Shipper Document Flow

```
1. GET /api/shipper/account
2. For each unAttachedDocumentType:
   - POST /api/user/attachDocuments/self  (same endpoint as driver user docs)
```

```js
// Inside testShipperOnboardingFlow:
const unAttachedDocumentTypes = accountData?.unAttachedDocumentTypes || [];
for (const doc of unAttachedDocumentTypes) {
  await createDriverDocument(token, doc); // works for shippers too
}
```

> **Key rule:** A driver's account will have status `INACTIVE` until their documents are approved by Admin. The driver cannot receive journey matches until approval is complete.

---

### Phase 3 — Create & Verify Company

**Files:** `Company/CompanyProfileManagement.js`, `Company/index.js`

The Company lifecycle has these sub-steps:

```
1. companyAdmin registers/verifies/logs in       → testAuthWorkFlow({ userType: "companyAdmin" })
2. Create company                                 → POST /api/company/companies
3. GET company list                               → GET  /api/company/companies
4. Attach company documents                       → POST /api/company/attachDocuments/:companyUniqueId
   - Uses multipart/form-data with dummy.txt file
   - Loops over document types from GET /api/RoleDocumentRequirements?roleId=8
5. Admin approves company documents               → PUT  /api/admin/acceptRejectAttachedDocuments
6. Admin approves company status                  → PATCH /api/company/companies/:companyUniqueId/approve
```

```js
await createCompanyAdminFlow({});
// Internally calls:
//   testAuthWorkFlow({ userType: "companyAdmin" })
//   initiateCompanyProfileSetupWorkFlow({ userType: "companyAdmin" })
//   initiateCompanyBiddingWorkFlow({ userType: "companyAdmin" })
```

**Document approval payload:**

```js
{
  roleId: 8,                        // company role
  attachedDocumentUniqueId: "...",
  action: "ACCEPTED",
  reason: "Document is valid and accepted."
}
```

**Company approval payload:**

```js
// PATCH /api/company/companies/:companyUniqueId/approve
{ approvalStatus: "approved" }
```

---

### Phase 4 — Shipper Creates a Request

**File:** `Shipper/ShipperRequest.js` → `testCreateShipperRequest(token)`

```
1. GET /api/admin/vehicleTypes        → get vehicleTypeUniqueId
2. POST /api/shipperRequest/createRequest  → create the request
```

**Payload structure:**

```js
{
  shipperRequestBatchId: uuidv4(),      // unique batch ID
  numberOfVehicles: 1,
  shippingDate: "2026-06-13T...",       // tomorrow
  deliveryDate: "2026-06-15T...",       // 3 days from now
  shippingCost: 5000,
  shippableItemQtyInQuintal: 100,
  shippableItemName: "Coffee Beans",
  originLocation: {
    latitude: 9.03,
    longitude: 38.74,
    description: "Addis Ababa, Ethiopia"
  },
  destination: {
    latitude: 8.54,
    longitude: 39.27,
    description: "Adama, Ethiopia"
  },
  vehicle: {
    vehicleTypeUniqueId: "..."
  }
}
```

> **Optional `requestMode`:**  
> - `"individual_target"` — match with an individual driver  
> - `"company_target"` — match with a company

After creation, the shipper's status is tracked via:

```js
await verifyShipperStatus(token);
// GET /api/shipperRequest/verifyShipperStatus
```

---

### Phase 5 — Driver Posts Location & System Matches

**File:** `Driver/DriverRequest.js` → `testCreateDriverRequest(token)`

When the driver posts their current GPS location, the backend's auto-matching engine finds the nearest unmatched shipper request.

```
POST /api/driverRequest/createDriverRequest
{
  currentLocation: {
    latitude: 9.03,
    longitude: 38.74,
    description: "Addis Ababa, Ethiopia"
  }
}
```

**Response includes:**
- `status` — current driver journey status code
- `shipper.shipperRequestUniqueId` — matched shipper (if found)

After posting, the driver's current state is read back:

```js
const driverStatus = await testVerifyDriverJourneyStatus({ token });
// GET /api/driver/verifyDriverJourneyStatus
// Returns: { status, uniqueIds: { driverRequestUniqueId, shipperRequestUniqueId, journeyDecisionUniqueId } }
```

**Status codes after matching:**

| Code | Meaning |
|------|---------|
| `null` / no status | Driver has no active request yet |
| `1` | Request created, awaiting match with shipper |
| `2` | Match found — driver must accept the shipper offer |

---

### Phase 6 — Shipper Accepts Driver's Offer

**File:** `Shipper/ShipperRequest.js` → `testAcceptDriverRequest({ token, uniqueIds })`

After the driver accepts the shipper (status `2` → driver submits bid), the **shipper** confirms the driver's offer:

```
PUT /api/shipper/acceptDriverRequest
{
  driverRequestUniqueId: "...",
  shipperRequestUniqueId: "...",
  journeyDecisionUniqueId: "..."
}
```

**Driver side first (accept the match):**

```js
// Driver accepts the shipper offer and submits a bid price
await acceptShipperRequest({ userType: "driver", shippingCostByDriver: 500 });
// PUT /api/driver/acceptShipperRequest
// Payload: { driverRequestUniqueId, shipperRequestUniqueId, journeyDecisionUniqueId, shippingCostByDriver }
```

**Shipper side (confirm the driver):**

```js
// Shipper sees the driver's offer and accepts it
await testAcceptDriverRequest({ token: null, uniqueIds });
// token is auto-fetched from usersData.shipper.token
```

After both parties confirm, status progresses to `4` (accepted by shipper = ready to start).

---

### Phase 7 — Driver Starts Journey

**File:** `Driver/DriverJourneyStatus.js` → `startJourney({ userType })`

```
PUT /api/driver/startJourney
{
  driverRequestUniqueId: "...",
  shipperRequestUniqueId: "...",
  journeyDecisionUniqueId: "...",
  latitude: 9.0205,
  longitude: 38.8025
}
```

**Prerequisites:**
- `getDriverJourneyStatus()` must have been called immediately before — `startJourney` reads all IDs from `usersData.driver.journeyStatus`
- Status must be `4` (acceptedByShipper)

After this call:
- Status moves to `5` (in progress / journey active)
- `journeyUniqueId` becomes available in the response (required for `completeJourney`)

```js
await getDriverJourneyStatus({ userType: "driver" });
await startJourney({ userType: "driver", latitude: 9.0205, longitude: 38.8025 });
await getDriverJourneyStatus({ userType: "driver" }); // refresh to get journeyUniqueId
```

---

### Phase 8 — Journey Completes

**File:** `Driver/DriverJourneyStatus.js` → `completeJourney({ userType })`

```
PUT /api/driver/completeJourney
{
  driverRequestUniqueId: "...",
  shipperRequestUniqueId: "...",
  journeyDecisionUniqueId: "...",
  journeyUniqueId: "...",           ← only available after startJourney
  latitude: 9.0205,
  longitude: 38.8025
}
```

```js
await getDriverJourneyStatus({ userType: "driver" });
await completeJourney({ userType: "driver" });
await getDriverJourneyStatus({ userType: "driver" }); // should show status = completed
```

---

### Phase 9 — Mid-Journey Cancellation by Driver

**File:** `Driver/DriverRequest.js` → `testCancelDriverRequest(token)`

A driver can cancel an active request/journey at any point before completion:

```
PUT /api/driverRequest/cancelDriverRequest?ownerUserUniqueId=self&roleId=2&cancellationReasonsTypeId=2
{}
```

**Shipper sees the cancellation:**

```js
// Shipper polls cancellation notifications
await testGetCancellationNotification({});
// GET /api/shipperRequest/getCancellationNotifications

// Shipper marks it as seen (with optional rating)
await testMarkJourneyCancellationAsSeen({
  journeyDecisionUniqueId: "...",
  shipperRequestUniqueId: "...",
  rating: 4
});
// PUT /api/shipperRequest/markJourneyCompletionAsSeen
```

**Shipper can also:**

```js
// Reject a driver's offer
await testRejectDriverOffer({ uniqueIds });
// PUT /api/user/rejectDriverOffer

// Cancel a shipper request entirely
await testCancelShipperRequest({ uniqueIds });
// PUT /api/shipperRequest/cancelShipperRequest/self
```

**Driver marks the negative status as seen:**

```js
await testMarkNegativeStatusAsSeen({ token, uniqueIds });
// PUT /api/driverRequest/markNegativeStatusAsSeen
// Payload: { driverRequestUniqueId }
```

---

## 7. Journey Status State Machine

The `status` field returned by `GET /api/driver/verifyDriverJourneyStatus` drives all branching logic:

```
null ──► 1 (Request Created / Searching)
          │
          ▼
         2 (Matched with Shipper — awaiting driver acceptance)
          │
          ▼ Driver accepts (PUT /api/driver/acceptShipperRequest)
         3 (Driver offered bid — awaiting Shipper acceptance)
          │
          ▼ Shipper accepts (PUT /api/shipper/acceptDriverRequest)
         4 (Accepted by Shipper — ready to start)
          │
          ▼ Driver starts (PUT /api/driver/startJourney)
         5 (Journey In Progress)
          │
          ▼ Driver completes (PUT /api/driver/completeJourney)
        DONE

Cancellation paths:
  Any status ──► 14 (Cancelled — driver/shipper must mark as seen)
```

### Status Branch Table

| `status` | Driver action in tests | Shipper action in tests |
|----------|----------------------|------------------------|
| `null` | `testCreateDriverRequest()` | Create shipper request first |
| `1` | Waiting — shipper request must exist | `testCreateShipperRequest()` |
| `2` | `acceptShipperRequest()` | — |
| `3` | — | `testAcceptDriverRequest()` |
| `4` | `startJourney()` | — |
| `5` | `completeJourney()` | — |
| `14` | `testMarkNegativeStatusAsSeen()` | `testMarkJourneyCancellationAsSeen()` |

---

## 8. Running the Tests

### Full E2E suite (clean slate)

```bash
# From project root
node E2ETests/index.js
```

### Individual domain flows

```bash
# Driver request workflow only
node -e "require('./E2ETests/Driver/DriverRequest').testDriverRequestWorkFlows({})"

# Shipper onboarding only
node E2ETests/Shipper/Index.js

# Company flow only
node -e "require('./E2ETests/Company').createCompanyAdminFlow({})"

# Journey CRUD only
node E2ETests/Journey/Journey.js

# Database reset only
node -e "require('./E2ETests/DataBaseManagement').resetDatabase()"
```

### Adjusting the main `index.js` orchestration

To toggle phases on/off during development, comment/uncomment the relevant `await` calls in `initiateTest()`:

```js
const initiateTest = async () => {
  await resetDatabase();                          // ← always required
  await testCreateAdminFlow({});                  // ← always required
  await testDriverOnboardingFlow({ userType: "driver" });
  // await driversFinancialFlows({ userType: "driver" }); // ← optional
  await fetchUnAuthorizedDrivers({});
  await authorizeDriversDocuments({});
  await testShipperOnboardingFlow({ userType: "shipper" });
  await testDriverRequestWorkFlows({});
  // await createCompanyAdminFlow({});            // ← company bidding flow
};
```

---

## 9. Test Data Reference (`constants.js`)

| Key | Value | Notes |
|-----|-------|-------|
| `backendURL` | `http://127.0.0.1:3000` | Change for staging |
| `usersData.driver.phoneNumber` | `+251991111112` | Fixed test number |
| `usersData.driver.OTP` | `101010` | Dev-only bypass OTP |
| `usersData.driver.roleId` | `usersRoles.driverRoleId` | From seed data |
| `usersData.shipper.phoneNumber` | `+251992222222` | Fixed test number |
| `usersData.admin.phoneNumber` | `+251993333333` | Fixed test number |
| `usersData.companyAdmin.phoneNumber` | `+251994444444` | Fixed test number |
| `usersData.supperAdmin.phoneNumber` | `+251983222221` | Pre-seeded in auth system |
| `usersData.company.companyName` | `"company a"` | Fixed company name |
| `usersData.company.companyEmail` | `companya+{timestamp}@gmail.com` | Dynamic to avoid duplicates |
| `unAuthorizedDriver` | `{ driver: null }` | Filled by `fetchUnAuthorizedDrivers` |

---

## 10. Error Handling Conventions

### Critical failures — `throw`

Use `throw` for any failure that makes subsequent steps impossible:

```js
if (!usersData.driver.token) {
  throw new Error("Driver token not set — cannot continue");
}
```

### Non-critical / skippable failures — `console.warn` + `return`

```js
if (unAttachedDocumentTypes.length === 0) {
  console.log("✅ All documents already uploaded!");
  return; // graceful skip, don't throw
}
```

### Axios error extraction pattern

Always extract meaningful error details from Axios errors:

```js
} catch (error) {
  console.error(
    "❌ testCreate[Entity]:",
    error.response?.data?.error?.details ||
    error.response?.data?.error ||
    error.response?.data ||
    error.message
  );
  throw error; // re-throw for critical flows
}
```

---

## 11. Checklist — Before Adding a New Flow

- [ ] Read the **existing endpoints** file in `Routes/EndPoints/` for the correct URL constants
- [ ] Use `authConfig(token)` from `Utils.js` — never hard-code headers
- [ ] Store results back to `usersData` if downstream steps will need the IDs
- [ ] Add a duplicate/idempotency guard if the entity has unique constraints
- [ ] Add `✅ / ❌` console logs for every step
- [ ] `throw` on critical failures (missing token, missing required ID)
- [ ] Export the workflow function and register it in `index.js`
- [ ] Test both the **happy path** and at least one **error path** (wrong token, missing field)
- [ ] Clean up created test data at the end of the workflow (or rely on `resetDatabase()`)
