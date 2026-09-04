# Queue Bidding System — Implementation Plan

## Overview

Three dispatch modes:

| Mode | `requestMode` | Price | Who Gets It |
|------|--------------|-------|-------------|
| **Non-bid (FIFO)** | `individual_target` | Fixed `shippingCost` | Front driver auto-offered |
| **Individual driver bid** | `queue_driver_bid` | Base price + driver counter | All eligible drivers bid, shipper picks |
| **Company bid** | `company_target` | Companies bid | Existing company bid flow |

---

## Approval Gate: `isBiddingApproved`

### Schema Change

```sql
ALTER TABLE ShipperRequest
ADD COLUMN isBiddingApproved BOOLEAN NOT NULL DEFAULT FALSE
AFTER isCompletionSeen;
```

### How It Works

| `journeyStatusId` | `isBiddingApproved` | `findNearbyDrivers`? | `findNearbyShippers`? |
|---|---|---|---|
| 1 (waiting) | any | ✅ Finds drivers | ✅ Finds loads |
| 2 (requested) | any | Already matched | Already matched |
| 3 (acceptedByDriver) | any | Already matched | Already matched |
| **21 (bidding)** | **FALSE** | **❌ Excluded** | **❌ Excluded** |
| **21 (bidding)** | **TRUE** | **✅ Finds drivers** | **✅ Finds loads** |

### How Shippers/Queue Admins Know They Have Overflow

**Query for pending overflow orders (need approval):**
```sql
SELECT * FROM ShipperRequest 
WHERE queueOrganizationUniqueId = ? 
  AND journeyStatusId = 21 
  AND isBiddingApproved = FALSE
```

| Column | Value | Meaning |
|--------|-------|---------|
| `journeyStatusId` | `21` (bidding) | Order is in bidding mode (overflow from FIFO) |
| `isBiddingApproved` | `FALSE` | Needs approval before drivers can see them |

**After approval:** `isBiddingApproved = TRUE` → `findNearbyDrivers` finds drivers → JourneyDecisions created.

---

## Two Matching Directions

### `findNearbyDrivers` — Shipper → Driver

Finds drivers near order origin. Used when order is **created** or **opened for drivers**.

**Current:** Excludes ALL queue orders:
```js
if (shipperRequest?.queueOrganizationUniqueId) {
  return [];
}
```

**New:** Allow approved bidding orders:
```js
if (shipperRequest?.queueOrganizationUniqueId) {
  if (shipperRequest?.journeyStatusId === journeyStatusMap.bidding 
      && shipperRequest?.isBiddingApproved) {
    // Approved bidding — fall through to distance matching
  } else {
    return [];
  }
}
```

### `findNearbyShippers` — Driver → Shipper

Finds loads near driver location. Used when driver **polls status**.

**Current SQL:**
```sql
AND ShipperRequest.journeyStatusId IN (?, ?, ?)
```

**New SQL:**
```sql
AND ShipperRequest.journeyStatusId IN (?, ?, ?, ?)
AND (
  ShipperRequest.journeyStatusId != ?
  OR ShipperRequest.isBiddingApproved = TRUE
)
```

---

## Full Bidding Flow

```
1. Shipper creates 10 orders → 3 dispatched via FIFO, 7 overflow
2. Overflow → status 21, isBiddingApproved = FALSE (HIDDEN)
3. Shipper/admin sees overflow: journeyStatusId=21 AND isBiddingApproved=FALSE
4. Shipper/admin approves → isBiddingApproved = TRUE
5. findNearbyDrivers → finds drivers → CREATE JourneyDecisions
6. findNearbyShippers → drivers see approved loads
7. Driver accepts → acceptShipperRequest → status 3
8. Shipper accepts → acceptDriverRequest → status 4 + reject others (14)
```

---

## What Changes

### 1. `Utils/ListOfSeedData.js` — Add `bidding: 21` to journeyStatusMap

**Current (up to 20):**
```js
const journeyStatusMap = {
  waiting: 1,
  requested: 2,
  acceptedByDriver: 3,
  acceptedByShipper: 4,
  goToLoadingPlace: 5,
  loading: 6,
  loaded: 7,
  journeyStarted: 8,
  journeyCompleted: 9,
  cancelledByShipper: 10,
  rejectedByShipper: 11,
  cancelledByDriver: 12,
  cancelledByAdmin: 13,
  completedByAdmin: 14,
  cancelledBySystem: 15,
  noAnswerFromDriver: 16,
  notSelectedInBid: 17,
  rejectedByDriver: 18,
  replacedByCompanyAssignment: 19,
  partiallyCancelled: 20,
};
```

**New (add after 20):**
```js
  bidding: 21,  // overflow orders open for driver bidding
```

### 2. `findNearbyDrivers` — Allow approved bidding orders
### 3. `findNearbyShippers` — Add bidding (21) + approval check
### 4. `approveBidding` — Trigger matching after approval
### 5. `handleJourneyStatusOne` — Allow approved bidding orders in filter
### 6. `create.service.js` — Overflow detection
### 7. `rescanPendingQueueOrder` — Exclude bidding from FIFO rescan

