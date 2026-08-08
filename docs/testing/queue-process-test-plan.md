# Queue Process — Master Test Plan

| Field             | Value                                                    |
| ----------------- | -------------------------------------------------------- |
| Document title    | Queue Process Test Plan & Test Cases                     |
| System under test | Transport Backend Native — Queue Organization & Dispatch |
| Version           | 1.0                                                      |
| Date              | 2026-08-08                                               |
| Author            | QA Engineering                                           |
| Status            | Draft — pending review                                   |
| Approvers         | Dev Lead, Product Owner, QA Lead                         |

---

## 1. Introduction

This document defines the test strategy, test data, test cases, and exit criteria for
the **queue dispatch process**: from registering a queue organization, through driver
check-in, order creation and auto-dispatch, to offer acceptance / rejection /
cancellation and queue bookkeeping.

The plan covers both the **API surface** (REST endpoints) and the **underlying data
invariants** (state transitions on `DriverQueue`, `ShipperRequest`, `DriverRequest`,
`JourneyDecisions`, and `CanceledJourneys`).

### 1.1 Objectives

1. Verify the queue lifecycle end-to-end across roles (shipper, driver, queue org admin, platform admin).
2. Verify business rules: single-queue-per-driver fence, position stamping, offer window, refusal policy.
3. Verify state-machine integrity on both the order (`ShipperRequest`/`DriverRequest`/`JourneyDecisions`) and the queue (`DriverQueue`) under every user action.
4. Verify authorization boundaries per endpoint.
5. Verify auditability (who did what, when, with which role/reason).
6. Verify concurrency safety (no double-offer, no double-load).
7. Verify notification behavior (socket events and queue snapshots).

### 1.2 Scope — In

- Queue organization: create, list, get, update, approve/reject/suspend, `queueEnabled` toggle, membership, soft-delete.
- Driver queue: check-in, check-out, my position, queue status, manual check-in, entry override, entry removal, manual dispatch.
- Order lifecycle on a queue-enabled org: auto-dispatch on creation, offer, accept, driver reject (pre-accept), shipper price-reject, offer timeout, whole-job cancellation (shipper / queue admin / platform admin), batch orders.
- Refusal policy (consecutive refusals → move to back).
- Notifications & audit logs.
- Authorization and negative-path behavior.

### 1.3 Scope — Out

- Distance-based (non-queue) driver matching.
- Payment / finance flows (out of scope, covered by finance test plan).
- Load/unload GPS tracking beyond queue bookkeeping.
- Performance/load testing (covered by a separate perf plan).

---

## 2. System Under Test Overview

### 2.1 Architecture Flow

```
                 ┌─────────────────────────────────────────────────────┐
   Shipper       │  POST /api/shipperRequest                           │
   (role 1)      │  { ..., queueOrganizationUniqueId }                │
                 └──────────────────────┬──────────────────────────────┘
                                        ▼
                 handleQueueDispatch ──► offerToDriver (FOR UPDATE)
                                        │  - front waiting driver of order's vehicleType
                                        │  - status 'waiting' → 'offered'
                                        │  - create JourneyDecision (decisionBy='queue',
                                        │    journeyStatus='requested')
                                        │  - socket: queue_order_offered
                                        ▼
        ┌───────────────────────────────┴───────────────────────────────┐
        ▼                                                               ▼
  Driver ACCEPT                                                    Driver REJECT
  PUT /api/driver/acceptShipperRequest                              DELETE /api/driver/cancelDriverRequest (roleId=2, reason 2)
        │                                                               │  journeyStatus → rejected_by_driver
        │  journeyStatus → accepted                                     ▼
        │  markEntryLoaded → entry leaves queue                    advance order → next driver (refusalCount +1)
        │  socket: queue_order_assigned                            socket: queue_order_rejected / snapshot
        ▼                                                               │
   order in transit                                                    │
        │                                                               ├─ after QUEUE_REFUSAL_LIMIT (3) consecutive →
        │                                                               │   moved to back of line, count reset to 0
        │                                                               ▼
        │                                                    Shipper price-reject (PUT /api/user/rejectDriverOffer)
        │                                                    or offer timeout (QUEUE_OFFER_WINDOW_MINUTES=3) →
        │                                                    same advance path, refusalCount +1
        ▼
  Whole-job cancel (any role) → release entry, CanceledJourneys(roleId, reason),
  NO refusal count, socket: queue_order_cancelled
```

### 2.2 Key Tables

| Table                                       | Role in queue process                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `QueueOrganization`                         | Org profile,`approvalStatus` (`pending/approved/rejected/suspended`), `queueEnabled`                                             |
| `QueueOrganizationMembership`               | Membership of user (role 1 shipper / role 11 queue org admin) per org                                                            |
| `DriverQueue`                               | Per-driver queue entry:`queueNumber`, `status` (`waiting/offered/loaded/removed`), `queueRefusalCount`, `shipperRequestUniqueId` |
| `VehicleDriver` / `Vehicle` / `VehicleType` | Driver's active vehicle and its vehicle type (queue is per vehicle type)                                                         |
| `JourneyDecisions`                          | Offer decision records,`decisionBy='queue'`                                                                                      |
| `ShipperRequest` / `DriverRequest`          | Order and driver-request journey status                                                                                          |
| `CanceledJourneys`                          | Cancellation audit: role, reason, actor, timestamp                                                                               |
| `QueueAuditLog`                             | Admin overrides / removals / manual check-ins (if enabled)                                                                       |

