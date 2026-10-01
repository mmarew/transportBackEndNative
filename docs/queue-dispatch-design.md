# Queue Dispatch Design — Fixed-Price Ordering (e.g. Mojo Customs)

> Status: **IMPLEMENTED** on branch `feature/queue-dispatch` (backend + queue admin
> dashboard). Auto-offer (`handleQueueDispatch`), the full offer lifecycle (accept /
> reject / timeout), and the queue-org manage page are live. Exact schema and
> access patterns: [queue-tables-access.md](queue-tables-access.md). Operator docs
> live in the frontend repo: `queadmin-frontend/docs/queadmin-operations.md`.

## 1. Problem

Some clients (e.g. Mojo Kaliy customs, Diredawa customs, National Cement) do not
use bidding. They use a **fixed price** and a **queue**: drivers join a waiting
line to serve that client's orders. When an order comes in, it is offered to
drivers **in queue order** and each driver accepts or rejects.

The queue is a **virtual waiting line** — a driver does **not** need to be at the
site to get a position. They check in from anywhere (home, another town, another
job) and travel to the client's site **only when assigned a load**.

Two hard requirements:

1. The queue position is the dispatch order (driver 1, driver 2, … driver 1000).
2. Position disputes ("driver 1000 says I'm before you") must be reconcilable
   against an **authoritative server record**, not a driver's claim.

A **QueueOrganization record must exist first**; the queue is linked to it.

## 2. Industry flow (end-to-end)

**Actors:** Driver (truck), QueueOrganization (client with goods), QueueOrgAdmin
(site manager), Shipper (goods owner), Admin (approves org).

```
1. ONBOARD
   Admin approves org            → QueueOrganization (queueEnabled=1)
   Org creates QueueOrgAdmin      → membership (role 11)

2. ARRIVAL / CHECK-IN  (the virtual ticket machine)
   Driver taps "join queue" in app — from ANYWHERE
   → POST /driver/queue/checkin     (no geo requirement)
   Server stamps queueNumber 1,2,3…
     per (org, date, vehicle type)  + joinedAt  ← this IS the queue position
   Driver stays put; only travels to the site when assigned a load

3. ORDER
   Goods ready to ship            → POST /api/shipperRequest
   Org places: fixed shippingCost, numberOfVehicles=N,
   queueOrganizationUniqueId set → N ShipperRequest rows

4. DISPATCH  (first-right-of-refusal)
   Each row offered to FRONT driver of matching type only
     → JourneyDecision(requested) + notify that driver (entry `requested`)
   Accept → driver assigned (leave queue, marked agreed)
   Reject (3 min) → order advances to next in line,
     rejected driver KEEPS position for the next order (entry `notagreed`)
   Timeout (3 min) → order RETAINED on the silent driver's entry (16, `noAnswerFromDriver`)
     → next driver found: holder released, order advances to him, late accept rejected
     → no next driver:   order waits on the 16 entry; the first driver's late accept is HONOURED

5. LOADING → JOURNEY
   Assigned driver travels to the site and loads
   startJourney → Journey row, GPS of pickup
   transport to destination → completeJourney

6. DELIVERY → FREE
   Journey completed → payment/commission
   Driver may re-check-in for another load (re-entry, new number at back)

7. DISPUTE  ("I was before you!")
   QueueOrgAdmin opens the queue record
   Truth = server queueNumber + joinedAt; override only w/ audit log
```

The whole system is: **a fair virtual ticket line (2) feeding the existing
order → assign → journey engine (3–6), with an authoritative record for
disputes (7).**

## 3. Agreed design decisions

| Decision            | Choice                                                             |
| ------------------- | ------------------------------------------------------------------ |
| Rejection behavior  | Driver **keeps position**; the _order_ advances to the next driver. Escalation: after **N** consecutive front-position refusals (default 3, `QUEUE_REFUSAL_LIMIT`) the driver moves to the back of the line — see [queue-refusal-policy.md](queue-refusal-policy.md) |
| Queue scope / reset | Per**queue organization**, resets daily (`queueDate`)              |
| Offer timeout       | **3 minutes** by default (`QUEUE_OFFER_WINDOW_MINUTES`, env-configurable). On no response the entry is parked at `no_answer`(16) with the **order retained**; it advances only when the next driver takes it (late accept by the first driver is then rejected) or, if nobody takes it, the first driver's late accept is honoured |
| On accept / load    | Driver is**removed from the queue** (marked `agreed`)              |
| Order outlives the queue | Order created (or advanced to the end of the line) while no driver is waiting stays `waiting`; it is **auto-offered on the next driver check-in** (FIFO), not just via manual `POST /api/queue/dispatch` |