---

## What Does NOT Change

| Component | Status |
|-----------|--------|
| `acceptShipperRequest` | **Unchanged** |
| `acceptDriverRequest` | **Unchanged** |
| `handleQueueDispatch` | **Unchanged** |
| `offerToDriver` | **Unchanged** |

---

## Phase 1: Database Schema

### 1a. Add `queueOrganizationUniqueId` to `ShipperRequestBatch`
### 1b. Extend `requestMode` ENUM (add `queue_driver_bid`)
### 1c. Add `bidding` status (ID 21) to `Utils/ListOfSeedData.js`
### 1d. Add `isBiddingApproved` to `ShipperRequest`
### 1e. Create `DriverBid` table

---

## Phase 2: Validation Updates

Add `queue_driver_bid` to `requestMode` ENUM.

---

## Phase 3: Service Changes

### 3a. `create.service.js` — Overflow detection
### 3b. `findNearbyDrivers` — Allow approved bidding orders
### 3c. `findNearbyShippers` — Add bidding (21) + approval check
### 3d. `approveBidding` — Trigger matching after approval
### 3e. `handleJourneyStatusOne` — Allow approved bidding orders in filter
### 3f. `rescanPendingQueueOrder` — Exclude bidding from FIFO rescan
### 3g. New: `Services/DriverBid.service.js` — approveBidding, getBidsForOrder

---

## Phase 4: API Endpoints

```js
// Only 2 new routes:
router.post("/approve-bidding", auth, validate(approveBiddingSchema), driverBidController.approveBidding);
router.get("/bids/:shipperRequestUniqueId", auth, driverBidController.getBidsForOrder);
```

---

## Phase 7: E2E Tests

| Test | Description |
|------|-------------|
| TQ-B1 | Shipper creates `queue_driver_bid` batch → status 21, isBiddingApproved=FALSE |
| TQ-B2 | Shipper approves → isBiddingApproved=TRUE → findNearbyDrivers finds drivers → JourneyDecisions |
| TQ-B3 | Driver polls status → findNearbyShippers finds approved load |
| TQ-B4 | Driver accepts via acceptShipperRequest → status 3 |
| TQ-B5 | Shipper accepts via acceptDriverRequest → status 4, others status 14 |
| TQ-B6 | UN-approved bidding order → not found |
| TQ-B7 | **Overflow: 10 orders, 3 FIFO, 7 enter bidding** |
| TQ-B8 | **Shipper approves → matching engine finds drivers** |
| TQ-B9 | **Multiple drivers match → shipper picks one** |
| TQ-B10 | **Shipper accepts via acceptDriverRequest → status 4** |

---

## Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `Utils/ListOfSeedData.js` | Modify | **Add `bidding: 21` to journeyStatusMap** |
| `Database/Database.js` | Modify | isBiddingApproved, queueOrganizationUniqueId to Batch, DriverBid table |
| `Validations/ShipperRequest.schema.js` | Modify | Add `queue_driver_bid` to ENUM |
| `Validations/DriverBid.schema.js` | Create | approveBiddingSchema |
| `Services/ShipperRequest/create.service.js` | Modify | queue_driver_bid mode, overflow detection |
| `CRUD/Read/ReadData.matching.js` | Modify | **findNearbyDrivers + findNearbyShippers** |
| `Services/DriverRequest/statusVerification/handleJourneyStatusOne.service.js` | Modify | Allow approved bidding orders |
| `Services/DriverQueue.service.js` | Modify | Exclude bidding from FIFO rescan |
| `Services/DriverBid.service.js` | Create | approveBidding (triggers matching), getBidsForOrder |
| `Routes/queue/DriverQueue.routes.js` | Modify | 2 new routes |
| `Controllers/DriverQueue.controller.js` | Modify | 2 controllers |
| `Utils/MessageTypes.js` | Modify | 6 new message types |
| `E2ETests/Queue/QueueBid.js` | Create | 10 test scenarios |

---

## Design Decisions

1. **One mode per batch** — each batch has ONE `requestMode`.
2. **All eligible drivers can bid** — active VehicleDriver assignment required.
3. **Shipper sets base price** — `shippingCost` is the reference.
4. **One bid per driver per order** — upsert.
5. **Bidding status (21)** — added to `journeyStatusMap` in `Utils/ListOfSeedData.js`.
6. **No auto-dispatch for bid orders** — skip FIFO.
7. **Overflow-triggered bidding** — FIFO can't fill → switch to bidding (21).
8. **Approval gate (`isBiddingApproved`)** — hidden until shipper/admin approves. Query: `journeyStatusId=21 AND isBiddingApproved=FALSE`.
9. **`findNearbyDrivers` = Shipper→Driver** — finds drivers when order created/opened.
10. **`findNearbyShippers` = Driver→Shipper** — finds loads when driver polls status.
11. **No changes to accept/reject flow** — unchanged.
12. **No new discovery API** — both matching functions extended.