### 2.3 Governing Business Rules (reference)

| Rule | Detail                                                                                                                                                                        | Source                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| R1   | Check-in allowed only when org`approvalStatus='approved'` AND `queueEnabled=1`                                                                                                | `DriverQueue.service.checkin`         |
| R2   | One active queue entry per driver, system-wide, per day (FENCE). Re-check-in to same org is idempotent; duplicate elsewhere → 409                                             | `getDriverQueueState`, ER_DUP_ENTRY   |
| R3   | `queueNumber` assigned per `(queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId)`                                                                                      | `nextQueueNumber`                     |
| R4   | Order on a queue-enabled org auto-offers the**front** `waiting` driver of the order's vehicle type; only that driver is notified                                              | `handleQueueDispatch`/`offerToDriver` |
| R5   | A driver already holding an active offer elsewhere is skipped past (keeps position)                                                                                           | `offerToDriver`                       |
| R6   | Offer window =`QUEUE_OFFER_WINDOW_MINUTES` (default **3 min**); no response → auto-advance (implicit reject)                                                                  | `releaseExpiredOffers`                |
| R7   | Driver reject pre-accept, shipper price-reject, and timeout all advance the order to the next driver and increment`queueRefusalCount` by 1                                    | `rejectOffer`/`offerToNextDriver`     |
| R8   | Consecutive refusals ≥`QUEUE_REFUSAL_LIMIT` (default **3**, env-configurable) → driver moved to back of line, count reset to 0; driver is **not** removed                     | `applyRefusalPolicy`                  |
| R9   | Accept →`markEntryLoaded`: entry leaves the queue (`loaded`/`removed`), order enters transit                                                                                  | `markEntryLoaded`                     |
| R10  | Whole-job cancellation (shipper / queue admin / platform admin) releases the linked entry**without** incrementing refusal count; `CanceledJourneys` records `roleId` + reason | `releaseEntry`, cancel service        |
| R11  | Cancel reasons: role 2 driver`"Cancelled by driver"`, role 11 `"Cancelled by queue admin"`, role 3 platform admin, role 1 shipper                                             | `Utils/ListOfSeedData.js`             |

---

## 3. Test Environment & Prerequisites

### 3.1 Environment

| Item         | Value                                                                       |
| ------------ | --------------------------------------------------------------------------- |
| API base URL | `http://<host>:<port>/api`                                                  |
| DB           | MySQL (schema per`docs/setup.md`)                                           |
| Socket       | Socket.IO server (same process)                                             |
| Env knobs    | `QUEUE_OFFER_WINDOW_MINUTES` (default 3), `QUEUE_REFUSAL_LIMIT` (default 3) |

### 3.2 Authentication / Test Accounts

Create one account per role and capture the token (`Authorization: Bearer <token>`).
Role IDs from `Utils/ListOfSeedData.js`: shipper = 1, driver = 2, admin = 3, superadmin = 6,
company admin = 7, queue org admin = 11.

| #   | Alias         | Role             | Purpose                                                                                |
| --- | ------------- | ---------------- | -------------------------------------------------------------------------------------- |
| A1  | `admin@qa`    | 3 Admin          | Create org? No — approves org, toggles`queueEnabled`, platform-level cancel            |
| A2  | `qadmin@qa`   | 11 QueueOrgAdmin | Create org, add members, manual check-in, override, remove, dispatch, whole-job cancel |
| A3  | `driver01@qa` | 2 Driver         | Front driver, queue flow positive/negative                                             |
| A4  | `driver02@qa` | 2 Driver         | Second driver (advance/turn-taking)                                                    |
| A5  | `driver03@qa` | 2 Driver         | Refusal-policy driver (limit testing)                                                  |
| A6  | `shipper@qa`  | 1 Shipper        | Places queue orders, accepts/price-rejects offers, cancels whole job                   |

### 3.3 Seed Data (per test day)

1. **Vehicle types** — at least one used by the org (e.g. `truck`, `truck_long`).
2. **Vehicles + VehicleDriver assignments** — one active assignment per test driver:
   - `driver01` → vehicle type `truck`
   - `driver02` → vehicle type `truck`
   - `driver03` → vehicle type `truck`
   - one extra driver (`driver04`) → vehicle type `truck_long` for type-scoping tests.
3. **Queue organization** — created by `qadmin@qa`, approved + enabled by `admin@qa` (Section 5.1).
4. **Cancellation reason seeds** — ensure role-based reasons exist in `CanceledJourneys` seed (R11).

