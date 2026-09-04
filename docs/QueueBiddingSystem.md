# Queue Bidding System — Implementation Plan

## Overview

This system adds **driver bidding** as both a standalone dispatch mode and an **overflow mechanism** when the FIFO queue can't fill all orders.

### Dispatch Modes

| Mode | `requestMode` | Price | Who Gets It |
|------|--------------|-------|-------------|
| **Non-bid (FIFO)** | `individual_target` | Fixed `shippingCost` | Front driver auto-offered |
| **Individual driver bid** | `queue_driver_bid` | Base price + driver counter | All eligible drivers bid, shipper picks |
| **Company bid** | `company_target` | Companies bid | Existing company bid flow |

### Hybrid Flow: FIFO + Overflow Bidding

When a shipper creates N orders against a queue organization with fewer drivers than orders:

```
Shipper creates 10 orders (queueOrganizationUniqueId set)
    │
    ▼
FIFO dispatch (existing): orders offered to front queue drivers
    │
    ├─ Order 1 → D1 (pos1) → requested
    ├─ Order 2 → D2 (pos2) → requested
    ├─ Order 3 → D3 (pos3) → requested
    │
    ▼
Overflow detection: orders 4-10 still waiting
    │
    ├─ Switch remaining orders to status 21 (bidding)
    ├─ Notify shipper/admin that orders are open for bidding
    │
    ▼
Bidding phase: ANY eligible driver can bid (queue OR non-queue)
    │
    ├─ Queue drivers see biddable orders in their queue app
    ├─ Non-queue drivers see biddable orders via GET /api/queue/biddable-orders
    ├─ Each driver submits one bid per order (price + optional notes)
    │
    ▼
Shipper/admin reviews bids → accepts best bid per order
    │
    ├─ Winning driver: JourneyDecision created, status → acceptedByShipper
    ├─ Losing drivers: bids rejected, notified via socket
    └─ Order proceeds through normal journey lifecycle
```

**Key behaviors:**
- FIFO is always tried first — queue drivers get priority
- Overflow bidding activates automatically when FIFO can't fill all orders
- Non-queue drivers can bid on overflow orders (no queue check-in required)
- Shipper or queue org admin approves the winning bid
- One bid per driver per order (drivers can update their bid)
- Shipper's `shippingCost` serves as the base/reference price

---

## Phase 1: Database Schema Changes

**File:** `Database/Database.js`

### 1a. Add `queueOrganizationUniqueId` to `ShipperRequestBatch`

```sql
ALTER TABLE ShipperRequestBatch 
ADD COLUMN queueOrganizationUniqueId VARCHAR(36) NULL DEFAULT NULL
AFTER targetCompanyUniqueId;
```

Add index and FK:
```sql
ALTER TABLE ShipperRequestBatch
ADD INDEX idx_batch_queue_org (queueOrganizationUniqueId),
ADD CONSTRAINT fk_batch_queue_org FOREIGN KEY (queueOrganizationUniqueId) 
  REFERENCES QueueOrganization(queueOrganizationUniqueId);
```

### 1b. Extend `requestMode` ENUM

```sql
ALTER TABLE ShipperRequestBatch
MODIFY COLUMN requestMode ENUM('individual_target', 'company_target', 'queue_driver_bid') 
NOT NULL DEFAULT 'individual_target';

ALTER TABLE ShipperRequest
MODIFY COLUMN requestMode ENUM('individual_target', 'company_target', 'queue_driver_bid') 
NOT NULL DEFAULT 'individual_target';
```

### 1c. Add `bidding` status (ID 21)

In `Utils/ListOfSeedData.js` journeyStatusMap:
```js
bidding: 21,
```

Add to JourneyStatus seed data:
```sql
INSERT INTO JourneyStatus (journeyStatusId, journeyStatus) 
VALUES (21, 'bidding') 
ON DUPLICATE KEY UPDATE journeyStatus = 'bidding';
```

