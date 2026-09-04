# Queue Bidding System — Implementation Plan (FINAL — flag-only model)

> **Design decision (authoritative, updated):** Bidding is **not** a `requestMode` and **not** a
> journey status. It is a **batch-level boolean gate** — `ShipperRequestBatch.isBiddingApproved` —
> that tells the distance matchers whether a queue batch's orders are open. Orders keep their
> ordinary `journeyStatusId` (`waiting(1)`, etc.) and their original `requestMode` at all times.
>
> Rejected earlier ideas: a dedicated `queue_driver_bid` mode and a `bidding(21)` status were
> **redundant** with `isBiddingApproved` and have been dropped. Keep it flag-only.

## Overview

| Dispatch rail                | `requestMode`       | Who Gets It                       | Gate                              |
| ---------------------------- | ------------------- | --------------------------------- | --------------------------------- |
| **FIFO dispatch**            | `individual_target` | Front driver auto-offered         | `isBiddingApproved = FALSE` (def)  |
| **Company bid**              | `company_target`    | Companies bid (existing flow)     | —                                 |
| **Bidding board (distance)** | any non-company     | Drivers via distance, shipper picks | `isBiddingApproved = TRUE`        |

- **FALSE (default)** → normal FIFO queue order: FIFO-dispatchable, **never** distance-matched.
- **TRUE** (set only by `approveBidding`) → bidding board open: FIFO **skips** it; distance
  matching (`findNearbyDrivers`/`findNearbyShippers`) surfaces it to drivers.
- Bidding is **explicit only**: an order gets on the board when a shipper/queue-admin calls
  `approveBidding`. There is **no auto-overflow** at create time — an under-filled FIFO order just
  waits normally until someone opts it in.

---

## Schema (PER-ORDER flag; queue org stays batch-canonical)

- `ShipperRequest.requestMode ENUM('individual_target','company_target')` — no bidding mode.
- `ShipperRequestBatch.requestMode ENUM('individual_target','company_target')` — same.
- **`ShipperRequest.isBiddingApproved BOOLEAN NOT NULL DEFAULT FALSE`** — the **sole, per-order
  bidding signal**. Each order is independently opened to the bidding board, so orders within one
  batch can diverge (e.g. some hired via FIFO at status 3+, others opened to bidding).
  - Index: `idx_sr_bidding_approved (isBiddingApproved)`.
- `ShipperRequestBatch.queueOrganizationUniqueId` — still batch-canonical (DRY; rows inherit via
  join). The bidding flag is deliberately NOT batch-canonical because per-order is the required
  behavior.
- `DriverBid` table — one bid per driver per order (`UNIQUE(driverUserUniqueId, shipperRequestUniqueId)`).

**No `bidding` (21) journey status.** `journeyStatusMap` has no `bidding` entry; `biddingCount`
is not driven by status 21 (it counts `acceptedByDriver`, a pre-existing quirk).

---

## Approval Gate: `isBiddingApproved` (per-order)

| `isBiddingApproved` | Meaning                             | `findNearbyDrivers` / `findNearbyShippers` | FIFO rescan |
| ------------------- | ----------------------------------- | ------------------------------------------ | ----------- |
| `FALSE` (default)   | Normal FIFO queue order             | ❌ Excluded (queue orders aren't distance-matched) | ✅ Offered  |
| `TRUE`              | Order opened to bidding (approved)  | ✅ Finds drivers / loads                    | ❌ Skipped  |

**Worked example (7 orders, one batch):** 3 hired via FIFO → those rows advance to status 3+
(not re-matched). The other 4 remain `waiting(1)`. `approveBidding({ shipperRequestUniqueIds: [4 ids], approved: true })`
opens just those 4; the 3 hired orders are untouched. Per-order flag makes this trivially correct.

The order's `journeyStatusId` is its ordinary lifecycle value (`waiting(1)`, etc.); the matchers
**ignore** status for the queue gate and rely on the per-order flag alone.

---

## Two Matching Directions (all gate on the flag, not status)

### `findNearbyDrivers` — Shipper → Driver

Queue orders are excluded from distance matching **unless** `isBiddingApproved = TRUE`:

```js
if (shipperRequest?.queueOrganizationUniqueId) {
  if (!shipperRequest?.isBiddingApproved) {
    return [];
  }
  // Approved bidding order — fall through to distance matching.
}
```

### Bidding driver selection — queued-first, at most 5

When a bidding-board order (`queueOrganizationUniqueId` set + `isBiddingApproved = TRUE`) is
distance-matched, the selected drivers are **queued-first, then non-queued**:

- **Pool:** all nearby online drivers (queued AND non-queued), nearest within radius.
- **Priority:** queued drivers first — a driver is *queued* if they have an active `DriverQueue`
  entry today for the order's `queueOrganizationUniqueId` (`status IN ('waiting','requested','notagreed')`,
  `queueDeletedAt IS NULL`). Among queued, nearest wins; then non-queued, nearest wins.