### 3.4 Test Tools

- API client (Postman / Insomnia / cURL) with environment variables for tokens.
- Socket.IO client (or the mobile app with dev build) to observe `queue_*` events.
- Direct SQL access (read-only checks) for data assertions; write only via API.
- A way to fast-forward the 3-minute offer window: either wait, temporarily set
  `QUEUE_OFFER_WINDOW_MINUTES=0.1` on a dedicated test instance, or invoke the timeout
  scheduler manually. **Recommended:** a dedicated test instance with a short window.

---

## 4. Test Approach & Techniques

| Technique                  | Use                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| API integration testing    | End-to-end REST flows across roles; primary technique                                     |
| State-machine verification | Assert`ShipperRequest`/`DriverRequest`/`JourneyDecisions` status transitions at each step |
| DB invariant assertions    | Post-condition SQL checks (Section 10)                                                    |
| Negative testing           | Authorization, validation, illegal state transitions, empty queues                        |
| Boundary testing           | Refusal limit (2 vs 3), offer-window edge, single-queue fence                             |
| Concurrency testing        | Simultaneous dispatch to same driver, simultaneous accepts, duplicate check-in            |
| Idempotency testing        | Re-check-in, repeated cancel/reject calls                                                 |
| Notification testing       | Socket event names + payloads, queue snapshots to admins                                  |
| Regression scope           | Non-queue (distance) order creation must remain unaffected                                |

### 4.1 Defect Severity

| Severity   | Definition                                         | Example                                               |
| ---------- | -------------------------------------------------- | ----------------------------------------------------- |
| S1 Blocker | Data corruption, wrong money, security/auth bypass | Entry accepted while already loaded for another order |
| S2 High    | Core flow broken, no workaround                    | Driver accept does not leave the queue                |
| S3 Medium  | Feature works with workaround / partial            | Refusal count not reset after move-to-back            |
| S4 Low     | Cosmetic / minor                                   | Notification payload missing a field                  |

---

## 5. Test Data Setup — Global Preconditions

> Run once per environment and treat as the base state for every test case below.

### 5.1 TDS-01 — Register & activate a queue organization

| Step | Action                                                                                                                                                      | Expected                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1    | Login`qadmin@qa` (role 11), get token                                                                                                                       | 200                                                            |
| 2    | `POST /api/queueOrganization` with `{ queueOrganizationName: "QA Dispatch Hub", queueOrganizationType: "truck_station", phone, address, lat, long }`        | 201/200; body`data.approvalStatus = "pending"`                 |
| 3    | SQL:`QueueOrganization.approvalStatus='pending'`, `queueEnabled=0`; `QueueOrganizationMembership` row exists for `qadmin@qa` with `roleId=11`, `isActive=1` | 1 org row, 1 membership row                                    |
| 4    | Repeat`POST` with the same name                                                                                                                             | **409** `"A queue organization with this name already exists"` |
| 5    | Login`admin@qa`; `PATCH /api/queueOrganization/:id/approve` with `{ approvalStatus: "approved", queueEnabled: true }`                                       | 200                                                            |
| 6    | SQL:`approvalStatus='approved'`, `queueEnabled=1`                                                                                                           | both set                                                       |
| 7    | `POST /api/queueOrganization/:id/members/:driver04UserId` with `{ roleId: 1 }`                                                                              | member added (shipper-scope membership)                        |
| 8    | **Negative:** `PATCH .../approve` using a `driver01` token                                                                                                  | **403** (admin/superadmin only)                                |
| 9    | **Negative:** `DELETE /api/queueOrganization/:id` using a `qadmin` token                                                                                    | **403**                                                        |

### 5.2 TDS-02 — Driver & vehicle setup

1. Ensure `driver01..04` have an active `VehicleDriver` row bound to a `Vehicle` of the required `VehicleType`.
2. Record each driver's `vehicleDriverUniqueId` (needed by check-in).
3. **Negative:** a driver without any active `VehicleDriver` assignment attempts check-in → expect validation/403 `"no active vehicle"`.

---

## 6. Test Case Inventory & Traceability

| Feature                                     | Test cases    |
| ------------------------------------------- | ------------- |
| Queue organization lifecycle                | TQ-01 … TQ-04 |
| Driver check-in / position / check-out      | TQ-05 … TQ-10 |
| Auto-dispatch & offer                       | TQ-11 … TQ-14 |
| Accept flow                                 | TQ-15 … TQ-17 |
| Reject & advance (driver, shipper, timeout) | TQ-18 … TQ-22 |
| Refusal policy                              | TQ-23 … TQ-24 |
| Whole-job cancellation                      | TQ-25 … TQ-28 |
| Batch orders                                | TQ-29         |
| Concurrency & idempotency                   | TQ-30 … TQ-32 |
| Queue admin manual operations               | TQ-33 … TQ-36 |
| Notifications & audit                       | TQ-37 … TQ-38 |
| Regression (non-queue)                      | TQ-39         |
| Check-in auto-offer recovery                | TQ-40 … TQ-42 |