### 1d. Create `DriverBid` table

```sql
CREATE TABLE IF NOT EXISTS DriverBid (
    driverBidId INT AUTO_INCREMENT PRIMARY KEY,
    driverBidUniqueId VARCHAR(36) UNIQUE NOT NULL,

    -- The order being bid on
    shipperRequestUniqueId VARCHAR(36) NOT NULL,

    -- Who is bidding
    driverUserUniqueId VARCHAR(36) NOT NULL,

    -- Bid terms
    basePrice DECIMAL(10,2) NOT NULL,        -- snapshot of shipper's base price
    bidPrice DECIMAL(10,2) NOT NULL,          -- driver's proposed price (above or below base)
    bidNotes TEXT NULL,

    -- Bid lifecycle
    bidStatus ENUM(
        'pending',
        'accepted_by_shipper',
        'rejected_by_shipper',
        'withdrawn_by_driver',
        'expired'
    ) NOT NULL DEFAULT 'pending',
    bidStatusUpdatedAt DATETIME NULL,
    bidStatusUpdatedBy VARCHAR(36) NULL,

    -- Queue vs non-queue bidder tracking
    isNonQueueDriver BOOLEAN NOT NULL DEFAULT FALSE,

    -- Timestamps
    driverBidCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    driverBidUpdatedAt DATETIME NULL,
    driverBidDeletedAt DATETIME NULL,

    -- One bid per driver per order
    UNIQUE KEY uq_driver_sr_bid (shipperRequestUniqueId, driverUserUniqueId),
    INDEX idx_driverBid_sr (shipperRequestUniqueId),
    INDEX idx_driverBid_driver (driverUserUniqueId),
    INDEX idx_driverBid_status (bidStatus),
    FOREIGN KEY (shipperRequestUniqueId) REFERENCES ShipperRequest(shipperRequestUniqueId),
    FOREIGN KEY (driverUserUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (bidStatusUpdatedBy) REFERENCES Users(userUniqueId)
);
```

---

## Phase 2: Schema Validation Updates

**File:** `Validations/ShipperRequest.schema.js`

Add `queue_driver_bid` to allowed `requestMode` values:
```js
requestMode: Joi.string()
  .valid("individual_target", "company_target", "queue_driver_bid")
  .default("individual_target")
  .optional(),
```

**New validation file:** `Validations/DriverBid.schema.js`
```js
const Joi = require("joi");

const submitDriverBidSchema = Joi.object({
  shipperRequestUniqueId: Joi.string().uuid().required(),
  bidPrice: Joi.number().positive().required(),
  bidNotes: Joi.string().max(500).optional(),
});

const acceptDriverBidSchema = Joi.object({
  driverBidUniqueId: Joi.string().uuid().required(),
  shipperRequestUniqueId: Joi.string().uuid().required(),
});

module.exports = { submitDriverBidSchema, acceptDriverBidSchema };
```

---

## Phase 3: Service Layer Changes

### 3a. `create.service.js` — Handle `queue_driver_bid` mode + overflow detection

**File:** `Services/ShipperRequest/create.service.js`

**Change 1:** After the batch header is created, add `queueOrganizationUniqueId` to batch insert:

```js
// In the upsertBatch call, include:
queueOrganizationUniqueId: body.queueOrganizationUniqueId || null,
```

**Change 2:** Replace the hard `company_target` early return with a conditional:

```js
const isCompanyTarget = (body.requestMode || "individual_target") === "company_target";
const isQueueDriverBid = (body.requestMode || "individual_target") === "queue_driver_bid";

// company_target: defer SR rows, return early (unchanged behavior)
if (isCompanyTarget) {
  logger.info("company_target batch created (SR rows deferred)", {
    shipperRequestBatchUniqueId,
  });
  return await verifyShipperStatus({ userUniqueId });
}

// queue_driver_bid: create SR rows with status = bidding(21), skip FIFO dispatch
if (isQueueDriverBid) {
  // Create SR rows with journeyStatusId = 21 (bidding)
  // Skip handleQueueDispatch — drivers will bid instead
  logger.info("queue_driver_bid batch created, awaiting driver bids", {
    shipperRequestBatchUniqueId,
    queueOrganizationUniqueId: body.queueOrganizationUniqueId,
  });
  return await verifyShipperStatus({ userUniqueId });
}
```

