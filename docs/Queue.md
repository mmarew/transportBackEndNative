# Queue System

A queue admin creates a shipper request in ONE of two types:

1. **SELECT FROM QUEUE** (FIFO dispatch)
2. **OPEN BID** (bid-base queue, alternative to type 1)

The queue supports either bid or fifo. The type is chosen at order creation and
cannot be changed afterwards (it is stored as `ShipperRequest.isBiddingApproved`).

Dispatch order for a driver is always resolved as follows:

1. **Registered-for-shipper drivers first** — If the driver is registered for a
   specific shipper (the shipper sends their own drivers by rent or any other
   means, so the driver is bound to that shipper), that driver is selected first.
2. **Then the FIFO queue**
3. **Then the queue bid**
4. **If still no driver is found, post to open bid.**

---

## Type 1 — SELECT FROM QUEUE (FIFO)

When the shipper creates the order as FIFO, drivers are taken from the queue in
FIFO order. It can be applied in 2 ways:

- **a) FIFO rule (default)** — The FRONT waiting driver of the order's vehicle
  type is offered the order.
- **b) FIFO fallback** — If FIFO cannot find a driver (e.g. no eligible driver
  available), the order is allowed to **POST TO OPEN BID** as a fallback.

**ACCEPT (FIFO):** the driver accepting jumps straight to `requested (2) →
acceptedByShipper (4)` because the queue has already selected the front driver.
The linked `DriverQueue` entry moves to `AGREED` (acceptedByDriver, 3).
No `Journey` row is born here — see [Journey Timing](#journey-timing-all-types).

---

## Type 2 — OPEN BID (bid-base)

Used when the shipper does NOT need to select a driver directly out of the
queue; open bid is the best alternative.

- **a)** First give the bid to **QUEUE drivers, 5 at a time**, and up to 5
  drivers can apply for each shipper request.
- **b)** If 5 drivers are not found for the queue bid after **5 minutes**, post
  the remaining slot(s) to **OPEN BID** (outside the queue).

**ACCEPT (BID):**