---

## 7. Test Cases

Legend — **P**: priority (High/Med/Low). **Auth**: who executes. **Pre**: preconditions.
**DB**: post-condition SQL assertion.

---

### 7.1 Queue Organization Lifecycle

#### TQ-01 · Create queue organization (pending state) — **High**

- **Auth:** role 11 (also 3/6/7 valid). **Pre:** TDS-01.
- **Steps:**
  1. `POST /api/queueOrganization` (valid payload).
  2. `GET /api/queueOrganization?queueOrganizationUniqueId=<id>`.
- **Expected:** org created with `approvalStatus="pending"`, `queueEnabled=0`. Creator is auto-added as role-11 member. Org visible to admin and to the creator; **not** visible to `driver01` unless member.
- **DB:** `QueueOrganization` row; `QueueOrganizationMembership(roleId=11)` row.

#### TQ-02 · Approve + enable; check-in gate — **High**

- **Steps:** approve as admin (TDS-01). Then attempt `POST /api/queue/driver/checkin` with `driver01`.
- **Expected:**
  - While `queueEnabled=0` (before enable) or `approvalStatus != approved`: check-in returns **403** `"Queue organization is not enabled for dispatch"`.
  - After enable: check-in succeeds.

#### TQ-03 · Suspend disables dispatch — **Med**

- **Steps:** `PATCH .../approve { approvalStatus: "suspended" }` → check-in.
- **Expected:** check-in **403**; existing queue entries remain but no new dispatch.
- **DB:** org `approvalStatus='suspended'`.

#### TQ-04 · Soft-delete org — **Low**

- **Steps:** admin `DELETE /api/queueOrganization/:id`.
- **Expected:** 200; subsequent check-in → **403**/404; list no longer returns org.
- **DB:** `isDeleted`/`queueDeletedAt` set.

---

### 7.2 Driver Check-in / Position / Check-out

#### TQ-05 · Check-in stamps queue number per vehicle type — **High**

- **Pre:** org approved+enabled. `driver01`(truck), `driver02`(truck), `driver04`(truck_long).
- **Steps:** check-in in order: driver01, driver02, driver04.
- **Expected:** each returns `{ queueUniqueId, queueNumber, position }`.
  - driver01 → `queueNumber=1`
  - driver02 → `queueNumber=2`
  - driver04 → `queueNumber=1` (separate type sequence).
- **DB:** `DriverQueue` rows: `(1, truck)`, `(2, truck)`, `(1, truck_long)`; `status='waiting'`, `queueRefusalCount=0`.

#### TQ-06 · Single-queue-per-day fence — **High**

- **Steps:** driver01 already in `QA Dispatch Hub`; create/point to a second approved+enabled org; check-in driver01 there.
- **Expected:** **409** `"Driver is already in the queue for this day"`.
- **DB:** no second active `DriverQueue` row for driver01 that day.

#### TQ-07 · Re-check-in is idempotent (same org) — **High**

- **Steps:** driver01 check-in again to same org.
- **Expected:** 200 with the **existing** `queueUniqueId` and same `queueNumber` (no new row, no reposition).
- **DB:** still 1 active row for driver01.

#### TQ-08 · Check-in to unapproved / disabled org — **High**

- **Expected:** **403** (see TQ-02/TQ-03).

#### TQ-09 · myPosition — **High**

- **Steps:** `GET /api/queue/driver/myPosition?queueOrganizationUniqueId=<id>&queueDate=<today>` as driver02 (truck).
- **Expected:** returns own entry with `queueNumber=2`; `waitingAhead`/count of truck drivers ahead = 1. Not found / empty for driver not checked in.
- **DB:** matches `DriverQueue` count of `status='waiting'` with `queueNumber < 2` for truck type.

#### TQ-10 · Check-out — **High**

- **Steps:** `DELETE /api/queue/driver/checkout?queueOrganizationUniqueId=<id>&queueDate=<today>` as driver01.
- **Expected:** 200; entry `status='removed'`; `myPosition` no longer returns it; position of remaining drivers unchanged (numbers are stable, gaps allowed).
- **DB:** `DriverQueue.status='removed'` for that entry.

---

### 7.3 Auto-Dispatch & Offer

#### TQ-11 · Order on queue org auto-offers front driver — **High**

- **Pre:** driver01 (truck, `queueNumber=1`) and driver02 (truck, `queueNumber=2`) waiting; org enabled.
- **Steps:**
  1. `POST /api/shipperRequest` with `{ ..., queueOrganizationUniqueId: <id>, vehicleTypeUniqueId: truck, numberOfVehicles: 1, ... }`.
  2. Observe socket on driver01.
- **Expected:**
  - Response 201.
  - Socket `queue_order_offered` **only** to driver01 (front), payload contains `queue` (`queueOrganizationUniqueId`, `queueNumber=1`, `offerWindowMinutes=3`) and `decisions.journeyStatus='requested'`.
  - Queue snapshot pushed to queue org admins.