## 4. Core mechanic

The queue orders **who loads**. An **order advances down the queue** until
someone accepts, but a rejecting or silent driver **keeps their position** for the
next order. All of this happens **within a single vehicle type's queue**.

```
Queue: D1(pos1)  D2(pos2)  D3(pos3)

Order A ──offer──> D1 ──rejects──> offer to D2 ──accepts──> D2 agreed (leaves queue)
Order B ──offer──> D1 (still pos1) ──accepts──> D1 agreed (leaves queue)
```

- Rejection / timeout = "I pass on _this_ order", not "I lose my turn".
- The queue only advances when someone **accepts** (leaves).

## 5. Data model

The queue is owned by a **QueueOrganization** — the client that needs freight and
hosts the waiting line (e.g. Mojo Kaliy customs, Diredawa customs, National Cement).
Queue organizations come first; a queue only exists for a registered one.

### `QueueOrganization` (new)

```
queueOrganizationId            PK
queueOrganizationUniqueId      VARCHAR(36) UNIQUE
queueOrganizationName          VARCHAR(255)     -- "Mojo Kaliy", "National Cement", …
queueOrganizationType          ENUM('customs','factory','cement','depot','other')
queueOrganizationPhone         VARCHAR(20)
queueOrganizationAddress       VARCHAR(500)
latitude / longitude           DECIMAL          -- site reference / order pickup point (NOT a check-in gate)
approvalStatus                 ENUM('pending','approved','rejected','suspended')
queueEnabled                   BOOLEAN          -- opts into queue dispatch (default FALSE)
approvedBy / approvedAt / isDeleted / timestamps (…CreatedAt/CreatedBy/Updated/Deleted)
```

Shippers place orders on behalf of the queue organization (a shipper user linked to
the queue organization via a membership, mirroring
`TransportCompany`/`CompanyMembership`).

### QueueOrgAdmin role (new role id: 11)

A **`queueOrgAdminRoleId`** user is the queue manager for a queue organization. It
assigns and manages the queue, mirroring how `companyAdminRoleId`/`dispatcherRoleId`
work for transport companies.

Responsibilities:

- Register / edit the QueueOrganization profile.
- Place orders on behalf of the org (fixed price, `queueOrganizationUniqueId` set).
- View the full queue, see dispute records (`joinedAt`, `queueNumber`).
- Manually check in / check out drivers.
- Override position / remove entries (**supervisor override** — audit logged).
- Resolve disputes using the server record as truth.

### `QueueOrganizationMembership` (new — mirrors `CompanyMembership`)

```
queueOrganizationMembershipId    PK
queueOrganizationMembershipUniqueId  VARCHAR(36) UNIQUE
queueOrganizationUniqueId        FK -> QueueOrganization
userUniqueId                     FK -> Users      (QueueOrgAdmin / shipper of the org)
roleId                           FK -> Roles      (11 = queueOrgAdmin, 1 = shipper)
isActive / membershipStartDate / membershipEndDate / timestamps
UNIQUE (queueOrganizationUniqueId, userUniqueId)
```

### `DriverQueue`

```
queueId                    PK
queueUniqueId              VARCHAR(36) UNIQUE
queueOrganizationUniqueId  FK -> QueueOrganization      -- which org's queue
queueDate                  DATE        -- daily reset
queueNumber                INT         -- 1,2,3… per (queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId)
vehicleDriverUniqueId      FK -> VehicleDriver          -- the truck+driver unit in line
shipperRequestUniqueId     FK -> ShipperRequest         -- the order assigned to this entry
joinedAt                  DATETIME    -- server-stamped check-in; dispute truth
status                     ENUM('waiting','requested','agreed','notagreed','removed')
requestedAt / agreedAt     DATETIME
timestamps (…CreatedAt/CreatedBy/Updated/Deleted)

UNIQUE (vehicleDriverUniqueId, queueOrganizationUniqueId, queueDate)  -- one entry per vehicle/day
```

The queue unit is the **`VehicleDriver`** link (a specific truck + its assigned
driver). `driverUserUniqueId` and `vehicleTypeUniqueId` are **not stored**:

- Driver → via `VehicleDriver.driverUserUniqueId`
- Vehicle type → via `VehicleDriver.vehicleUniqueId → Vehicle.vehicleTypeUniqueId`

**`shipperRequestUniqueId` is a real FK to `ShipperRequest`.** When the front
driver is assigned an order, a normal `ShipperRequest` is created and linked here —
it is the **same record type** a `takeFromStreet` or a call-in order produces, and
it continues through the exact same JourneyDecision → Journey lifecycle. The queue
just decides _which_ driver serves that order.

No `vehicleDriverUniqueId` column needs `driverUserUniqueId`/`vehicleTypeUniqueId`.
This also stops a driver from queueing a vehicle type they don't actually drive.
Assumption: one driver = one active `VehicleDriver` assignment, so the vehicle is
also the "one entry per driver per day" (see §10 re-entry / multi-vehicle edges).

Example — Mojo Kaliy customs on one day:

```
VehicleType: Isuzu FSR        VehicleType: Sino Truck
  pos1  D7    (joined 08:01)    pos1  D3    (joined 08:04)
  pos2  D12   (joined 08:10)    pos2  D9    (joined 08:22)
  pos3  D21   (joined 08:33)    pos3  D15   (joined 08:40)
```

### Queue numbering is per vehicle type

The queue is keyed by **`(queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId)`** —
each vehicle type has its **own sequence** within a queue organization (an Isuzu
FSR queue, a Sino truck queue, etc.). `queueNumber` is issued by the server at
check-in inside a transaction: `COUNT(*) + 1` for that
`(queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId)` — the "ticket machine".

`joinedAt` is the reconciliation truth for "I am before you."

## 6. State machine

```
check-in ────────────────> waiting
waiting ──offer──────────> requested   (ShipperRequest created + linked; 3-min timer starts)
requested ──accept───────> agreed      (journey proceeds; entry removed from dispatch)
requested ──reject────────> notagreed  (keeps position; order advances — ShipperRequest goes to next driver)
requested/no_answer ──timeout──> no_answer(16)   (order RETAINED on this entry entry; count += 1)
no_answer ──next driver takes order──> notagreed (holder released 16→18, order detached; late accept → 409)
no_answer ──no next driver──> stays 16            (first driver's late accept → 16→AGREED; honoured)
notagreed ──offer───────> requested     (re-offered by a later order — same driver)
waiting/notagreed ──checkout/override─> removed   (audit logged)
requested/no_answer/agreed/5/6/7/8 ──whole-job cancel──> waiting (pre-accept, no count) | closed (12, post-accept, no refusal count)
agreed ──driver cancels job─────────> closed     (cancelledByDriver 12, soft-deleted, forfeits slot; refusal +1; order advances — §3.5)
any ──accept... journey completes───> removed     (closeEntryOnJourneyCompletion)
```

## 7. Dispatch rules (per new order for a queue organization's queue)

1. Consider only entries with `status IN ('waiting','notagreed')` for the same
   `(queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId)` as the order's
   vehicle type — the type is resolved per entry via
   `VehicleDriver.vehicleUniqueId → Vehicle.vehicleTypeUniqueId`.
2. Pick the lowest `queueNumber` → create the `ShipperRequest` for this order,
   link the entry via `shipperRequestUniqueId`, create a JourneyDecision
   (`requested`), and notify **only that driver** (driver contact via
   `VehicleDriver.driverUserUniqueId`).
3. Start the offer timer (3 min). On:
   - **accept** → guarded: the accept only lands if the entry is still in
     `requested` **or** retained `no_answer`(16) **and** the caller is the entry's
     holder (`markEntryAgreed` + a pre-journey gate in
     `actionAcceptShipperRequest.service.js`). Otherwise 409 with no Journey side
     effects. Accepted → entry `agreed`, journey proceeds normally.
   - **reject** → cancel that decision, **order advances** to the next-lowest
     number in that vehicle type's queue; the driver's entry stays `notagreed`
     (position kept, still eligible for the next order);
   - **timeout** → decision `noAnswerFromDriver` (16), entry parked at
     **`no_answer`(16) with the order retained** (NOT `waiting`), `count += 1`.
     `offerToNextDriver` then moves the order only if a next matching driver is
     available — at which point the stale 16 holder is released (16→18, order
     detached) and any late accept from him is **rejected 409**. If no next
     driver exists, the order stays on the 16 entry and the first driver's late
     accept is **honoured** (16→`agreed`).
