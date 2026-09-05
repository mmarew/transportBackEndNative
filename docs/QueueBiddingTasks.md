# Queue Bidding System — Task Breakdown

Execution order follows dependency: **schema → write path → read path (batch inheritance) → bidding feature → endpoints/tests**.

**Confirmed model:** `queueOrganizationUniqueId` lives ONLY on `ShipperRequestBatch` (canonical). It is REMOVED from `ShipperRequest` and inherited via batch join. Every `ShipperRequest` maps to a batch via `shipperRequestBatchUniqueId`.

**No-repetition rule applied to every task:** before writing, `grep` for the target symbol; then verify each value is written once (single source) and each query either joins the batch ONCE or is a self-contained read. No task duplicates an edit another task owns.

Abbreviation used below: `sr` = `ShipperRequest`, `srb` = `ShipperRequestBatch`.

---

## Task 1 — Add `queueOrganizationUniqueId` to `ShipperRequestBatch` (schema)

**File:** `Database/Database.js` (ShipperRequestBatch CREATE, lines 441-480)

**How:** In the `CREATE TABLE IF NOT EXISTS ShipperRequestBatch` block, after `targetCompanyUniqueId` (line 449), add the column + index + FK:

```sql
queueOrganizationUniqueId VARCHAR(36) NULL DEFAULT NULL,   -- canonical; FK → QueueOrganization
...
INDEX idx_batch_queue_org (queueOrganizationUniqueId),
FOREIGN KEY (queueOrganizationUniqueId) REFERENCES QueueOrganization(queueOrganizationUniqueId),
```

**Why:** The batch is the single source of truth for the queue affiliation. `company_target` (bulk/company load) batches defer `ShipperRequest` rows to bid acceptance, so only the batch header can carry the queue. This task establishes the destination for the migration in Task 2.

**Verify no repetition:** `grep -n "queueOrganizationUniqueId" Database/Database.js` → the row definition at line 393 is the ONLY remaining `ShipperRequest` field; new batch field appears exactly once. No other file writes the batch column yet (Task 3 owns the single write point).

---

## Task 2 — Idempotent migration: backfill batch + drop `ShipperRequest` field

**File:** `Services/Database/tableManage.service.js` (function `ensureQueueOrgReferences`, lines 42-84; call note at 558)

**How:**

1. Check `information_schema` for `ShipperRequestBatch.queueOrganizationUniqueId`; if missing, `ALTER TABLE ShipperRequestBatch ADD COLUMN ... VARCHAR(36) NULL DEFAULT NULL` + index `idx_batch_queue_org` + FK. (Same pattern as existing code, but target = batch not sr.)
2. **Backfill** before dropping (only when batch column newly added / value null):

   ```sql
   UPDATE ShipperRequestBatch srb
   JOIN ShipperRequest sr ON sr.shipperRequestBatchUniqueId = srb.batchUniqueId
   SET srb.queueOrganizationUniqueId = sr.queueOrganizationUniqueId
   WHERE srb.queueOrganizationUniqueId IS NULL
     AND sr.queueOrganizationUniqueId IS NOT NULL;
   ```

   (Best-effort: several rows in one batch carry the same value, so any one is correct.)

3. **Drop** the legacy field from `ShipperRequest`, in order: drop FK `fk_shipperRequest_queueOrg`, drop index `idx_shipperRequest_queueOrg`, drop column `queueOrganizationUniqueId`. Guard each with its `information_schema` existence check so the DDL is idempotent.
4. Update the JSDoc comment (line 34) and the second call-site note (line 558) to describe the batch-target migration.

**Why:** Converts the existing database without data loss and keeps it idempotent on re-run (createTable is a no-op on existing DBs). Removing the dual-write copy prevents drift.

**Verify no repetition:** `grep -rn "queueOrganizationUniqueId" Services/Database/tableManage.service.js` → exactly one ADD (batch), one backfill UPDATE, one DROP sequence; nothing re-creates the `shipperRequest_queueOrg` FK/index. Re-running the whole `tableManage` must log "no-op/exists" and not error.

---

## Task 3 — Remove the per-row write in `CreateData.js`; single write = `upsertBatch`

**File:** `CRUD/Create/CreateData.js` (lines 121-124) and `Services/ShipperRequestBatch/batchCreate.service.js` (`upsertBatch`, lines 31-91)