- **Cap: ≤ 5 (maximum, not exact).** `5` is the max number of drivers offered per order, independent
  of the order's vehicle quantity (a 7-vehicle order still gets at most 5 bidding drivers, each
  bidding on that one order). If fewer than 5 eligible drivers exist, all of them are offered.
  Examples: 10 queued → take the 5 nearest queued (0 non-queued); 2 queued → those 2 + 3 nearest
  non-queued; 0 queued → 5 nearest non-queued; only 3 drivers nearby → 3 offered.

`handleWaitingRequest` later creates one `JourneyDecision` per selected driver, so the queued-first
set yields the first `JourneyDecision`s and notifications.

Non-queue orders (`queueOrganizationUniqueId` falsy) are unaffected — pure nearest-distance, ≤5.

### `findNearbyShippers` — Driver → Shipper

Queue orders stay out of driver-poll distance results unless **that order** is approved:

```sql
AND (
  srb.queueOrganizationUniqueId IS NULL
  OR ShipperRequest.isBiddingApproved = TRUE   -- per-order flag
)
AND ShipperRequest.journeyStatusId IN (?, ?, ?)  -- normal lifecycle statuses only
```

(`company_target` is already excluded by the `requestMode != 'company_target'` join clause, so
company deals never land on the individual bidding board.)

---

## Full Bidding Flow (explicit)

```
1. Shipper creates a queue batch (individual_target) → orders are normal FIFO, each isBiddingApproved=FALSE
2. FIFO can't fill some orders, or shipper wants those opened to bidding → shipper/SuperAdmin calls approveBidding
3. approveBidding sets isBiddingApproved=TRUE on JUST those order rows (per-order)
4. approveBidding then runs findNearbyDrivers → CREATE JourneyDecisions (distance matching) for still-waiting orders
   4a. Bidding driver selection: queued drivers of the order's queue org first, then non-queued; at most 5 (see rule)
5. findNearbyShippers → drivers see approved orders when they poll
6. Driver accepts → acceptShipperRequest → status 3 (unchanged)
7. Shipper accepts → acceptDriverRequest → status 4 + reject others (unchanged)
```

---

## What Changes

### 1. `Utils/ListOfSeedData.js`
- **Remove** `bidding: 21` from `journeyStatusMap` (not needed — flag-only).
- **Remove** the `bidding` seed `JourneyStatus` record and its entry in `activeJourneyStatuses`.

### 2. `Database/Database.js`
- Revert both `requestMode` ENUMs to `('individual_target','company_target')`.
- **Add** `ShipperRequest.isBiddingApproved BOOLEAN NOT NULL DEFAULT FALSE` + `idx_sr_bidding_approved` (per-order).
- **Remove** `ShipperRequestBatch.isBiddingApproved` + `idx_batch_bidding_approved` (flag moved to the rows).
- Keep `DriverBid` table; comments updated to per-order flag-only model.

### 3. `Validations/ShipperRequest.schema.js` + `Validations/ShipperRequestBatch.schema.js`
- Remove `queue_driver_bid` from both `requestMode` `.valid(...)` lists.
- Remove `"bidding"` from `VALID_JOURNEY_STATUS_NAMES`.
- `Validations/DriverBid.schema.js` — comment only.

### 4. `Services/ShipperRequest/create.service.js`
- **Revert** the `isQueueDriverBid`/`effectiveStatus` block (orders use the caller-supplied
  `journeyStatusId`; `upsertBatch` + `createNewShipperRequest` pass it directly).
- **Revert** the FIFO-overflow block (FIFO-unsatisfied orders simply stay waiting; no status flip,
  no auto-bidding). Revert the now-unused `currentDate` import.