- **DB:**
  - `DriverQueue.driver01.status='offered'`, `shipperRequestUniqueId=<order>`.
  - `JourneyDecisions` row: `decisionBy='queue'`, `journeyStatus='requested'`.
  - `ShipperRequest.journeyStatus='requested'`; `DriverRequest.journeyStatus='requested'` (created for driver01).

#### TQ-12 · Order with no matching vehicle type stays waiting — **Med**

- **Steps:** place order with `vehicleTypeUniqueId` that has **no** checked-in drivers (e.g. a type nobody joined), same org.
- **Expected:** 201; no offer fired; order remains waiting. Socket **no** `queue_order_offered`; snapshot still pushed.
- **DB:** no `JourneyDecisions` for that order; no `DriverQueue` entry linked.

#### TQ-13 · Driver holding another offer is skipped — **Med**

- **Pre:** driver01 holds an active offer on order O1 (status `offered`). Order O2 arrives (same type).
- **Steps:** create O2.
- **Expected:** O2 offers to **driver02** (next waiting), not driver01; driver01 keeps `shipperRequestUniqueId=O1`.
- **DB:** driver02 entry `status='offered'`, linked to O2; driver01 still `offered` on O1.

#### TQ-14 · Dispatch blocked when org disabled mid-session — **Med**

- **Steps:** admin sets `queueEnabled=false` while drivers waiting; place new order.
- **Expected:** order created but **not** offered (or 403 at creation depending on org gate); no `queue_order_offered`.

---

### 7.4 Accept Flow

#### TQ-15 · Driver accepts → leaves queue, order in transit — **High**

- **Pre:** driver01 holds offer (TQ-11).
- **Steps:** `PUT /api/driver/acceptShipperRequest` (driver01 token, `shipperRequestUniqueId=<order>`).
- **Expected:** 200. Socket `queue_order_assigned` (driver + snapshot).
- **DB:**
  - `ShipperRequest.journeyStatus='accepted'`; `DriverRequest.journeyStatus='accepted'`; `JourneyDecisions` decision row (accepted).
  - `DriverQueue.driver01` entry `status IN ('loaded','removed')`, `loadedAt` set, `shipperRequestUniqueId` set; **no longer counts** as waiting for next dispatch.

#### TQ-16 · Accept on already-accepted order → 4xx, no side effects — **Med**

- **Steps:** repeat accept from TQ-15 with same driver + order.
- **Expected:** 4xx (invalid state); no new journey decision; queue unchanged.

#### TQ-17 · Driver B (not offered) accepts → denied — **High**

- **Steps:** driver02 tries `acceptShipperRequest` for the order offered to driver01.
- **Expected:** 4xx `"Only the offered driver can accept"`; state unchanged.

---

### 7.5 Reject & Advance

#### TQ-18 · Driver rejects pre-accept → order advances, count +1 — **High**

- **Pre:** driver01 (`queueNumber=1`) offered O; driver02 waiting behind.
- **Steps:** `DELETE /api/driver/cancelDriverRequest?ownerUserUniqueId=<driver01>&roleId=2&cancellationReasonsTypeId=2` (reason `Cancelled by driver`).
- **Expected:**
  - 200. Driver01 remains **in queue** (keeps position) — `status` back to `waiting`.
  - Order O auto-offers **driver02** (`queue_order_offered` to driver02).
  - Socket `queue_order_rejected` + snapshot; shipper notified.
- **DB:**
  - `DriverQueue.driver01.queueRefusalCount=1`, `status='waiting'`, `shipperRequestUniqueId=NULL`.
  - `JourneyDecisions`: new decision `journeyStatus='rejected_by_driver'`, `decisionBy` = driver's user id (driver-initiated).
  - `CanceledJourneys` row for the driver request with `roleId=2`, reason `Cancelled by driver`.
  - `DriverQueue.driver02.status='offered'` linked to O.

#### TQ-19 · Shipper price-reject advances to next driver — **High**

- **Pre:** driver02 currently offered O (after TQ-18); driver03 waiting; driver01 already count=1.
- **Steps:** `PUT /api/user/rejectDriverOffer` with `{ shipperRequestUniqueId: O, ... }` (no `driverUserUniqueId`).
- **Expected:**
  - 200. Driver02's refusal count +1; driver02 stays in queue.
  - O advances to driver03 (`queue_order_offered`).
- **DB:**
  - `DriverQueue.driver02.queueRefusalCount=1`.
  - New `JourneyDecisions` `journeyStatus='rejected_by_shipper'` (shipper-initiated, no driver).
  - driver03 entry `status='offered'`.

#### TQ-20 · Offer timeout auto-advances (implicit reject) — **High**

- **Pre:** driver03 offered O; `QUEUE_OFFER_WINDOW_MINUTES` elapsed (or shortened on test instance).
- **Steps:** wait for scheduler run.
- **Expected:**
  - O auto-offers next driver; socket `queue_order_rejected` (timeout) + snapshot.
  - driver03 refusal count +1.