4. The front driver always matches the order's vehicle type (each type has its own
   queue), so a mismatch can only occur if a driver's entry is stale — skip to the
   next matching driver in that type's queue.
5. If the type's queue is empty or every driver rejected → the order stays
   `waiting`. It is **auto-offered on the next check-in** of a matching-type
   driver: after `checkin` creates/revives the queue entry, it rescans pending
   `waiting` queue orders for that `(queueOrganizationUniqueId, vehicleTypeUniqueId)`
   and offers the oldest (`shipperRequestCreatedAt ASC`) to the FRONT driver of
   that type via `offerToDriver` (same primitive as creation-time dispatch).
   The QueueOrgAdmin can always still re-offer manually via
   `POST /api/queue/dispatch`.

### 7.1 Driver cancels — active transfer

A driver-side cancel is a **transfer**, not a kill (the job is still alive):

- **Pre-accept reject** (`rejectedByDriver` 18) → `rejectOffer`: driver keeps
  position, `count += 1`, order advances FIFO. Same path releases a **stale
  `no_answer`(16) holder** the moment the order is passed to a next driver.
- **Post-accept cancel** (`cancelledByDriver` 12) → `releaseQueueEntryAfterDriverCancel`:
  entry closed + soft-deleted (driver forfeits the slot and must re-check-in),
  refusal `count += 1`, order offered to the **next waiting driver** of the type;
  if none → admin + shipper notified (`online_driver_not_found`) and the order
  waits for the next matching-type check-in.
- **Non-queue (street / distance) orders** → nearest re-match via
  `handleWaitingRequest`; `DriverQueue` is never touched.

### 7.2 Order released by the system — re-offer, not discard

- **Checkout / driver release (`checkout`)** → if the released order is still
  held by a queue entry (`requested` or retained `no_answer`), the order is
  **re-offered to the next driver in line** (`offerToNextDriver`) instead of
  being left to manual dispatch; the shipper is notified `queue_order_reoffered`,
  and if the next driver takes it the stale holder is released (16→18). When no
  driver is found the order goes to the first driver's retained queue order.
- **Whole-job cancel (`releaseEntryOnOrderCancel`)** → pre-accept (`requested` /
  `no_answer`) entries return to `waiting`, position kept, **no refusal count**;
  post-accept entries (`agreed`/loading stages/journey started) are **closed** as
  `cancelled_after_accept`(12) (no penalty — the shipper/admin cancelled the job),
  and the driver is notified. See
  [queue-order-cancellation.md](queue-order-cancellation.md).

Full decision + verification: [queue-order-cancellation.md](queue-order-cancellation.md)
§3.5 and [queue-refusal-policy.md](queue-refusal-policy.md).

## 8. Proposed endpoints (new)

QueueOrganization admin / admin:

| Method | Endpoint                                            | Purpose                                                             |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------- |
| POST   | `/api/queueOrganization`                            | Register an org that needs a queue (Mojo Kaliy, National Cement, …) |
| PATCH  | `/api/queueOrganization/:queueOrganizationUniqueId` | Approve / edit / enable`queueEnabled`                               |
| GET    | `/api/queueOrganization?type=`                      | List queue organizations (filter by customs / cement / …)           |

Driver queue:

| Method | Endpoint                                                  | Purpose                                                                                                                                                                                                              |
| ------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/driver/queue/checkin`                               | Body`{ queueOrganizationUniqueId, vehicleDriverUniqueId }` (geo optional, informational only) → server derives type via `VehicleDriver` → returns `queueNumber`, `position`. No geo requirement — join from anywhere |
| GET    | `/api/driver/queue/myPosition?queueOrganizationUniqueId=` | Driver's position + estimated wait                                                                                                                                                                                   |
| DELETE | `/api/driver/queue/checkout`                              | Leave queue (no-show)                                                                                                                                                                                                |

QueueOrgAdmin (assign & manage the queue):

| Method | Endpoint                                             | Purpose                                                          |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------------- |
| GET    | `/api/queue/status?queueOrganizationUniqueId=&date=` | Full queue, per vehicle type, with`joinedAt`                     |
| POST   | `/api/queue/manualCheckin`                           | Manually check a driver/vehicle in                               |
| PATCH | `/api/queue/entry/:queueUniqueId/override`                 | Reorder / swap positions — supervisor override, audit logged     |
| DELETE | `/api/queue/entry/:queueUniqueId`                          | Remove an entry (checkout / no-show / override)                  |
| POST   | `/api/queue/dispatch`                                | Manually trigger dispatch of a waiting order to the front driver |

> Implemented on `feature/queue-dispatch` (paths under `/api/queue` and
> `/api/queueOrganization`, see `Routes/queue/`).

### Real-time updates (socket.io — avoids data latency)

Queue state changes are **pushed** over socket.io, not polled:

- Clients join rooms: `queueOrg:<orgUniqueId>` (admins, all dates) and
  `queueOrg:<orgUniqueId>:<queueDate>` (drivers after check-in, admins per day).
- Socket events: `queue:subscribe` / `queue:unsubscribe` (client→server) and
  `queue` (server→client, JSON payload with `messageTypes` +
  `data` = full queue snapshot or event payload).
- Every queue write calls `emitQueueSnapshot()` (broadcast the authoritative
  queue to the day room) and `notifyQueueOrgAdmins()` (role-11 sockets).
- Message types: `queue_checkin_confirmed`, `queue_position_changed`,
  `queue_order_offered`, `queue_order_rejected`, `queue_order_assigned`,
  `queue_removed`, `queue_org_approved`, `queue_org_updated`,
  `queue_driver_started_journey`, `queue_driver_completed_delivery`.
- Loading-stage / journey-start updates for queue orders are pushed via
  `notifyQueueOrgOfLoadingStage()` (`Utils/QueueSocket.js`): statuses 5-8 →
  `queue_driver_going_to_loading_place`, `queue_driver_started_loading`,
  `queue_driver_completed_loading`, `queue_driver_started_journey`. Delivery
  completion (status 9) closes the entry with `queue_driver_completed_delivery`.
- New socket user type `queueOrgAdmin` registered in `Utils/WSPusher.js`.

REST stays the **source of truth** (`joinedAt` + `queueNumber`); socket is a
read-model push. On reconnection a client should re-fetch
`GET /api/queue/status` and resubscribe.

## 9. How it plugs into existing code

- **Reuse the existing order API** — no new "create order" endpoint. `POST
  /api/shipperRequest` accepts an optional `queueOrganizationUniqueId`
  (Joi + `ShipperRequest.queueOrganizationUniqueId` column). The `ShipperRequest`
  record is identical whether the order comes from a queue, a call-in, or
  `takeFromStreet`; only dispatch differs.
- In `Services/ShipperRequest/create.service.js`, after the ShipperRequest rows are
  created, the waiting requests are split:
  - `queueOrganizationUniqueId` set → `handleQueueDispatch` (per row): offer to the
    **front** of that org's queue (lowest `queueNumber`, type via `VehicleDriver`),
    link the entry via `shipperRequestUniqueId`, create one JourneyDecision
    (`requested`, `decisionBy='shipper'`), move ShipperRequest + DriverRequest to
    `requested`, notify that driver. No waiting driver → order stays `waiting`,
    auto-offered on the next matching-type check-in (or manual `dispatch`).
  - no `queueOrganizationUniqueId` → current `handleWaitingRequest` (top-10 nearest).
  - `company_target` requests are skipped by both paths.
- `numberOfVehicles: N` → the org's N ShipperRequest rows are each dispatched to the
  next front driver in the queue.
- Current auto-match (`Services/ShipperRequest/statusVerification.service.js`,
  `handleWaitingRequest`) offers to **up to 10 waiting drivers at once**, ordered by
  `DriverRequest.driverRequestId ASC`. Queue dispatch replaces this for orders
  placed against a queue-enabled **QueueOrganization**: order by
  `DriverQueue.queueNumber ASC` and offer **one** at a time.

### Assignment mechanism — no new assignment table

Assignment of a driver to an order is **`JourneyDecisions`** (the existing junction
`shipperRequestId ↔ driverRequestId` + `journeyStatusId` + `decisionBy`). A
`numberOfVehicles: 5` order creates 5 ShipperRequest rows; queue dispatch runs once
per row, each linking the front driver via a JourneyDecision. Full chain:

```
DriverQueue (vehicleDriverUniqueId)
   └─ shipperRequestUniqueId → ShipperRequest
        └─ JourneyDecisions → DriverRequest → driver