### 5. `Services/DriverQueue.service.js` — `rescanPendingQueueOrder`
- Remove the dead `requestMode <> 'queue_driver_bid'` clause.
- Gate FIFO to **skip open bidding-board orders**: add `AND sr.isBiddingApproved = FALSE` — normal
  queue orders (default FALSE) stay FIFO-offered; approved (TRUE) orders are skipped (per-row).

### 6. `CRUD/Read/ReadData.matching.js`
- `findNearbyDrivers`: flag-only guard (return `[]` unless `isBiddingApproved`).
  - **Queued-first selection (bidding orders):** when `queueOrganizationUniqueId` is set + approved,
    order candidates by `isQueued DESC, distanceKm ASC` and cap at ≤ 5 — `isQueued` via an `EXISTS`
    on `DriverQueue` (join `VehicleDriver`) with `status IN ('waiting','requested','notagreed')` for
    that org today. Non-queue orders keep pure nearest-distance selection. (IMPLEMENTED.)
- `findNearbyShippers`: queue gate = flag only; drop the `journeyStatusId = bidding` clause/value.

### 7. `Services/DriverBid.service.js`
- `approveBidding({ shipperRequestUniqueIds: [], approved, user })`: loads the given order rows
  joined with their batch (queue org + shipper ownership), ownership-fences EACH row (batch shipper
  or SuperAdmin), then `UPDATE ShipperRequest SET isBiddingApproved = ? WHERE ... IN (...)`
  (single per-order UPDATE).
- On approve: run `handleWaitingRequest` per order that is STILL **waiting** (`journeyStatusId = waiting`),
  creating JourneyDecisions (distance matching).
- On hide: `isBiddingApproved = FALSE`.
- `getBidsForOrder`: unchanged (list `DriverBid` rows for an order).

### 8. `Services/DriverRequest/statusVerification/handleJourneyStatusOne.service.js`
- Filter allows a queue order through iff `isBiddingApproved === TRUE` (flag-only; no status check).

### 9. Routes / Controller / MessageTypes
- `Routes/queue/DriverQueue.routes.js`: 2 routes (`POST /bidding/approve`,
  `GET /bidding/order/:shipperRequestUniqueId/bids`) — comments reworded to flag-only.
- `Controllers/DriverQueue.controller.js`: 2 handlers — unchanged logic.
- `Utils/MessageTypes.js`: reword 3 bidding messages (drop `queue_driver_bid` phrasing).

### 10. E2E
- Skipped (per prior decision) — no `E2ETests/Queue/QueueBid.js`.

---

## API Endpoints (2 new)

```js
// POST /bidding/approve
// body: { shipperRequestUniqueIds: string[], approved?: boolean }
router.post("/bidding/approve", validator(approveBiddingSchema), controller.approveBidding);
router.get("/bidding/order/:shipperRequestUniqueId/bids", validator(getBidsParams,"params"), validator(getBidsQuery,"query"), controller.getBidsForOrder);
```

---

## Design Decisions (final)

1. **Flag-only** — `ShipperRequest.isBiddingApproved` is the sole bidding signal; no `queue_driver_bid`
   mode, no `bidding` status (both were redundant).
2. **Per-order** — the flag lives on each `ShipperRequest` row (NOT the batch), so orders within one
   batch can diverge (e.g. 3 hired via FIFO at status 3+, 4 opened to bidding). Deliberately not
   batch-canonical.
3. **Explicit opt-in** — only `approveBidding` opens a board; no auto-overflow at create.
4. **First-class default** — `FALSE` keeps an order a normal FIFO queue order (unchanged behavior).
5. **One bid per driver per order** — `UNIQUE(driverUserUniqueId, shipperRequestUniqueId)`.
6. **No change to accept/reject flow** — `acceptShipperRequest` / `acceptDriverRequest` unchanged.
7. **No new discovery API** — both matching functions extended (flag gate).
8. **Bidding driver cap is ≤ 5 (max, not exact)** — at most 5 drivers are distance-matched per order,
   independent of the order's vehicle quantity. Fewer if fewer eligible drivers exist.
9. **Queued-first priority for bidding orders** — for an in-queue bidding order, queued drivers
   (checked into the order's queue org today) are selected before non-queued, both nearest-first,
   filling up to the 5-slot cap. Only applies when `queueOrganizationUniqueId` is set; non-queue
   orders keep pure nearest-distance selection.