- **DB:** `DriverQueue.driver03.queueRefusalCount=1`; new decision `journeyStatus='rejected_by_driver'`/timeout-flagged; next driver entry `offered`.

#### TQ-21 · Empty queue after reject → order stays waiting — **Med**

- **Pre:** only driver03 checked in; driver03 rejects O.
- **Expected:** O stays waiting (`status` pending/waiting); no driver offered; snapshot pushed. Queue **not** an error.
- **DB:** no entry `offered`; `ShipperRequest` still `requested`/waiting.

#### TQ-22 · Repeated driver reject → no double state change — **Med**

- **Steps:** after TQ-18, driver01 attempts the same cancel/reject for O again (O no longer linked to driver01).
- **Expected:** 4xx or no-op; **no** additional `queueRefusalCount` increment, no double advance.

---

### 7.6 Refusal Policy

#### TQ-23 · Consecutive refusals move driver to back, counter resets — **High**

- **Pre:** `QUEUE_REFUSAL_LIMIT=3`. Driver03 is the ONLY truck driver (others checked out) and has been offered the last 3 orders.
- **Steps:**
  1. Create O1 → driver03 rejects (count=1).
  2. Create O2 → driver03 rejects (count=2).
  3. Create O3 → driver03 rejects (count=3).
- **Expected:**
  - After 3rd refusal: driver03 moved to **back of the truck queue** (new largest `queueNumber`), `queueRefusalCount` reset to **0**, status `waiting` (NOT removed).
  - Socket `queue_refusal_moved_to_back` to admins with `{ refusalCount:3, refusalLimit:3 }`; snapshot pushed.
- **DB:** `DriverQueue.queueNumber` increased (e.g. 1→2 when a new driver joined after); `queueRefusalCount=0`.

#### TQ-24 · Below limit → stays at front — **Med**

- **Pre:** fresh driver02, count=0.
- **Steps:** 2 consecutive refusals (O1, O2).
- **Expected:** `queueNumber` unchanged; `queueRefusalCount=2`; **no** `queue_refusal_moved_to_back` event.

---

### 7.7 Whole-Job Cancellation

#### TQ-25 · Shipper cancels whole job — releases entry, no refusal count — **High**

- **Pre:** driver02 offered O (after TQ-19 state); shipper token.
- **Steps:** `PUT /api/shipperRequest/cancelShipperRequest/:userUniqueId` with `{ roleId: 1, cancellationReasonsTypeId: 6 }`.
- **Expected:**
  - 200. Socket `queue_order_cancelled` to admins; snapshot pushed; shipper/driver notified.
  - Driver02 stays in queue, count **unchanged** (0).
- **DB:**
  - `DriverQueue.driver02.status='waiting'`, `shipperRequestUniqueId=NULL`, `queueRefusalCount` unchanged.
  - `ShipperRequest.journeyStatus='cancelled_by_shipper'`.
  - `CanceledJourneys` with `roleId=1`, reason `Cancelled by shipper`.

#### TQ-26 · Queue admin cancels whole job — **High**

- **Steps:** same as TQ-25 but executed by `qadmin@qa`, reason role 11.
- **Expected:** 200; entry released; **no** refusal count.
- **DB:** `CanceledJourneys.roleId=11`, reason `Cancelled by queue admin`.

#### TQ-27 · Platform admin cancels whole job — **High**

- **Steps:** same, executed by `admin@qa`, reason role 3.
- **Expected:** 200; entry released; **no** refusal count.
- **DB:** `CanceledJourneys.roleId=3`.

#### TQ-28 · Cancel order NOT linked to queue → no queue effect — **Med**

- **Steps:** cancel a normal (non-queue) order.
- **Expected:** 200; no `DriverQueue` row touched; no `queue_order_cancelled` event; snapshot unchanged.

---

### 7.8 Batch Orders

#### TQ-29 · Batch order dispatches one offer per slot — **High**

- **Pre:** driver01, driver02, driver03 (truck) waiting; driver04 (truck_long) waiting.
- **Steps:** `POST /api/shipperRequest` with `{ numberOfVehicles: 2, vehicleTypeUniqueId: truck, queueOrganizationUniqueId: <id> }`.
- **Expected:**
  - Two independent offers: driver01 (slot 1) and driver02 (slot 2).
  - Accepting slot 1 leaves slot 2 unaffected.
  - Each slot has its own `JourneyDecisions`/`DriverRequest`.
- **DB:** two `DriverQueue` entries `offered` (driver01, driver02); two `JourneyDecisions` with `decisionBy='queue'`.

---

### 7.9 Concurrency & Idempotency

#### TQ-30 · Concurrent dispatch never double-offers a driver — **High**