- The accepting driver goes `requested (2) → acceptedByDriver (3)`; the linked
  entry stays REQUESTED. No `Journey` row yet (see [Journey Timing](#journey-timing-all-types)).
- The **SHIPPER** — or a **queue org admin** (role 11) who actively manages the
  order's queue org — then selects the winning driver → `acceptedByShipper (4)`
  via `PUT /api/shipper/acceptDriverOffer`; the winner's linked entry moves to
  `AGREED`.
- All other connected drivers are marked `notSelectedInBid (17)` and their
  linked queue entry is released back to **WAITING**
  (`releaseEntryForUnselectedBidder`, `shipperRequestUniqueId` cleared,
  position kept).

---

## Journey Timing (ALL TYPES)

Statuses 1–4 are **DECISION states only**. The `Journey` row is created only
when the driver reaches `goToLoadingPlace (5)` — for **every** flow (FIFO, bid,
nearby, street, company). At that point the `fare` is stamped
(`batchShippingCost ?? shippingCost ?? shippingCostByDriver ?? 0`).
See `Services/DriverRequest/journeyManagement.service.js`.

---

## Lifecycle — Accept / Reject / Cancel / Timeout / Not-Found

**Statuses** (`journeyStatusId` / JourneyStatusMap / `ListOfSeedData.js`):

| id | status             | meaning                                   |
| -- | ------------------ | ----------------------------------------- |
| 1  | `waiting`          | order waiting for a driver                |
| 2  | `requested`        | offer held by a driver                    |
| 3  | `acceptedByDriver` | driver accepted (BID only)                |
| 4  | `acceptedByShipper`| shipper confirmed the driver              |
| 5  | `goToLoadingPlace` | **FIRST point a Journey row exists**      |
| 12 | `cancelledByDriver`| driver cancels AFTER accepting            |
| 17 | `notSelectedInBid` | bid loser at shipper selection            |
| 18 | `rejectedByDriver` | driver declines an incoming offer (pre-accept) |
| 11 | `rejectedByShipper`| shipper rejects the driver's quoted price |
| 16 | `noAnswerFromDriver`| offer window expired (3 min, no answer)  |
| 10 | `cancelledByShipper`| whole-order cancel by the shipper        |
| 13 | `cancelledByAdmin`  | whole-order cancel by a platform admin   |

**Queue entry statuses** (`DriverQueue.status`): `waiting`, `requested`,
`notagreed`, `no_answer`(16), `agreed`(3), `rejectedByDriver`(18),
`cancelledByDriver`(12).

### Accept

| Flow  | Transition                            | Notes |
| ----- | ------------------------------------- | ----- |
| FIFO  | `requested(2) → acceptedByShipper(4)` | entry → `agreed`; `actionAcceptShipperRequest` |
| BID   | `requested(2) → acceptedByDriver(3)`  | entry stays `requested`; `actionAcceptShipperRequest` |
| BID   | → shipper **or queue org admin** picks winner `acceptedByShipper(4)` | `ShipperRequest/actionAccept.service.js`; queue-admin caller must be an active `QueueOrganizationMembership` (role 11) of the order's queue org; winner entry → `agreed`; each loser → decision 17 + `releaseEntryForUnselectedBidder` (entry WAITING) |

All accepts are **decision-only** — no Journey until `goToLoadingPlace (5)`.

### Reject — driver declines an incoming offer (pre-accept)

- `JourneyDecision = rejectedByDriver (18)`, `decisionBy='driver'`
  via `Services/DriverRequest/actionCancelDriverRequest.service.js → rejectOffer`.
- entry: `requested → notagreed` (keeps `queueNumber`, stays in line)
- order: offered to the **NEXT waiting driver** of the same vehicle type
  (`offerToNextDriver`); if none, order reverts to waiting + notify
  (`online_driver_not_found`)
- refusal count **+= 1** (`applyRefusalPolicy`)
- non-queue (street/distance) order: re-engages the **NEAREST** waiting driver
  instead (`handleWaitingRequest`); `DriverQueue` is never touched.

### Reject — shipper rejects the driver's quoted price (agreement rejection)

- `JourneyDecision = rejectedByShipper (11)`, `decisionBy='shipper'`
  via `Services/ShipperRequest/actionReject.service.js → rejectOffer`.
- same queue effect as a driver reject: entry `notagreed` (position kept),
  order advances FIFO, refusal count **+= 1**.
- This is a **single-driver** rejection — the order is still **ALIVE**.

### Cancel — whole order (shipper / platform admin / queue org admin)

- `JourneyDecision = cancelledByShipper (10)` or `cancelledByAdmin (13)`
  via `Services/ShipperRequest/actionCancel.service.js → releaseEntryOnOrderCancel`.
- Any entry holding the offer (`requested`/`no_answer`) is released to **WAITING**,
  position kept, `shipperRequestUniqueId` cleared.
- **NO refusal count** (it is the shipper/admin's decision, not the driver's).
- Idempotent: an order with no holding entry is a no-op.
- A **queue org admin** cancel is recorded with `roleId 11` + reason
  "Cancelled by queue admin" (distinct from platform admin `roleId 3`).

### Cancel — driver AFTER accepting (queue order)

- `JourneyDecision = cancelledByDriver (12)`
  via `DriverRequest/actionCancelDriverRequest.service.js →
  releaseQueueEntryAfterDriverCancel`.
- entry **closed**: status 12, soft-deleted (`queueDeletedAt` set) — the driver
  **FORFEITS** their slot and must re-check-in (new `queueNumber` at the back).
- refusal count **+= 1**.
- order: offered to the next waiting driver of the same vehicle type
  (`offerToNextDriver`); if none, order stays waiting + notify
  (`online_driver_not_found`).

### Cancel — driver AFTER accepting (non-queue / street order)

- reruns `handleWaitingRequest` at origin, re-engages nearest waiting driver;
  `DriverQueue` never touched.

### Timeout — no answer within the offer window (default 3 min, `QUEUE_OFFER_WINDOW_MINUTES`)

- `JourneyDecision = noAnswerFromDriver (16)`; entry → `no_answer(16)`,
  **ORDER RETAINED** on the entry, refusal count **+= 1**
  (`releaseExpiredOffers` / `offerToNextDriver`).
- **next driver takes it** → stale holder `16 → 18`, order detached; the first
  driver's late accept is **REJECTED** (409).
- **no next driver** → order stays on the 16 entry; the first driver's late
  accept is **HONOURED** (`16 → agreed`).

### No bidder found / no driver data (order reverts)

- **FIFO:** no eligible front driver → **post to OPEN BID** (fallback), or order
  stays `waiting` and is auto-offered on the next matching-type check-in.
- **BID:** fewer than 5 queue drivers after 5 min → spill remaining slot(s) to
  **OPEN BID** (outside the queue).
- When an offer advances to the next driver and none exists, the order reverts
  to **WAITING** (`resetOrderToWaitingIfUnheld`) and the shipper + org admins are
  notified (`online_driver_not_found`). It is auto-offered again on the next
  matching-type check-in or manual dispatch.

### Refusal policy (limit 3)

Every queue-offer rejection counts as one refusal (`queueRefusalCount += 1`):
driver reject (18), shipper price-reject (11), timeout (16). **NOT counted:**
whole-order cancel (10/13). At N (default 3, env `QUEUE_REFUSAL_LIMIT`) the
driver is moved to the **BACK** of their line (`queueNumber = MAX+1`) and the
counter resets. See `docs/queue-refusal-policy.md`.

### Batch refusal rule — one decline cools the whole batch

A shipper may place several jobs under ONE batch (`shipperRequestBatchUniqueId`
shared by every order in `ShipperRequestBatch`). To avoid re-disturbing a
driver, once a driver **declines any order of a batch**, that driver is no
longer **automatically** offered any other order of the SAME batch — the batch
is "cold" for them. The skip applies to every batch order, including the same
order (an offer can otherwise be re-issued to a free/re-armed driver).

- **Applies to automatic matching only**, in both worlds:
  - **Queue FIFO** — `offerToDriver` candidate scan (reject advance,
    shipper reject, timeout advance, order cancel, check-in auto-rescan).
  - **Distance / bid matching** — `handleWaitingRequest` candidate loop
    (non-queue street/batch orders, bid-base queue orders, bidding approval,
    driver-cancel re-find).
  - **Check-in bid pull** — `pullPendingBidOrderForDriver` board scan (the
    check-in auto-offer for bidding-board orders).
- **Trigger statuses** (driver "said no"): `rejectedByDriver` (18),
  `cancelledByDriver` (12, AFTER accepting a batch job), `noAnswerFromDriver`
  (16), plus the legacy rejection set carried over from the existing batch
  guard (`VerifyIfShipperRequestWasNotRejected`): `rejectedByShipper` (11),
  `cancelledByAdmin` (13). One shared `REJECTED_STATUS_IDS` set
  (`Utils/RejectedRequests.js`) drives every matcher so they all agree. A
  driver who **accepted** a batch job may still be offered the next job.
- **Exception — manual / targeted dispatch**: a queue org admin reconnecting
  the driver explicitly via `/api/queue/dispatch` (targeted by
  `queueUniqueId`/`vehicleDriverUniqueId`) BYPASSES the batch skip. Auto-retry
  paths (check-in rescan `rescanPendingQueueOrder`, order cancel advance,
  `offerToNextDriver`, `handleWaitingRequest` re-matching, check-in bid pull
  `pullPendingBidOrderForDriver`) are NOT exemptions.
- **Scope is per-batch**: declining an order in batch A never blocks offers
  from batch B, single (non-batch) orders, or a later brand-new batch.

---

## Key implementation files

| Concern                          | File |
| -------------------------------- | ---- |
| Type selection / routing         | `Services/ShipperRequest/create.service.js` |
| FIFO dispatch core                | `Services/DriverQueue.service.js` (`offerToDriver`, `checkin`, `dispatch`, `resetOrderToWaitingIfUnheld`) |
| Offer advance / no-driver         | `Services/DriverQueue/dispatch.*` (`offerToNextDriver`, `online_driver_not_found`) |
| Whole-order cancel release        | `Services/ShipperRequest/actionCancel.service.js` (`releaseEntryOnOrderCancel`) |
| Driver cancel after accept        | `Services/DriverRequest/actionCancelDriverRequest.service.js` (`releaseQueueEntryAfterDriverCancel`) |
| Driver accept (FIFO→4, BID→3)     | `Services/DriverRequest/actionAcceptShipperRequest.service.js` |
| Shipper accepts bid winner        | `Services/ShipperRequest/actionAccept.service.js` (winner 4, losers 17 + `releaseEntryForUnselectedBidder`) |
| Shipper price-reject              | `Services/ShipperRequest/actionReject.service.js` (`rejectOffer`) |
| Offer timeout scan                | `Services/JourneyStatus/automaticTimeout.service.js` (`releaseExpiredOffers`) |
| Bid board matching                | `Services/ShipperRequest/statusVerification.service.js` (`pullPendingBidOrderForDriver`, `findNearbyDrivers`) |
| Batch refusal skip (one decline cools the batch) | `Services/DriverQueue.service.js` (`offerToDriver` FIFO scan) + `Services/ShipperRequest/statusVerification.service.js` (`handleWaitingRequest`, `pullPendingBidOrderForDriver`), shared status set `Utils/RejectedRequests.js` (`REJECTED_STATUS_IDS`) |
| Journey born at 5                 | `Services/DriverRequest/journeyManagement.service.js` |

**Related detailed design docs:**

- `docs/queue-order-dispatch.md`
- `docs/queue-dispatch-design.md`
- `docs/queue-order-cancellation.md`
- `docs/queue-refusal-policy.md`
- `docs/QueueBiddingSystem.md`
- `docs/request-workflow-queue-track-count.md`