```

`CompanyBidVehicleAssignment` is NOT used — that table belongs to the company/bid
(`company_target`) flow; queue dispatch is fixed-price individual.

- The existing "skip already-rejected" logic
  (`VerifyIfShipperRequestWasNotRejected`) stays — it's what lets the order advance
  past a rejecting driver.
- Fixed price = existing `individual_target` mode + `shippingCost` (no `CompanyBid`
  flow). Driver accepts/rejects the fixed price; no counter-bid.
- `QueueOrganization` mirrors `TransportCompany` + `CompanyMembership`: a queue
  org's orders come from shipper users linked to that queue organization.
- Seed `usersRoles.queueOrgAdminRoleId = 11` in `Utils/ListOfSeedData.js` +
  `UserRoles`, and build `QueueOrganizationMembership` like `CompanyMembership`
  (role-gated routes check `queueOrgAdminRoleId` for manage/override endpoints).

## 10. Open questions / pending decisions

Resolved during implementation:

- **Empty / all-reject queue:** order stays `waiting`; **auto-offered on the
  next matching-type check-in** (`checkin` rescans pending `waiting` queue
  orders FIFO → `offerToDriver`), with manual `POST /api/queue/dispatch` kept
  as a fallback.
- **Fixed price source:** the order's `shippingCost` is used (queue orders skip the
  counter-bid step — accept does not require `shippingCostByDriver`).
- **Offer window:** fixed 3 minutes (`QUEUE_OFFER_WINDOW_MINUTES`, env-configurable);
  `releaseExpiredOffers()` in `automaticTimeout.service.js` advances expired offers.

Still open:

- **Timer UX:** on timeout the order advances and the entry returns to `notagreed`;
  the silent driver is not pushed a dedicated "you lost order X" notice yet.
- **Daily reset:** confirm reset at midnight _local time at the queue org's site_.
- **Re-entry:** a driver who agreed (left the line) may re-check-in the same day →
  new number at the back. Confirm allowed.
- **Supervisor override:** scope of reorder/removal powers + audit requirements.
- **Multiple sites:** can one queue organization host more than one queue (e.g.
  National Cement with two plant gates)? If yes, add a `QueueOrganizationSite`
  level between `QueueOrganization` and `DriverQueue`.
- **Driver switches vehicle mid-queue:** if the driver's active `VehicleDriver`
  changes (new vehicle, type changed) while queued, the entry's type silently
  changes too. Should the entry re-validate/be removed on assignment end?

## 11. Dispute reconciliation

The server record is the only truth. When "driver 1000 says I'm before you":

- Compare `queueNumber` (and `joinedAt`) of both entries for the same
  `(queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId)`.
- The earlier check-in wins. A driver cannot change their number; moving up
  requires re-joining (new number at the back) or a supervisor override (audit
  logged).

## 12. Yard authority — the loading turn is the JOB, not the queueNumber

> Status: **IMPLEMENTED** (plus a persisted `DriverQueue.loadingOrderNumber`
> column for the yard-entrance number — see §12.6, migration
> `scripts/migrate-loading-order.js`). Motivated by a real incident: driver #1
> (waiting, no job) blocked driver #2 at the loading-yard gate because "queue
> number 2 is below number 1 on the screen" — while driver #2 actually held an
> accepted order.

### 12.1 The three-number model

| Number | What it is | Changes? |
| ------ | ---------- | -------- |
| `queueNumber` | Immutable **arrival** number per (org, date, vehicle type). Dispatch FIFO + audit/dispute anchor. | **Never** — no renumbering, ever. |
| `linePosition` | **Derived** turn among drivers still WAITING (status 1/2/16/18): waiting drivers ahead + 1. | Recomputed on every read; the line renumbers itself automatically as drivers get jobs. |
| `loadingOrderNumber` | **Persisted** yard-entrance number, issued write-once at accept: **ONE continuous sequence per (org, date)** — the first shipper's trucks take 1,2,3 and the next shipper's trucks continue 4,5,6,7, regardless of each truck's queueNumber. | **Never** while the job is held; issued once at accept, cleared when the entry is released back to waiting. §12.6. |

With 100 vehicles where #30 took a job: #1–29 see no change, #31 now displays
`linePosition 30`, #100 displays 99, and #30 shows in the loading lane with a
`yardAccess PASS`. When #30 finishes and re-checks-in they get queueNumber 101
at the back. The stored numbers keep full history; the displayed line renumbers
itself.

### 12.2 Job authority (computed, not stored)

`hasActiveJob(status)` ⇔ status ∈ {3 agreed, 5 go-to-loading, 6 loading,
7 loaded, 8 journey-started} (`JOB_STATUSES` in
`Services/DriverQueue/helpers.js`). A driver with `hasActiveJob = true` has
**left the waiting line** and may enter the loading yard regardless of their
queueNumber. The complement (`IN_QUEUE_STATUSES` = 1/2/16/18) is the waiting
set. Every live entry is exactly one of the two (`LIVE_ENTRY_STATUSES`).

Yard verdict (`yardAccessForEntry`):

| verdict | reason | meaning |
| ------- | ------ | ------- |
| `PASS` | — | holds a job → may enter the yard |
| `HOLD` | `waiting_for_job_offer` | in line, nothing offered yet |
| `HOLD` | `offer_pending_accept` | an order is on the driver's screen but NOT accepted yet |
| `HOLD` | `reserved_not_assigned` | position reserved for a shipper (`targetedShipperUserUUID`) whose order has not been assigned — a **reservation is not a job** |
| `HOLD` | `waiting_shipper_turn` | holds a job (AGREED, status 3) but ANOTHER shipper is being served at the yard — the shipper-turn overlay (§12.4); trucks already sent to the bay (status 5+) always PASS |
| `HOLD` | `not_in_queue` | no live entry today |

### 12.3 Where the fields are surfaced

- `GET /api/driver/verifyDriverJourneyStatus` — every response now carries a
  `driverQueue` block: `{ inQueue, queueNumber, linePosition, waitingAhead,
  hasActiveJob, activeOrder, reservation, yardAccess }`. One poll answers
  "do I have a job, what is my real turn, can I enter the yard".
- `POST /api/queue/driver/checkin` + `GET /api/queue/driver/myPosition` — same
  fields on the entry (`myPosition` now also reports job-holder entries, which
  the street/market fences rely on).
- `GET /api/queue/status` — each vehicle-type group additionally appears under
  `data.lanes` as `{ loadingNow, waiting }` (plus `statistics.loadingNow`).
  `queues` stays the flat array for backward compatibility. Waiting entries
  carry their derived `linePosition`; job holders carry their persisted
  `loadingOrderNumber`. `data.shipperTurn.servingShipperUserUniqueId` names
  the shipper whose turn it is, and the loadingNow lane is **gated**: an
  AGREED truck of a non-serving shipper shows `yardAccess HOLD
  (waiting_shipper_turn)`.
- **Gate check (new):** `GET /api/queue/entry/:queueUniqueId/yardPass`
  (QueueOrgAdmin) — the guard scans/types the entry and gets an authoritative
  `PASS { driver, vehicle, order }` or `HOLD { reason }`, both with the
  `servingShipper` named and the entry's `loadingOrderNumber`. This is the
  answer to "queue number 1 says it's my turn": the gate decides by job +
  shipper turn, not by number.

### 12.4 The two-level yard rule (shipper turn + continuous entrance sequence)

Multiple shippers share one yard (e.g. shipper A ordered 40 vehicles, shipper B
15). **Level 1 — the shipper's turn comes before the driver's order**: the
shipper of the **lowest live yard-entrance number** is the **serving shipper**;
only their job-holding vehicles may enter the yard, and the other shippers'
agreed trucks wait outside the gate. **Level 2 — within the serving shipper's
turn, trucks enter in entrance-number order** — even when those trucks checked
in as queueNumbers 100/120/130.

1. **Assignment** still comes from the single FIFO waiting line: the oldest
   pending order is offered to the front waiting driver first, so assignments
   interleave across orders by time (A → B → A → …).
2. **The yard-entrance number (`loadingOrderNumber`) is issued write-once at
   accept** — `MAX(existing)+1` scoped to (org, date), stamped in the same
   UPDATE that flips the entry to AGREED. ONE continuous sequence for the day:
   shipper A's trucks take 1,2,3 and shipper B's trucks continue 4,5,6,7.
   Waiting entries carry NULL; a released bidder's number is cleared with the
   linkage. Never recomputed on read — reads surface the stored column.
3. **Serving shipper** = the shipper of the **lowest live loadingOrderNumber**
   (status 3/5/6/7/8) for the org+day (`servingShipperFor`, one indexed
   lookup; the sequence is continuous, so the lowest is unique and no
   tie-break is needed). An AGREED (status 3) holder of another shipper HOLDs
   at the gate with `waiting_shipper_turn`; trucks already sent to the loading
   place or beyond (status 5/6/7/8) are inside by right of work and always
   PASS.
4. **The loading sequence = the persisted number**, then `agreedAt` for the
   numberless legacy rows (fallback `joinedAt`, then `queueNumber`). No
   per-read filtering/recomputation — the board reads the column.
5. The queue-org admin can still reorder/remove via the existing supervisor
   override endpoints (audit logged) for operational reality (bay sizes,
   no-shows).

### 12.5 Accept linkage — the root-cause fix

BID-BASE orders (`isBiddingApproved = TRUE`) are matched on the bidding board
(check-in pull / order-creation distance match), which creates a bare
`JourneyDecision` and historically **never wrote the order onto the accepting
driver's DriverQueue entry** — the driver kept status 1 (WAITING), still
counted in everyone's `waitingAhead`, and the yard could not see their job.

Fix: `updateJourneyStatus` (`Services/JourneyStatus/update.service.js`) — the
choke point every accept flows through — now calls
`linkQueueEntryOnAccept` (`Services/DriverQueue/accept-linkage.service.js`) on
every transition to `acceptedByDriver (3)`. It links the driver's live,
**unlinked** entry to the accepted order, marks it AGREED, and stamps
`agreedAt` — guarded so FIFO offers (already linked) and orders already held by
another entry are untouched. The mirror call on `notSelectedInBid`
(`releaseAgreedEntryForUnselectedBidder`) releases a losing bidder's
AGREED-linked entry back to WAITING (position kept) when the shipper selects
another driver.

With linkage in place, the existing lifecycle matches by
`shipperRequestUniqueId` and works for these orders automatically: journey
progress (5/6/7/8) mirrors onto the entry, completion closes it, and
driver-cancel-after-accept forfeits the slot.

**Legacy ghosts get a way out:** a pre-linkage entry can sit at status 3 with
NO order linkage anywhere (the bid decision never resolved). Checkout used to
scan only the waiting statuses (1/2/16/18) and told these drivers "Driver is
not in the queue for today" (404) while `myPosition` still showed them as
phantom job holders. `checkout` now scans ALL live statuses: a job holder
WITH a resolvable order (direct or legacy-healed) is refused with 409 — the
order must leave by cancel/complete — while a linkage-less AGREED ghost is
released by checkout (QYA-08).

Tests: `E2ETests/Queue/QueueYardAccess.js` (QYA-01..08).

### 12.6 `loadingOrderNumber` — the persisted yard-entrance number

> Migration: `NODE_ENV=development node scripts/migrate-loading-order.js`
> (adds `DriverQueue.loadingOrderNumber INT NULL` + index
> `idx_queue_loading_order (queueOrganizationUniqueId, queueDate,
> loadingOrderNumber)`, then backfills live legacy entries: per org+day,
> ordered by `agreedAt`, `queueId` — continuing after the highest already-
> issued number so issued numbers are immutable).

- **Issuance (write-once, at accept):**
  `markEntryAgreed` (lifecycle.service.js, FIFO + bid fallback) and
  `linkQueueEntryOnAccept` (accept-linkage.service.js, board/distance-match
  accepts) both stamp `loadingOrderNumber =
  COALESCE(MAX(loadingOrderNumber),0)+1` per (org, date) — one continuous
  sequence, shippers included in accept order — in the same UPDATE as the
  AGREED flip. The `FOR UPDATE` row locks on the entry serialize concurrent
  issuers reading the same MAX.
- **Clearing:** `releaseAgreedEntryForUnselectedBidder` (loser back to
  WAITING) clears the number with the linkage. Terminal/soft-deleted rows
  keep their number for the audit trail; the MAX deliberately includes them
  so numbers are **never reused** within a shipper's day.
- **Level-1 gate:** `yardAccessWithShipperTurn(executor, entry)` overlays the
  shipper-turn verdict on top of the base job verdict (used by
  `driverQueueContext`, `myPosition`, `yardPass`).
- **Reads:** `publicEntry`/`buildQueueEntry`/`driverQueueContext` surface
  `loadingOrderNumber`; `getQueueStatus` orders the loadingNow lane by the
  stored number and names `shipperTurn.servingShipperUserUniqueId`;
  DriverQueueHistory mirrors the column (snapshot SELECT + DDL kept in
  equal-column lockstep).