- **Steps:** fire 2 identical order creations (same vehicle type, single driver waiting) near-simultaneously.
- **Expected:** exactly one `queue_order_offered` to the single driver; the other order stays waiting (or offered to a later driver if one checks in mid-test). No double link on `DriverQueue`.
- **DB:** driver's `DriverQueue.shipperRequestUniqueId` points to exactly one order; one `JourneyDecisions` linked to that driver+offer at a time.

#### TQ-31 · Concurrent accept from same driver/order — **High**

- **Steps:** two parallel `acceptShipperRequest` for the same order.
- **Expected:** exactly one success; other fails 4xx; `markEntryLoaded` runs once.
- **DB:** single `loaded` transition; single accepted decision.

#### TQ-32 · Check-in races (same driver, parallel) — **Med**

- **Expected:** exactly one `DriverQueue` row; one returns 200, the other 409 (or idempotent 200 with same entry). No duplicate rows.

---

### 7.10 Queue Admin Manual Operations

#### TQ-33 · Manual check-in — **Med**

- **Steps:** `POST /api/queue/manualCheckin` as `qadmin@qa` with `{ queueOrganizationUniqueId, vehicleDriverUniqueId }`.
- **Expected:** entry created at next `queueNumber` for that vehicle type; audit recorded (if enabled).

#### TQ-34 · Override entry position (audited) — **Med**

- **Steps:** `PATCH /api/queue/entry/:queueUniqueId/override` with `{ newQueueNumber }`.
- **Expected:** 200; position updated; snapshot pushed; override recorded in `QueueAuditLog`.
- **DB:** `DriverQueue.queueNumber` = new value; audit row with actor `qadmin@qa`.

#### TQ-35 · Remove entry (no-show) — **Med**

- **Steps:** `DELETE /api/queue/entry/:queueUniqueId` as `qadmin@qa`.
- **Expected:** 200; entry `status='removed'`; audit row; snapshot pushed. Note: removed/loaded entries are free — driver may re-check-in.

#### TQ-36 · Manual dispatch — **High**

- **Pre:** order O waiting (no auto-offer, e.g. TQ-12), drivers waiting.
- **Steps:** `POST /api/queue/dispatch` with `{ queueOrganizationUniqueId, shipperRequestUniqueId }` as `qadmin@qa`.
- **Expected:** front driver of matching type offered; `queue_order_offered`; 404 if queue empty.

---

### 7.11 Notifications & Audit

#### TQ-37 · Event mapping — **Med**

| Event                         | Trigger                        | Recipients                     |
| ----------------------------- | ------------------------------ | ------------------------------ |
| `queue_order_offered`         | auto/manual dispatch           | offered driver                 |
| `queue_order_assigned`        | accept                         | driver + snapshot              |
| `queue_order_rejected`        | driver/shipper reject, timeout | admins + shipper (best-effort) |
| `queue_refusal_moved_to_back` | refusal limit hit              | admins                         |
| `queue_order_cancelled`       | whole-job cancel               | admins                         |
| `queue_position_changed`      | check-in / reorder / remove    | admins                         |

- Verify each event name, payload fields, and that queue org admins receive snapshots.

#### TQ-38 · Audit completeness — **Med**

- For every state transition, verify a corresponding `JourneyDecisions` row (`decisionBy` = `queue` for auto-offers, else actor user id) and, for cancellations, a `CanceledJourneys` row with correct `roleId`/reason.
- Verify `decisionTime`/timestamps are populated and monotonic per order.

---

### 7.12 Regression

#### TQ-39 · Non-queue (distance) matching unaffected — **High**

- **Steps:** create order **without** `queueOrganizationUniqueId`.
- **Expected:** follows legacy distance-matching path; no `JourneyDecisions` with `decisionBy='queue'`; no `DriverQueue` changes; no queue socket events.

---

### 7.13 Check-in Auto-Offer Recovery

> Behavior: an order that outlived the queue — created (or advanced) while no
> driver of its type was waiting, or refused by every waiting driver — is
> **auto-offered on the next check-in** of a matching-type driver. `checkin` →
> `rescanPendingQueueOrder` (oldest pending order FIFO) → `offerToDriver` (front
> waiting driver). One order per check-in; a driver who already refused the order
> is skipped.

#### TQ-40 · Empty queue at creation → auto-offer on next matching-type check-in — **High**

- **Pre:** org approved+enabled; **no** truck drivers checked in. Order O created with `vehicleTypeUniqueId: truck` (TQ-12 state — O stays `waiting`).
- **Steps:** driver01 (truck) checks in.
- **Expected:**
  - Check-in 200 with `queueNumber=1`.
  - O auto-offers driver01 (`queue_order_offered`); shipper notified.
- **DB:**
  - `DriverQueue.driver01.status='offered'`, `shipperRequestUniqueId=O`.
  - `JourneyDecisions` for O with `decisionBy='queue'`, `journeyStatus='requested'`; `ShipperRequest.journeyStatus='requested'`.

#### TQ-41 · All-rejected order → auto-offer on next check-in, rejector skipped — **High**