**How:**

1. **CreateData.js:** delete the block
   ```js
   ...(body?.queueOrganizationUniqueId && {
     queueOrganizationUniqueId: body.queueOrganizationUniqueId,
   }),
   ```
2. **batchCreate.service.js:** add `queueOrganizationUniqueId` to the `upsertBatch` destructured signature (lines 31-51), the INSERT column list (lines 61-67), and the `VALUES` array (lines 69-90).

**Why:** Guarantees ONE write point for the queue (the batch header). Removing the per-row write is what makes dropping the column (Task 2) safe at runtime.

**Verify no repetition:** `grep -rn "queueOrganizationUniqueId" CRUD/` → only `CreateData.js` deletion leaves zero matches in `CRUD/Create`. `upsertBatch` writes the field exactly once. Confirm no other `INSERT INTO ShipperRequest (... queueOrganizationUniqueId ...)` exists: `grep -rn "INSERT INTO ShipperRequest" Services/ CRUD/`.

---

## Task 4 — `create.service.js`: pass queue to batch + attach to in-memory request objects for routing

**File:** `Services/ShipperRequest/create.service.js`

**How:**

1. `upsertBatch` call (lines 172-192): add `queueOrganizationUniqueId: body.queueOrganizationUniqueId || null`.
2. Extend the batch reuse guard (lines 140-158) to reject reuse with a different `queueOrganizationUniqueId` (add `srb.queueOrganizationUniqueId` to the `SELECT`, compare with incoming).
3. **Critical:** after `createNewShipperRequest` returns rows (`data[0]`), the DB no longer returns the field on the row. The routing at lines 258-267 (`req?.queueOrganizationUniqueId`, `!req?.queueOrganizationUniqueId`) and line 281 (`createdRequest.queueOrganizationUniqueId`) rely on the in-memory object. Re-attach it from `body`:

   ```js
   result.data.forEach((r) => {
     if (r?.shipperRequestUniqueId)
       r.queueOrganizationUniqueId = body.queueOrganizationUniqueId || null;
   });
   ```

   (Do this where `newRequests.push(result.data[0])` happens, lines 230-234.)

**Why:** The queue vs distance routing decision happens on in-memory objects before/independent of the DB column. Without re-attaching, every queue order would fall into the distance branch and dispatch breaks.

**Verify no repetition:** `grep -n "queueOrganizationUniqueId" Services/ShipperRequest/create.service.js` → appears at upsert, guard, re-attach, and routing reads (all intended). The re-attach loop is the single place the field is set onto created objects.

---

## Task 5 — `batchCreate.service.js` INSERT already covers queue (unified with Task 3)

**File:** `Services/ShipperRequestBatch/batchCreate.service.js`

**How:** Same edit as Task 3 step 2 — the `upsertBatch` INSERT now receives `queueOrganizationUniqueId`. Also add the field to the batch read-back `SELECT` used for notifications (`SELECT b.batchUniqueId ...` lines 100-118) only if needed for display.

**Why:** Keeps the batch header (and any notification payload) consistent with the canonical value.

**Verify no repetition:** This task shares the signature/INSERT edit with Task 3; confirm they are the SAME lines edited ONCE (do not edit twice). `grep -n "queueOrganizationUniqueId" Services/ShipperRequestBatch/batchCreate.service.js` → signature + INSERT once.

---

## Task 6 — Migrate `findNearbyShippers` + `findNearbyDrivers` to batch inheritance

**File:** `CRUD/Read/ReadData.matching.js`

**How:**

1. `findNearbyDrivers` guard (lines 12-17): receives the in-memory `shipperRequest` object — Task 4 already re-attaches `queueOrganizationUniqueId`, so this in-memory check still works. If it can also be called with a DB-fetched object elsewhere, keep the field populated by adding a batch join in that caller.
2. `findNearbyShippers` SQL (lines 106-133): `ShipperRequest.*` no longer contains the field. Add batch join + alias so returned rows still carry `queueOrganizationUniqueId` for downstream filters (e.g. `handleJourneyStatusOne`):

   ```sql
   JOIN ShipperRequestBatch srb ON srb.batchUniqueId = ShipperRequest.shipperRequestBatchUniqueId
   ...
   srb.queueOrganizationUniqueId AS queueOrganizationUniqueId,
   ```

   Change the exclusion `AND ShipperRequest.queueOrganizationUniqueId IS NULL` (line 124) → `AND srb.queueOrganizationUniqueId IS NULL`.