**Change 3:** In the queueRequests filter, exclude `queue_driver_bid` from FIFO dispatch:

```js
const queueRequests = waitingRequests.filter(
  (req) =>
    req?.queueOrganizationUniqueId && req?.requestMode !== "queue_driver_bid",
);
```

Add a third bucket for bidding orders:

```js
const biddingRequests = waitingRequests.filter(
  (req) =>
    req?.queueOrganizationUniqueId && req?.requestMode === "queue_driver_bid",
);
// biddingRequests stay at status 21 — no auto-dispatch
// Drivers see them via GET /api/queue/biddable-orders and submit bids
```

**Change 4 (NEW — Overflow Detection):** After the FIFO dispatch loop, detect and switch overflow orders to bidding:

```js
// ── OVERFLOW DETECTION ──────────────────────────────────────────────
// After FIFO dispatch loop completes for queue requests, some orders may
// still be `waiting` because the queue didn't have enough drivers.
// Switch these overflow orders to bidding status (21) so any eligible
// driver (queue OR non-queue) can bid on them.
if (queueRequests.length > 0) {
  const overflowOrders = queueRequests.filter(
    (req) => req.journeyStatusId === journeyStatusMap.waiting,
  );

  if (overflowOrders.length > 0) {
    logger.info("Queue overflow detected — switching to bidding mode", {
      overflowCount: overflowOrders.length,
      totalQueueOrders: queueRequests.length,
      queueOrganizationUniqueId: body.queueOrganizationUniqueId,
    });

    for (const order of overflowOrders) {
      await updateData({
        tableName: "ShipperRequest",
        updateValues: {
          journeyStatusId: journeyStatusMap.bidding,
          shipperRequestUpdatedAt: currentDate(),
          shipperRequestUpdatedBy: userUniqueId,
        },
        conditions: { shipperRequestUniqueId: order.shipperRequestUniqueId },
      });
    }

    // Notify shipper/admin that overflow orders are open for bidding
    // Best-effort socket notification
    try {
      await notifyShipperOfQueueEvent({
        executor,
        shipperRequestUniqueId: overflowOrders[0].shipperRequestUniqueId,
        messageType: "queue_overflow_bidding",
        message: `${overflowOrders.length} orders entered bidding — queue is saturated`,
        data: {
          overflowCount: overflowOrders.length,
          queueOrganizationUniqueId: body.queueOrganizationUniqueId,
        },
      });
    } catch (notifyErr) {
      logger.error("Overflow bidding notification failed", {
        error: notifyErr.message,
      });
    }
  }
}
```

### 3b. New service: `Services/DriverBid.service.js`