- **Pre:** driver01 is the only truck driver; O offered to driver01 then rejected (TQ-18 state — O has no active offer, `journeyStatus='requested'`). driver01 remains waiting in queue.
- **Steps:** driver02 (truck) checks in.
- **Expected:**
  - O auto-offers **driver02**, not driver01 (driver01 already refused O — no re-offer).
  - driver01 keeps `queueNumber`; `queue_order_offered` to driver02 only.
- **DB:**
  - `DriverQueue.driver02.status='offered'`, `shipperRequestUniqueId=O`.
  - `JourneyDecisions` for O: no decision for driver01 after the original reject.

#### TQ-42 · Concurrent check-ins never double-offer one order — **High**

- **Pre:** order O `waiting` (empty queue at creation). driver01 and driver02 (both truck) check in near-simultaneously.
- **Expected:** exactly **one** `queue_order_offered` for O; the other driver gets nothing (O is already `offered`/`requested`, excluded by `NOT EXISTS`).
- **DB:** one `DriverQueue` entry `offered` linked to O; one `JourneyDecisions` for O.

---

## 8. Entry Criteria

- Code for queue process merged and deployable to test env.
- Test env seeded (Section 3) and `docs/queue-*.md` design docs reviewed by QA.
- Test accounts/tokens available for all roles.
- DB read access granted for assertions.
- Socket client tooling available.

## 9. Exit Criteria

- 100% of **High** cases executed and passed (or formally waived with S1/S2 defects closed).
- No open **S1** defects; open **S2** defects have a documented workaround and a fix release date.
- ≥90% overall pass rate across all severities.
- Regression (TQ-39) and concurrency (TQ-30…TQ-32) all pass.
- Test evidence (results, screenshots, logs, SQL outputs) archived.
- Sign-off from QA, Dev, and Product.

---

## 10. DB Assertion Queries (Post-Condition)

Use these read-only queries to verify invariants after each test.

```sql
-- Active queue entries for a day
SELECT dq.queueNumber, dq.status, dq.queueRefusalCount, dq.shipperRequestUniqueId,
       u.phoneNumber
FROM DriverQueue dq
JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
WHERE dq.queueOrganizationUniqueId = :orgId
  AND dq.queueDate = CURRENT_DATE
  AND dq.queueDeletedAt IS NULL
ORDER BY dq.queueNumber;

-- Journey decisions for an order (order of state transitions)
SELECT journeyStatusId, decisionBy, decisionTime
FROM JourneyDecisions
WHERE shipperRequestId = :orderId
ORDER BY decisionTime;

-- Cancellation audit
SELECT roleId, cancellationReason, createdAt
FROM CanceledJourneys
WHERE shipperRequestUniqueId = :orderUniqueId;

-- Single-active-queue-per-driver fence
SELECT COUNT(*) AS active_entries
FROM DriverQueue dq
JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
WHERE vd.driverUserUniqueId = :driverId
  AND dq.queueDate = CURRENT_DATE
  AND dq.queueDeletedAt IS NULL
  AND dq.status IN ('waiting','offered');
```

---

## 11. Execution & Reporting

| Phase                                  | Duration (target) | Deliverable                         |
| -------------------------------------- | ----------------- | ----------------------------------- |
| Test data setup (Section 5)            | 0.5 day           | Prepared env, org, accounts         |
| Smoke run (TQ-01, TQ-05, TQ-11, TQ-15) | 0.5 day           | Smoke report                        |
| Full functional pass (all TQ)          | 2 days            | Test results spreadsheet + evidence |
| Refusal/timeout with shortened window  | 0.5 day           | Timeout test report                 |
| Concurrency pass (TQ-30…32)            | 0.5 day           | Concurrency report                  |
| Defect triage & re-test                | 1 day             | Re-test results                     |
| Sign-off                               | —                 | Signed-off summary                  |

Defects are tracked with severity (Section 4.1), reproduction steps, expected vs actual,
API request/response payloads, and DB snapshot.

---

## 12. Risks & Assumptions

| Risk / Assumption                                               | Impact         | Mitigation                                                    |
| --------------------------------------------------------------- | -------------- | ------------------------------------------------------------- |
| 3-minute offer window slows timeout tests                       | Medium         | Test instance with`QUEUE_OFFER_WINDOW_MINUTES` reduced        |
| Queue admin cancel reasons require seeded role-11 reason        | High if absent | Verify`Utils/ListOfSeedData.js` reason seeds during setup     |
| Socket events may be missed without a live client               | Medium         | Run socket listener on every role during the test session     |
| `QUEUE_REFUSAL_LIMIT` env differs per env                       | Medium         | Pin env value in test config; assert against the API behavior |
| Legacy distance-matching path could be touched by queue changes | High           | Dedicated regression suite (TQ-39) in every run               |

---

## 13. Sign-off

| Role          | Name | Signature | Date |
| ------------- | ---- | --------- | ---- |
| QA Lead       |      |           |      |
| Dev Lead      |      |           |      |
| Product Owner |      |           |      |