**Why:** Queue orders must never reach distance matching. With the field off the row, the guard must read from the batch.

**Verify no repetition:** `grep -n "queueOrganizationUniqueId" CRUD/Read/ReadData.matching.js` → one batch alias in the SELECT, one `srb.queueOrganizationUniqueId IS NULL` in WHERE. The single `ShipperRequest.*` line is untouched otherwise. Downstream `handleJourneyStatusOne` filter (Task 9) reads the aliased field with no further SQL change.

---

## Task 7 — Migrate `readActive.service.js` queue-exclusion to batch

**File:** `Services/ShipperRequest/readActive.service.js`

**How:** A batch join `srb` already exists (line 157). Change line 162:

```sql
AND sr.queueOrganizationUniqueId IS NULL   -- was
AND srb.queueOrganizationUniqueId IS NULL  -- now
```

**Why:** This is the online-job listing exclusion — it keeps queue orders off the "manually acceptable" list. Must read the canonical batch field.

**Verify no repetition:** The `srb` join is defined once (line 157) and NOT added again. `grep -n "queueOrganizationUniqueId" Services/ShipperRequest/readActive.service.js` → line 162 only.

---

## Task 8 — Migrate `read.service.js` queue filter to batch

**File:** `Services/ShipperRequest/read.service.js`

**How:** Change lines 430-434:

```js
whereClause += " ShipperRequest.queueOrganizationUniqueId = ?"; // was
whereClause += " srb.queueOrganizationUniqueId = ?"; // now
```

The existing `LEFT JOIN ShipperRequestBatch` (line 508) covers both the filtered and count queries.

**Why:** Lets a QueueOrgAdmin list jobs under their queue org; must read from the canonical batch field.

**Verify no repetition:** Confirm `read.service.js` already joins `ShipperRequestBatch` (line 508) — do NOT add a second join. `grep -n "ON ShipperRequestBatch.batchUniqueId = ShipperRequest.shipperRequestBatchUniqueId" Services/ShipperRequest/read.service.js` → appears once.

---

## Task 9 — Migrate counts (`ReadData.shipper.js`) + journey slot-close (`journeyManagement.service.js`)

**Files:** `CRUD/Read/ReadData.shipper.js`, `Services/DriverRequest/journeyManagement.service.js`

**How:**

1. `ReadData.shipper.js` (lines 82, 139): the `queueOrganizationUniqueId ? "sr.queueOrganizationUniqueId = ?" : "sr.userUniqueId = ?"` ternary needs a batch join when the queue filter is used. Add `JOIN ShipperRequestBatch srb ON srb.batchUniqueId = sr.shipperRequestBatchUniqueId` (when `queueOrganizationUniqueId` set) and use `srb.queueOrganizationUniqueId = ?`. Keep the `sr.userUniqueId` branch unchanged (no join needed).
2. `journeyManagement.service.js` (line 336): validation query selects `ShipperRequest.queueOrganizationUniqueId`; add batch join + select `srb.queueOrganizationUniqueId`. Line 554 `if (combinedData?.queueOrganizationUniqueId)` then works off the aliased value.

**Why:** Active-request counts filtering by queue and the journey-completion slot-close decision both need the canonical value.

**Verify no repetition:** Each query adds the batch join at most once. `journeyManagement.service.js` reads `queueOrganizationUniqueId` via the alias exactly once (line 554 consumer). `ReadData.shipper.js`: confirm the join is only added in the queue-filtered branch.

---

## Task 10 — `DriverQueue.service.js`: migrate queue reads + FIFO rescan to batch

**File:** `Services/DriverQueue.service.js`

**How:**