```js
"use strict";

const { pool } = require("../Middleware/Database.config");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");
const { emitToSpecificUser } = require("../Utils/QueueSocket");
const messageTypes = require("../Utils/MessageTypes");
const logger = require("../Utils/logger");
const AppError = require("../Utils/AppError");
const { v4: uuidv4 } = require("uuid");
const { today } = require("../Utils/DateUtils");

/**
 * submitBid — Driver submits a bid on a biddable order.
 * 
 * KEY CHANGE: Non-queue drivers can bid. The only requirements are:
 * 1. The order exists and is in bidding status (21)
 * 2. The driver has an active VehicleDriver assignment
 * 3. One bid per driver per order (upsert)
 * 
 * The isNonQueueDriver flag is set automatically based on whether the
 * driver has an active queue entry for this org.
 */
const submitBid = async ({ shipperRequestUniqueId, driverUserUniqueId, bidPrice, bidNotes }) => {
  return await executeInTransaction(async () => {
    // 1. Verify the order exists and is in bidding status
    const [orderRows] = await pool.query(
      `SELECT sr.shipperRequestUniqueId, sr.shippingCost, sr.journeyStatusId,
              sr.queueOrganizationUniqueId, sr.requestMode, sr.vehicleTypeUniqueId
       FROM ShipperRequest sr
       WHERE sr.shipperRequestUniqueId = ?
         AND sr.shipperRequestDeletedAt IS NULL`,
      [shipperRequestUniqueId],
    );

    if (!orderRows.length) throw new AppError("Order not found", AppError.NOT_FOUND);

    const order = orderRows[0];
    if (order.journeyStatusId !== journeyStatusMap.bidding) {
      throw new AppError("Bidding is closed for this order", AppError.BAD_REQUEST);
    }

    // 2. Verify driver has an active VehicleDriver assignment (any driver, queue or not)
    const [vdRows] = await pool.query(
      `SELECT vd.vehicleDriverUniqueId
       FROM VehicleDriver vd
       WHERE vd.driverUserUniqueId = ?
         AND vd.assignmentStatus = 'active'
         AND vd.vehicleDriverDeletedAt IS NULL
       LIMIT 1`,
      [driverUserUniqueId],
    );
    if (!vdRows.length) {
      throw new AppError("No active vehicle assignment found", AppError.BAD_REQUEST);
    }

    // 3. Determine if driver is in queue for this org (sets isNonQueueDriver flag)
    let isNonQueueDriver = true;
    if (order.queueOrganizationUniqueId) {
      const [queueCheck] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM DriverQueue dq
         JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
         WHERE dq.driverUserUniqueId = ?
           AND dq.queueOrganizationUniqueId = ?
           AND dq.status IN ('waiting','requested','notagreed')
           AND dq.queueDate = ?
           AND dq.queueDeletedAt IS NULL`,
        [driverUserUniqueId, order.queueOrganizationUniqueId, today()],
      );
      isNonQueueDriver = queueCheck[0].cnt === 0;
    }

    // 4. Upsert the bid (one bid per driver per order)
    const driverBidUniqueId = uuidv4();
    const [existing] = await pool.query(
      `SELECT driverBidUniqueId FROM DriverBid
       WHERE shipperRequestUniqueId = ? AND driverUserUniqueId = ? AND driverBidDeletedAt IS NULL`,
      [shipperRequestUniqueId, driverUserUniqueId],
    );

    if (existing.length) {
      await pool.query(
        `UPDATE DriverBid SET bidPrice = ?, bidNotes = ?, isNonQueueDriver = ?, driverBidUpdatedAt = NOW()
         WHERE shipperRequestUniqueId = ? AND driverUserUniqueId = ? AND driverBidDeletedAt IS NULL`,
        [bidPrice, bidNotes || null, isNonQueueDriver, shipperRequestUniqueId, driverUserUniqueId],
      );
      return { action: "updated", driverBidUniqueId: existing[0].driverBidUniqueId, isNonQueueDriver };
    }

    await pool.query(
      `INSERT INTO DriverBid 
       (driverBidUniqueId, shipperRequestUniqueId, driverUserUniqueId, basePrice, bidPrice, bidNotes, isNonQueueDriver)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [driverBidUniqueId, shipperRequestUniqueId, driverUserUniqueId, order.shippingCost, bidPrice, bidNotes || null, isNonQueueDriver],
    );

    // 5. Notify shipper that a bid was placed
    const [shipperRow] = await pool.query(
      `SELECT sr.userUniqueId FROM ShipperRequest sr WHERE sr.shipperRequestUniqueId = ?`,
      [shipperRequestUniqueId],
    );
    if (shipperRow.length) {
      emitToSpecificUser({
        userUniqueId: shipperRow[0].userUniqueId,
        message: {
          messageTypes: messageTypes.queue_driver_bid_placed,
          driverBidUniqueId,
          shipperRequestUniqueId,
          bidPrice,
          basePrice: order.shippingCost,
          isNonQueueDriver,
        },
      });
    }

    return { action: "created", driverBidUniqueId, isNonQueueDriver };
  });
};

/**
 * getBidsForOrder — Shipper views all bids on a specific order.
 * Shows both queue and non-queue bids with the isNonQueueDriver flag.
 */
const getBidsForOrder = async ({ shipperRequestUniqueId, userUniqueId }) => {
  const [order] = await pool.query(
    `SELECT sr.userUniqueId, sr.shippingCost, sr.requestMode, sr.journeyStatusId
     FROM ShipperRequest sr WHERE sr.shipperRequestUniqueId = ? AND sr.shipperRequestDeletedAt IS NULL`,
    [shipperRequestUniqueId],
  );
  if (!order.length) throw new AppError("Order not found", AppError.NOT_FOUND);
  if (order[0].userUniqueId !== userUniqueId) throw new AppError("Not your order", AppError.FORBIDDEN);

  const [bids] = await pool.query(
    `SELECT db.driverBidUniqueId, db.bidPrice, db.basePrice, db.bidNotes, db.bidStatus,
            db.isNonQueueDriver, db.driverBidCreatedAt, db.driverUserUniqueId, u.phoneNumber
     FROM DriverBid db
     JOIN Users u ON db.driverUserUniqueId = u.userUniqueId
     WHERE db.shipperRequestUniqueId = ? AND db.driverBidDeletedAt IS NULL
     ORDER BY db.bidPrice ASC`,
    [shipperRequestUniqueId],
  );

  return {
    basePrice: order[0].shippingCost,
    journeyStatusId: order[0].journeyStatusId,
    bids,
  };
};

/**
 * acceptBid — Shipper accepts a driver's bid. Rejects all others.
 * Works for both queue and non-queue driver bids.
 */
const acceptBid = async ({ driverBidUniqueId, shipperRequestUniqueId, userUniqueId }) => {
  return await executeInTransaction(async () => {
    const [order] = await pool.query(
      `SELECT sr.userUniqueId, sr.journeyStatusId, sr.queueOrganizationUniqueId
       FROM ShipperRequest sr WHERE sr.shipperRequestUniqueId = ? AND sr.shipperRequestDeletedAt IS NULL`,
      [shipperRequestUniqueId],
    );
    if (!order.length) throw new AppError("Order not found", AppError.NOT_FOUND);
    if (order[0].userUniqueId !== userUniqueId) throw new AppError("Not your order", AppError.FORBIDDEN);
    if (order[0].journeyStatusId !== journeyStatusMap.bidding) {
      throw new AppError("Bidding is closed for this order", AppError.BAD_REQUEST);
    }

    const [bid] = await pool.query(
      `SELECT db.driverBidUniqueId, db.driverUserUniqueId, db.bidPrice, db.isNonQueueDriver
       FROM DriverBid db
       WHERE db.driverBidUniqueId = ? AND db.shipperRequestUniqueId = ? 
         AND db.bidStatus = 'pending' AND db.driverBidDeletedAt IS NULL`,
      [driverBidUniqueId, shipperRequestUniqueId],
    );
    if (!bid.length) throw new AppError("Bid not found or already processed", AppError.NOT_FOUND);

    // Accept winning bid
    await pool.query(
      `UPDATE DriverBid SET bidStatus = 'accepted_by_shipper', bidStatusUpdatedAt = NOW(),
              bidStatusUpdatedBy = ?
       WHERE driverBidUniqueId = ?`,
      [userUniqueId, driverBidUniqueId],
    );

    // Reject all other pending bids
    await pool.query(
      `UPDATE DriverBid SET bidStatus = 'rejected_by_shipper', bidStatusUpdatedAt = NOW(),
              bidStatusUpdatedBy = ?
       WHERE shipperRequestUniqueId = ? AND driverBidUniqueId != ? 
         AND bidStatus = 'pending'`,
      [userUniqueId, shipperRequestUniqueId, driverBidUniqueId],
    );

    // Create JourneyDecision for the winning driver
    const driverBid = bid[0];
    const journeyDecisionUniqueId = uuidv4();
    await pool.query(
      `INSERT INTO JourneyDecisions
       (journeyDecisionUniqueId, shipperRequestUniqueId, journeyStatusId, decisionBy, shippingCostByDriver)
       VALUES (?, ?, ?, 'queue', ?)`,
      [journeyDecisionUniqueId, shipperRequestUniqueId, journeyStatusMap.acceptedByShipper, driverBid.bidPrice],
    );

    // Update SR status
    await pool.query(
      `UPDATE ShipperRequest SET journeyStatusId = ? WHERE shipperRequestUniqueId = ?`,
      [journeyStatusMap.acceptedByShipper, shipperRequestUniqueId],
    );

    // Notify winning driver
    const [driverUser] = await pool.query(
      `SELECT u.phoneNumber FROM Users u WHERE u.userUniqueId = ?`,
      [driverBid.driverUserUniqueId],
    );
    if (driverUser.length) {
      emitToSpecificUser({
        userUniqueId: driverBid.driverUserUniqueId,
        message: {
          messageTypes: messageTypes.queue_driver_bid_accepted,
          shipperRequestUniqueId,
          bidPrice: driverBid.bidPrice,
          isNonQueueDriver: driverBid.isNonQueueDriver,
        },
      });
    }

    // Notify losing drivers
    const [losers] = await pool.query(
      `SELECT db.driverUserUniqueId FROM DriverBid db
       WHERE db.shipperRequestUniqueId = ? AND db.driverBidUniqueId != ? 
         AND db.bidStatus = 'rejected_by_shipper'`,
      [shipperRequestUniqueId, driverBidUniqueId],
    );
    for (const loser of losers) {
      emitToSpecificUser({
        userUniqueId: loser.driverUserUniqueId,
        message: {
          messageTypes: messageTypes.queue_driver_bid_rejected,
          shipperRequestUniqueId,
        },
      });
    }

    return { message: "Bid accepted", journeyDecisionUniqueId, isNonQueueDriver: driverBid.isNonQueueDriver };
  });
};

module.exports = { submitBid, getBidsForOrder, acceptBid };
```

### 3c. `DriverQueue.service.js` — Add biddable orders endpoint

```js
/**
 * getBiddableOrders — Returns orders in bidding status for a queue + vehicle type.
 * Both queue and non-queue drivers use this to see which orders they can bid on.
 * @param {string} queueOrganizationUniqueId
 * @param {string} vehicleTypeUniqueId
 * @returns {Object} Array of orders open for bidding with bid counts
 */
const getBiddableOrders = async ({ queueOrganizationUniqueId, vehicleTypeUniqueId }) => {
  const [orders] = await db().query(
    `SELECT sr.shipperRequestUniqueId, sr.shippingCost, sr.originPlace, 
            sr.destinationPlace, sr.shippingDate, sr.deliveryDate,
            sr.shippableItemName, sr.shippableItemQtyInQuintal,
            (SELECT COUNT(*) FROM DriverBid db 
             WHERE db.shipperRequestUniqueId = sr.shipperRequestUniqueId 
               AND db.driverBidDeletedAt IS NULL) AS bidCount
     FROM ShipperRequest sr
     WHERE sr.queueOrganizationUniqueId = ?
       AND sr.vehicleTypeUniqueId = ?
       AND sr.journeyStatusId = 21
       AND sr.shipperRequestDeletedAt IS NULL
     ORDER BY sr.shipperRequestCreatedAt ASC`,
    [queueOrganizationUniqueId, vehicleTypeUniqueId],
  );
  return orders;
};
```

### 3d. `rescanPendingQueueOrder` — Handle bidding orders

**File:** `Services/DriverQueue.service.js`, line 2362

Update the filter to exclude bidding orders from FIFO rescan:

```sql
AND sr.requestMode NOT IN ('company_target')
AND sr.journeyStatusId IN (?, ?)  -- waiting, requested
-- bidding (21) orders are handled by the bid system, not FIFO rescan
```

---

## Phase 4: API Endpoints

**File:** `Routes/queue/DriverQueue.routes.js`

Add new routes:

```js
// Driver bids on a queue order (queue or non-queue drivers)
router.post(
  "/driver-bid",
  auth,
  validate(submitDriverBidSchema),
  driverBidController.submitBid,
);

// Shipper views bids on their order
router.get(
  "/bids/:shipperRequestUniqueId",
  auth,
  driverBidController.getBidsForOrder,
);

// Shipper accepts a bid
router.patch(
  "/bids/accept",
  auth,
  validate(acceptDriverBidSchema),
  driverBidController.acceptBid,
);

// Driver sees biddable orders (queue or non-queue drivers)
router.get(
  "/biddable-orders/:queueOrganizationUniqueId/:vehicleTypeUniqueId",
  auth,
  driverBidController.getBiddableOrders,
);
```

**File:** `Controllers/DriverQueue.controller.js`

Add controller functions:

```js
exports.submitBid = async (req, res) => {
  const result = await DriverBidService.submitBid({
    shipperRequestUniqueId: req.body.shipperRequestUniqueId,
    driverUserUniqueId: req.user.userUniqueId,
    bidPrice: req.body.bidPrice,
    bidNotes: req.body.bidNotes,
  });
  res.json({ success: true, data: result });
};

exports.getBidsForOrder = async (req, res) => {
  const result = await DriverBidService.getBidsForOrder({
    shipperRequestUniqueId: req.params.shipperRequestUniqueId,
    userUniqueId: req.user.userUniqueId,
  });
  res.json({ success: true, data: result });
};

exports.acceptBid = async (req, res) => {
  const result = await DriverBidService.acceptBid({
    driverBidUniqueId: req.body.driverBidUniqueId,
    shipperRequestUniqueId: req.body.shipperRequestUniqueId,
    userUniqueId: req.user.userUniqueId,
  });
  res.json({ success: true, data: result });
};

exports.getBiddableOrders = async (req, res) => {
  const result = await DriverQueueService.getBiddableOrders({
    queueOrganizationUniqueId: req.params.queueOrganizationUniqueId,
    vehicleTypeUniqueId: req.params.vehicleTypeUniqueId,
  });
  res.json({ success: true, data: result });
};
```

---

## Phase 5: Socket Events

**File:** `Utils/MessageTypes.js`

Add new message types:

```js
queue_driver_bid_placed: "queue_driver_bid_placed",
queue_driver_bid_accepted: "queue_driver_bid_accepted",
queue_driver_bid_rejected: "queue_driver_bid_rejected",
queue_bidding_closed: "queue_bidding_closed",
queue_overflow_bidding: "queue_overflow_bidding",
```

---

## Phase 6: Company Bid Integration (Minimal Changes)

Since `ShipperRequestBatch` now has `queueOrganizationUniqueId`, the company bid flow already works:

1. Shipper creates batch with `requestMode: 'company_target'` + `queueOrganizationUniqueId`
2. `create.service.js` creates batch header WITH queue UUID (Phase 3a Change 1)
3. SR rows deferred (existing behavior)
4. Companies discover batch, submit bids, shipper accepts
5. SR rows created lazily with `queueOrganizationUniqueId` populated

No changes needed to `bidCreate.service.js` — it already handles non-company_target batches and the batch now carries the queue UUID.

---

## Phase 7: E2E Tests

**File:** `E2ETests/Queue/QueueBid.js` (new)

| Test | Description |
|------|-------------|
| TQ-B1 | Shipper creates `queue_driver_bid` batch → SR rows at status 21 (bidding) |
| TQ-B2 | Queue driver checks into queue → sees biddable orders → submits bid (isNonQueueDriver=false) |
| TQ-B3 | Multiple drivers bid → shipper sees all bids with base price comparison |
| TQ-B4 | Shipper accepts bid → winning driver gets `acceptedByShipper(4)`, losers get `rejected` |
| TQ-B5 | Driver tries to bid on non-bidding order → error |
| TQ-B6 | Driver with no active vehicle assignment tries to bid → error |
| TQ-B7 | Shipper tries to accept bid on non-bidding order → error |
| TQ-B8 | Company bid on queue organization → batch has queue UUID, companies bid normally |
| TQ-B9 | **Overflow: 10 orders, 3 queue drivers → 3 FIFO dispatched, 7 enter bidding status** |
| TQ-B10 | **Non-queue driver (no queue entry) views biddable orders → sees overflow orders** |
| TQ-B11 | **Non-queue driver submits bid → bid created with isNonQueueDriver=true** |
| TQ-B12 | **Queue driver also bids on same order → bid created with isNonQueueDriver=false** |
| TQ-B13 | **Shipper sees both queue and non-queue bids, picks best → accept works for non-queue driver** |

---

## Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `Database/Database.js` | Modify | Add column to batch, new DriverBid table with isNonQueueDriver, new status |
| `Utils/ListOfSeedData.js` | Modify | Add `bidding: 21` |
| `Validations/ShipperRequest.schema.js` | Modify | Add `queue_driver_bid` to ENUM |
| `Validations/DriverBid.schema.js` | Create | Joi schemas for bid endpoints |
| `Services/ShipperRequest/create.service.js` | Modify | Handle `queue_driver_bid` mode, overflow detection, batch queue UUID |
| `Services/DriverBid.service.js` | Create | submitBid (non-queue aware), getBidsForOrder, acceptBid |
| `Services/DriverQueue.service.js` | Modify | Add getBiddableOrders, update rescan filter |
| `Routes/queue/DriverQueue.routes.js` | Modify | Add 4 new routes |
| `Controllers/DriverQueue.controller.js` | Modify | Add 4 controller functions |
| `Utils/MessageTypes.js` | Modify | Add 5 new message types |
| `E2ETests/Queue/QueueBid.js` | Create | 13 test scenarios |

---

## Design Decisions

1. **One mode per batch** — each batch has ONE `requestMode`. If you need different modes, create separate batches.
2. **All eligible drivers can bid** — any driver with an active VehicleDriver assignment can bid on biddable orders, regardless of queue status. Queue drivers are identified by their queue entry; non-queue drivers are flagged with `isNonQueueDriver=true`.
3. **Shipper sets base price** — the `shippingCost` on the request serves as the reference price. Drivers bid above or below it.
4. **One bid per driver per order** — drivers can update their bid but cannot have multiple active bids on the same order.
5. **Bidding status (21)** — dedicated status to distinguish "awaiting bids" from "waiting for FIFO dispatch" (1) or "requested" (2).
6. **No auto-dispatch for bid orders** — `queue_driver_bid` orders skip FIFO dispatch entirely. They sit at status 21 until a driver bids and the shipper accepts.
7. **Overflow-triggered bidding** — when FIFO can't fill all orders (more orders than queue drivers), remaining orders automatically switch to bidding status (21). No manual mode switch needed. The shipper is notified that orders are open for bidding.
8. **Non-queue driver access** — drivers NOT checked into the queue can bid on overflow orders. They are tracked with `isNonQueueDriver=true` in the DriverBid table. Shipper/admin approves the winning bid, giving them control over which non-queue driver gets the overflow orders.
9. **Queue check-in not required for bidding** — the bid system is open to all eligible drivers. The only requirement is an active VehicleDriver assignment (vehicle + driver pair).
