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
     → JourneyDecision(requested) + notify that driver
   Accept → driver assigned (leave queue, marked loaded)
   Reject/timeout (3 min) → order advances to next in line,
     rejected driver KEEPS position for the next order

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
| Offer timeout       | **3 minutes** by default (`QUEUE_OFFER_WINDOW_MINUTES`, env-configurable), auto-advance the order on no response |
| On accept / load    | Driver is**removed from the queue** (marked `loaded`)              |
| Order outlives the queue | Order created (or advanced to the end of the line) while no driver is waiting stays `waiting`; it is **auto-offered on the next driver check-in** (FIFO), not just via manual `POST /api/queue/dispatch` |

## 4. Core mechanic

The queue orders **who loads**. An **order advances down the queue** until
someone accepts, but a rejecting or silent driver **keeps their position** for the
next order. All of this happens **within a single vehicle type's queue**.

```
Queue: D1(pos1)  D2(pos2)  D3(pos3)

Order A ──offer──> D1 ──rejects──> offer to D2 ──accepts──> D2 loaded (leaves queue)
Order B ──offer──> D1 (still pos1) ──accepts──> D1 loaded (leaves queue)
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
status                     ENUM('waiting','offered','loaded','removed')
offeredAt / loadedAt       DATETIME
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
waiting ──offer──────────> offered      (ShipperRequest created + linked; 3-min timer starts)
offered ──accept─────────> loaded       (journey proceeds; entry removed from dispatch)
offered ──reject/timeout─> waiting      (keeps position; order advances — ShipperRequest goes to next driver)
any ──checkout/override──> removed      (audit logged)
```

## 7. Dispatch rules (per new order for a queue organization's queue)

1. Consider only entries with `status = 'waiting'` for the same
   `(queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId)` as the order's
   vehicle type — the type is resolved per entry via
   `VehicleDriver.vehicleUniqueId → Vehicle.vehicleTypeUniqueId`.
2. Pick the lowest `queueNumber` → create the `ShipperRequest` for this order,
   link the entry via `shipperRequestUniqueId`, create a JourneyDecision
   (`requested`), and notify **only that driver** (driver contact via
   `VehicleDriver.driverUserUniqueId`).
3. Start the offer timer (3 min). On:
   - **accept** → entry `loaded` + journey proceeds normally;
   - **reject** → cancel that decision, **order advances** to the next-lowest
     number in that vehicle type's queue; the driver's entry stays `waiting`;
   - **timeout** → treat as implicit reject (advance order, driver keeps
     position). Recommend notifying the silent driver that they lost the order.
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
  `queue_removed`, `queue_org_approved`, `queue_org_updated`.
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

- **Timer UX:** on timeout the order advances and the entry returns to `waiting`; the
  silent driver is not pushed a dedicated "you lost order X" notice yet.
- **Daily reset:** confirm reset at midnight _local time at the queue org's site_.
- **Re-entry:** a driver who loaded may re-check-in the same day → new number at
  the back. Confirm allowed.
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