1. `rescanPendingQueueOrder` (lines 2357-2379): add batch join, change `WHERE sr.queueOrganizationUniqueId = ?` (line 2360) → `WHERE srb.queueOrganizationUniqueId = ?`. Keep `sr.requestMode <> 'company_target'` and `sr.journeyStatusId IN (?, ?)` on the row.
2. Display queries:
   - line 463-468: `sr.queueOrganizationUniqueId, o.queueOrganizationName ... ON o.queueOrganizationUniqueId = sr.queueOrganizationUniqueId` → join batch, `srb.queueOrganizationUniqueId`, `ON o.queueOrganizationUniqueId = srb.queueOrganizationUniqueId`.
   - line 1096: `sr.queueOrganizationUniqueId AS orderQueueOrganizationUniqueId` → from batch join.
   - line 387 mapping `row.orderQueueOrganizationUniqueId` unchanged (value now from batch).

**Why:** FIFO rescan and queue status display must read the canonical batch field. This is core to dispatch correctness.

**Verify no repetition:** Each query joins the batch a single time. `grep -n "sr\.queueOrganizationUniqueId\|srb\.queueOrganizationUniqueId" Services/DriverQueue.service.js` → after this task there should be ZERO `sr.queueOrganizationUniqueId` (all migrated).

---

## Task 11 — `Utils/ListOfSeedData.js`: add `bidding: 21`

**File:** `Utils/ListOfSeedData.js` (journeyStatusMap, ~line 722)

**How:** After `partiallyCancelled: 20`, add:

```js
bidding: 21,  // overflow orders open for driver bidding
```

Add the matching `JourneyStatus` seed row (id 21, name 'bidding') in the seed-data section.

**Why:** The bidding feature needs a distinct status to separate "awaiting bids / hidden overflow" from `waiting(1)`/`requested(2)`.

**Verify no repetition:** `grep -n "bidding" Utils/ListOfSeedData.js` → one map key + one seed row. Confirm journeyStatusMap currently ends at 20 (no existing `bidding` key).

---

## Task 12 — `Database/Database.js`: `isBiddingApproved` on `ShipperRequest` + `DriverBid` table + extend ENUM

**File:** `Database/Database.js`

**How:**

1. Add to `ShipperRequest` CREATE (near line 393):

   ```sql
   isBiddingApproved BOOLEAN NOT NULL DEFAULT FALSE,
   ```

   (The plan says `AFTER isCompletionSeen`; match that column's position.)

2. Extend BOTH `requestMode` ENUMs (batch line 448, sr line ~390) to add `'queue_driver_bid'` (if the ENUM lives on both tables — batch is authoritative; keep sr in sync or drop if unused).
3. Add `DriverBid` table per the plan (Phase 1e): id, uniqueId, `shipperRequestUniqueId`, `driverUserUniqueId`, `basePrice`, `bidPrice`, `bidNotes`, `bidStatus` ENUM, `isNonQueueDriver`, timestamps, `UNIQUE(shipperRequestUniqueId, driverUserUniqueId)`, FKs.

**Why:** `isBiddingApproved` is the approval gate that hides overflow orders until approved. `DriverBid` records driver counter-offers. New mode enables the feature.

**Verify no repetition:** `grep -n "isBiddingApproved\|DriverBid\|queue_driver_bid" Database/Database.js` → each appears the intended number of times (1× isBiddingApproved, 1× DriverBid CREATE, ENUM updated on the tables that actually carry requestMode).

---

## Task 13 — Validations: extend `requestMode` ENUM + add `approveBiddingSchema`

**Files:** `Validations/ShipperRequest.schema.js`, `Validations/DriverBid.schema.js` (create)

**How:**

1. `ShipperRequest.schema.js`: add `"queue_driver_bid"` to the `requestMode` allowed values.
2. New `Validations/DriverBid.schema.js`:
   ```js
   const approveBiddingSchema = Joi.object({
     shipperRequestUniqueId: Joi.string().uuid().required(),
     approved: Joi.boolean().default(true),
   });
   module.exports = { approveBiddingSchema };
   ```

**Why:** API layer must accept the new mode and the new approve endpoint payload.

**Verify no repetition:** If a `DriverBid.schema.js` already exists (registered elsewhere), do NOT recreate — edit in place or skip. `grep -rn "approveBiddingSchema\|DriverBid.schema" Routes/ Controllers/ Validations/`.

---

## Task 14 — `findNearbyDrivers` + `findNearbyShippers`: bidding approval gate

**File:** `CRUD/Read/ReadData.matching.js` (same file as Task 6 — apply after batch join is in place)

**How:**

1. `findNearbyDrivers` guard (lines 12-17) → allow approved bidding orders:
   ```js
   if (shipperRequest?.queueOrganizationUniqueId) {
     const isApprovedBidding =
       shipperRequest?.journeyStatusId === journeyStatusMap.bidding &&
       shipperRequest?.isBiddingApproved === true;
     if (!isApprovedBidding) return [];
   }
   ```
2. `findNearbyShippers` WHERE — add `bidding(21)` to the status list and gate on approval:

   ```sql
   AND ShipperRequest.journeyStatusId IN (?, ?, ?, ?)
   AND (
     ShipperRequest.journeyStatusId != ?
     OR ShipperRequest.isBiddingApproved = TRUE
   )
   ```

   Add `journeyStatusMap.bidding` to `values` and the extra non-equal param.

**Why:** Implements the plan's approval gate: unapproved bidding orders stay hidden from BOTH matching directions; approved ones flow through the existing matching engine (reusing `findNearbyDrivers`/`findNearbyShippers` instead of a separate discovery API).

**Verify no repetition:** The gate lives in exactly these two functions — a single place per direction. Confirm the `queueOrganizationUniqueId` batch alias (Task 6) is in the same SELECT so the driver-direction guard's in-memory object carries both `queueOrganizationUniqueId` and `isBiddingApproved`.

---

## Task 15 — `approveBidding` service: set flag + trigger matching

**File:** `Services/DriverBid.service.js` (create) — functions `approveBidding`, `getBidsForOrder`

**How:**

1. `approveBidding({ shipperRequestUniqueId, approved, userUniqueId })`:
   - Update `ShipperRequest SET isBiddingApproved = ?` for the order (shipper-auth check: must own the order, or be QueueOrgAdmin).
   - If `approved = true`, call the same matching routine the create-flow uses (distance-based `findNearbyDrivers`-driven `handleWaitingRequest` path) to create `JourneyDecisions` and notify drivers. Extract/reuse the existing `handleWaitingRequest` from create.service so the logic is not duplicated.
2. `getBidsForOrder({ shipperRequestUniqueId, userUniqueId })`: return base + bids for the order (auth: owner/admin).

**Why:** After approval, orders must surface to drivers — reusing the existing matching path (not a new engine) satisfies the plan's "no new discovery API" decision.

**Verify no repetition:** `grep -rn "handleWaitingRequest" Services/` → ensure `approveBidding` REUSES the imported function (no copy of the loop). Confirm no other `approveBidding` exists before creating.

---

## Task 16 — `create.service.js`: overflow detection (switch waiting→bidding)

**File:** `Services/ShipperRequest/create.service.js`

**How:** After the FIFO dispatch loop (lines 278-287), orders still at `waiting` because the queue was short → set `journeyStatusId = bidding(21)` and `isBiddingApproved = FALSE` (hidden), and notify the shipper/admin of overflow (socket, best-effort). Add the `queue_driver_bid` mode branch that creates SR rows at `bidding` + `isBiddingApproved = FALSE` and skips FIFO dispatch.

**Why:** Implements the plan's overflow flow: 10 orders / 3 drivers → 3 FIFO, 7 overflow to hidden bidding awaiting approval.

**Verify no repetition:** The introduced helper (e.g. `transitionToBidding`) is defined once and used by both the overflow branch and (if applicable) the `queue_driver_bid` branch. `grep -n "bidding\|isBiddingApproved" Services/ShipperRequest/create.service.js` → transition + flags set in one place.

---

## Task 17 — `handleJourneyStatusOne.service.js`: allow approved bidding loads in filter

**File:** `Services/DriverRequest/statusVerification/handleJourneyStatusOne.service.js`

**How:** Change the filter at lines 126-130 (`!p.queueOrganizationUniqueId`) to also allow approved bidding loads (defence-in-depth, mirroring `findNearbyShippers`):

```js
if (p.queueOrganizationUniqueId) {
  const approved =
    p.journeyStatusId === journeyStatusMap.bidding &&
    p.isBiddingApproved === true;
  if (!approved) return false;
}
// then existing requestMode != 'company_target' check
```

Note: `findNearbyShippers` (Task 14) already filters at SQL level; this is the in-memory belt-and-suspenders layer.

**Why:** Driver polling (status 1) must surface approved bidding loads while still hiding unapproved queue overflow.

**Verify no repetition:** `grep -n "queueOrganizationUniqueId" Services/DriverRequest/statusVerification/handleJourneyStatusOne.service.js` → line 129 filter only. The `p` objects come from `findNearbyShippers` which (Task 14) already returns `srb.queueOrganizationUniqueId` + `isBiddingApproved` — no new join needed here.

---

## Task 18 — `rescanPendingQueueOrder`: exclude bidding from FIFO rescan

**File:** `Services/DriverQueue.service.js` (with Task 10, same function)

**How:** Add to the WHERE (Task 10 already joins `srb`):

```sql
AND sr.journeyStatusId IN (?, ?)   -- waiting, requested ONLY — bidding(21) excluded
```

Change `journeyStatusMap.requested` list to exclude `bidding`; keep statuses `(waiting, requested)` (or add explicit `AND sr.journeyStatusId <> ?` with 21).

**Why:** Bidding orders are managed by the approval/matching flow, not FIFO rescan. Prevents re-offering hidden overflow.

**Verify no repetition:** This lives in the SAME `rescanPendingQueueOrder` Query edited in Task 10 — apply both edits in one pass (do not re-edit the function twice). `grep -n "journeyStatusId IN\|bidding" Services/DriverQueue.service.js` scoped to that function = once.

---

## Task 19 — Routes + Controller + MessageTypes

**Files:** `Routes/queue/DriverQueue.routes.js`, `Controllers/DriverQueue.controller.js`, `Utils/MessageTypes.js`

**How:**

1. Routes — add 2:
   ```js
   router.post(
     "/approve-bidding",
     auth,
     validate(approveBiddingSchema),
     driverBidController.approveBidding,
   );
   router.get(
     "/bids/:shipperRequestUniqueId",
     auth,
     driverBidController.getBidsForOrder,
   );
   ```
2. Controller — add `approveBidding`, `getBidsForOrder` wrappers (thin pass-through to `DriverBidService`).
3. `MessageTypes.js` — add the plan's 6 message types (e.g. `queue_overflow_bidding`, `queue_bidding_approved`, low-bid notification, etc.).

**Why:** Exposes the feature via API and enables real-time notifications.

**Verify no repetition:** `grep -rn "approve-bidding\|approveBidding\|getBidsForOrder" Routes/ Controllers/` → defined once each (route + controller). `MessageTypes` keys are unique.

---

## Task 20 — E2E tests (`E2ETests/Queue/QueueBid.js`)

**File:** `E2ETests/Queue/QueueBid.js` (create) + `E2ETests/Queue/QueueAdminOps.js` (optional ref to new flow)

**How:** Implement the 10 scenarios from the plan (TQ-B1..B10): create `queue_driver_bid` batch → status em set but a plain order isn't.

**Why:** Proves dispatch correctness AND the schema refactor end-to-end.

**Verify no repetition:** Check `E2ETests/Queue/` for an existing bidding test file before creating; if `QueueAdminOps.js` already covers TQ-37 dispatch, extend it only for the new status/approval assertions. `ls E2ETests/Queue/` to confirm no `QueueBid.js` already exists.

---

## Task 21 — Final global dedup / regression sweep

**How:**

```bash
grep -rn "queueOrganizationUniqueId" Services/ CRUD/ Controllers/ Database/Database.js | grep -iv "DriverQueue\|QueueOrganization\|dq\.queue\|QueueMembership\|QueueAudit\|Sbps"
```

Expect: matches ONLY where the field is batch-derived via `srb.queueOrganizationUniqueId` or `ShipperRequestBatch`, plus `DriverQueue`/`QueueOrganization` tables (their OWN FK columns stay). ZERO `ShipperRequest.queueOrganizationUniqueId` / `sr.queueOrganizationUniqueId` remain.

Run `node Services/Database/tableManage.service.js` (or the app's table-sync) twice → no errors on second run (idempotency).

Run the queue E2E suite (`E2ETests/Queue/`): FIFO dispatch, `rescanPendingQueueOrder`, readActive exclusion, company bid, and the new `QueueBid.js`.

**Why:** Verifies the entire "batch-only" model left no stale per-row references and the migration is idempotent.

**Verify no repetition:** The grep itself is the dedup check — every hit must be on a batch/queue-authoritative reference, never a duplicate `sr.queueOrganizationUniqueId`.
