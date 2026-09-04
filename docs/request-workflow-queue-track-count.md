# Dynamics Transport — Request Workflow, Queue, Live Track & Counts

**Version:** 1.0 | **Last Updated:** September 3, 2026
Focuses on the **end-to-end shipment workflow** (creation → bid → load → proof of load/delivery → completion), **queue management**, **live tracking**, and **status counts**. Complements the higher-level [PLATFORM_FLOW_GUIDE.md](../PLATFORM_FLOW_GUIDE.md).

---

## Table of Contents

1. The Core Concepts
2. Roles and Their Relationship
3. How a Request Flows (Individual / FIFO)
4. How a Request Flows (Company Bid)
5. The Shipping Pipeline (Load → Delivery)
6. Proof of Load & Proof of Delivery (POD)
7. Queue Management (Busy Ports)
8. Street Pickup (Driver-Initiated)
9. Nearest Matching (Shipper-Initiated)
10. Live Tracking
11. Status Counts (Dashboard Badges)
12. The Full Table-Relationship Workflow
13. Key Code Locations

---

## 1. The Core Concepts

This platform connects **shippers** (people with cargo) to **drivers** or **companies** (people with trucks). At its heart is a **ShipperRequest** — one order for one vehicle-load of goods — which moves through a **status machine** as it is matched, negotiated, loaded, transported, and delivered.

| Concept | Meaning |
|---------|---------|
| **ShipperRequest** | A single order = one vehicle slot of cargo |
| **ShipperRequestBatch** | Groups N ShipperRequests that share the same origin/destination/item. One batch = one "create request" call |
| **JourneyDecision** | The link between one ShipperRequest and one DriverRequest. Records who matched them and at what price |
| **DriverRequest** | A driver's copy of an order they were offered |
| **Journey** | The physical trip record (start GPS, end GPS, fare, route points) |
| **QueueOrganization** | A loading place (port/factory/depot) that runs a FIFO dispatch queue |
| **TransportCompany** | A fleet operator that can bid on bulk batches and assign drivers |

### The request `requestMode` (three dispatch strategies)

| Mode | What it means | Who gets the order |
|------|---------------|--------------------|
| `individual_target` | Normal single-vehicle request | Nearest driver (distance) **or** FIFO queue driver |
| `company_target` | Bulk batch for fleet bidding | Companies bid; shipper picks winner |
| `queue_driver_bid` (planned) | Busy-port competitive bidding | All queued drivers bid above/below base price |

A request also carries:
- `queueOrganizationUniqueId` → if set, the order is dispatched by **queue position (FIFO)** instead of distance.
- `targetCompanyUniqueId` → if set, only that company can bid.

**Key rule:** If `queueOrganizationUniqueId` is present the request uses the **queue FIFO** matcher. If absent it uses **distance matching**. If `requestMode === "company_target"` it uses **company bidding** (and short-circuits individual request creation entirely — see §4).

---

## 2. Roles and Their Relationship

| Role | Role ID | What they do | Related tables |
|------|---------|--------------|----------------|
| **Shipper** | 1 | Posts cargo, accepts driver offers / company bids, rates | `ShipperRequest`, `ShipperRequestBatch` |
| **Driver** | 2 | Receives orders, loads, delivers, submits POD | `DriverRequest`, `Journey`, `DriverQueue` |
| **Admin** | 3 | Reviews docs, manages users/companies, adjudicates | `UserRoleStatusCurrent`, `TransportCompany` |
| **Super Admin** | 6 | Platform-wide control via API | everything |
| **Company Admin** | 7 | Manages fleet, bids, assignments | `CompanyMembership`, `CompanyVehicle`, `CompanyBidRequest` |
| **Company** (entity) | 8 | Entity owner for company documents | `TransportCompany` |
| **Dispatcher** | 10 | Assigns drivers to accepted bids | `CompanyBidVehicleAssignment` |
| **Queue Org Admin** | 11 | Runs the FIFO dispatch queue | `QueueOrganization`, `DriverQueue`, `QueueAuditLog` |

### How roles relate to each other

```
                     ┌────────────────────────────────────────────┐
                     │  QueueOrganization (a loading place)       │
                     │  ┌────────────────────────────────────────┐ │
   USER (roleId 11) ──┤  QueueOrganizationMembership  → QueueOrg │ │
                     │  └────────────────────────────────────────┘ │
                     └────────────────────────────────────────────┘

                     ┌────────────────────────────────────────────┐
                     │  TransportCompany (a fleet)                │
                     │  ┌────────────────────────────────────────┐ │
   USER (roleId 8,7,10,2) ─ CompanyMembership → companyRole       │ │
                     │  └────────────────────────────────────────┘ │
                     └────────────────────────────────────────────┘

   USER (roleId 1) ── ShipperRequest ──┐
   USER (roleId 2) ── DriverRequest ───┴─ JourneyDecision ── Journey
```

- A **driver** can be a member of a company **and** simultaneously check into a queue — the two systems are independent.
- A **shipper** is linked to a queue via `QueueOrganizationMembership.roleId=1` so they can post orders into that queue.
- `QueueOrganization` and `TransportCompany` have **no direct FK** — they are bridged only through `ShipperRequest.queueOrganizationUniqueId` and `ShipperRequestBatch` (see planned queue-bid integration in `docs/QueueBiddingSystem.md`).

---

## 3. How a Request Flows (Individual / FIFO)

This is the default `individual_target` flow — a shipper posts a single-vehicle load.

### 3.1 Creation & routing (`Services/ShipperRequest/create.service.js`)

```
Shipper POSTs a request (with requestMode=individual_target)
        |
        v
Create / update ShipperRequestBatch header
        |
        v
Create N individual ShipperRequest rows (status = waiting / 1)
        |
        v  Does the request have queueOrganizationUniqueId?
        |
   YES ──────────────► Queue FIFO dispatch (§3.2)
   NO  ──────────────► Distance matching (§3.3)
```

**Queue routing** — the order is offered, one at a time, to the **front waiting driver** of that vehicle type. Sequential (not parallel) so each offer advances the queue and fills distinct slots.

**Distance routing** — the system finds the nearest available drivers within radius and creates a `JourneyDecision` with `decisionBy: "shipper"` for each, then notifies them.

### 3.2 Queue FIFO dispatch (`Services/DriverQueue.service.js`)

The queue is a **virtual waiting line** — `DriverQueue` entries per `(queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId)` with a `queueNumber` (1, 2, 3…).

**Candidates are selected by queue position:**

```
Order arrives for vehicleType T
        |
        v
SELECT front waiting entry FOR UPDATE
   ORDER BY queueNumber ASC
        |
        filters applied:
        - skip drivers reserved for a DIFFERENT shipper (targetedShipperUserUUID)
        - skip drivers who already refused this exact order
        - skip drivers holding an active offer elsewhere
        |
        v
Create JourneyDecision (status = requested / 2)
Update queue entry -> status 'requested'
Notify driver (queue_order_offered) + shipper
```

**Driver life inside the queue (`DriverQueue.status`):**

```
        ┌──────────────┐   offer sent   ┌────────────┐
        │   waiting    │ ─────────────► │  requested │
        └──────────────┘                └─────┬──────┘
             ▲                                │
             │  re-queue / next order         ├─ accept ──► agreed (leaves line)
             │                                ├─ reject ──► notagreed (keeps position)
             │                                └─ timeout ─► notagreed (keeps position)
             │                                             
   checkout / journey complete ────────────► removed
```

- **`notagreed`**: driver keeps their queue position and stays eligible for the **next** order.
- **Refusal policy**: after `QUEUE_REFUSAL_LIMIT` (default 3) refusals, the driver is moved to the **back of the line** and the counter resets.
- **Offer window**: if a driver doesn't respond within `QUEUE_OFFER_WINDOW_MINUTES` (3 min), the offer is auto-released (`rejectedByDriver`), the entry goes `notagreed`, and the order advances to the next driver.
- **Queue overlay actions** (Queue Org Admin): manual check-in, override an entry, remove an entry, manual dispatch (by type / by entry / by driver phone), view entry history. Each action writes a `QueueAuditLog`.

### 3.3 Negotiation & acceptance

**Queue orders are FIXED PRICE** — the driver accepting jumps straight to `acceptedByShipper (4)` and a `Journey` is created immediately (`promoteToAcceptedByShipperAndCreateJourney`).

**Distance orders are negotiable** — the driver must supply `shippingCostByDriver` (their bid):

```
requested (2)
   |
   v driver accepts with price → acceptedByDriver (3)
   |
   v shipper picks the winning driver → acceptedByShipper (4)
   |       (all other connected drivers → notSelectedInBid / 17)
   |
   v Journey created at start
```

---

## 4. How a Request Flows (Company Bid)

For **bulk** loads (10+ vehicles) or when the shipper explicitly wants fleet competition, `requestMode: "company_target"` is used.

```
Shipper posts batch (totalVehicles: N, requestMode=company_target)
        |
        v
ONLY a ShipperRequestBatch header is created (status waiting / 1)
   (individual ShipperRequest rows are DEFERRED — created lazily later)
        |
        v
Companies see the batch (GET /api/company/bids?target=available)
Company submits a bid (CompanyBidRequest, bidStatus=submitted)
   - one bid per company per batch (UNIQUE)
   - must cover the FULL batch (no partial bids)
        |
        v
Shipper reviews bids → ACCEPTS one (accepted_by_shipper)
        |
        v
N ShipperRequest rows are bulk-created, status acceptedByShipper (4)
   (all other company bids → rejected_by_shipper)
        |
        v
Company dispatcher assigns a driver + vehicle to each slot
   (CompanyBidVehicleAssignment; auto-creates DriverRequest per slot)
        |
        v
Each slot progresses through the loading pipeline (§5), 
   and on completion the journey is billed to the COMPANY,
   not the driver (no individual commission deduction)
```

**Cancellation on the company side** (if a company cancels *after* the shipper already accepted) triggers a **commission evasion** report.

> **Planned** — queue + bid integration for busy ports so a single queue can host FIFO, individual-driver-bid, and company-bid in parallel. See `docs/QueueBiddingSystem.md`.

---

## 5. The Shipping Pipeline (Load → Delivery)

Once a deal is accepted, the physical work proceeds through stages. Each stage records the driver's GPS and a `JourneyRoutePoint`, and notifies the shipper in real time.

```
acceptedByShipper (4)
      │  driver confirms heading to loading place
      ▼
goToLoadingPlace (5)        ← driver going to loading/port
      │  driver arrives, loading begins
      ▼
loading (6)                 ← cargo being loaded
      │  loading done, ready to depart
      ▼
loaded (7)                  ← accepts optional Proof-of-Loading photos/docs
      │  driver starts the trip (records starting GPS)
      ▼
journeyStarted (8)          ← in transit (live tracking active)
      │  driver completes (records completing GPS)
      ▼
journeyCompleted (9)        ← earnings + commission/subscription settled
```

**Two ways the physical pipeline is born:**

1. **Queue / company orders** — `Journey` is created at `acceptedByShipper (4)` with the agreed `fare` (the price is known up front).
2. **Nearby-match individual orders** — `Journey` is created at `startJourney` (the first GPS-tracked moment).

The three **loading stages** (5, 6, 7) are configured in `Journey/journeyManagement.service.js` (`LOADING_STAGE_CONFIG`). Proof-of-loading attachments are accepted **only** on the final stage (`loaded`) and merged into `Journey.journeyProofOfLoading`.

### Settlement on completion (`completeJourney`)

```
journeyCompleted (9)
   |
   +-- Is it a company flow?
   |     (decisionBy=company OR company_target OR active company assignment)
   |     YES ──► billed to company; no driver commission
   |
   +-- Does the driver have an active subscription?
   |     YES ──► no commission deducted
   |
   +-- otherwise:
         credit driver balance with the fare
         create a Commission on the fare
   |
   +-- if isPodRequired=false → auto-confirm POD (AUTO_NO_POD)
   |
   +-- if queue order → closeEntryOnJourneyCompletion (driver leaves the queue)
```

---

## 6. Proof of Load & Proof of Delivery (POD)

**POD** is the platform's delivery-confirmation evidence, stored in `DeliveryConfirmations` + `DeliveryConfirmationPhotos`. The **requirement** is controlled by `isPodRequired` on both `ShipperRequest` and `ShipperRequestBatch`.

### POD sources

| Source | Who | When | Status |
|--------|-----|------|--------|
| `FORMAL_POD` | driver | Submits photos + GPS + receiver info + shipper signature → then shipper settles with an OTP | starts `PENDING` → settles to `CONFIRMED` |
| `SHIPPER_DIRECT` | shipper | Shipper submits + self-confirms in one step | `CONFIRMED` immediately |
| `RECEIPT_AUTO` | driver | Receipt photos after a completed journey | `CONFIRMED` immediately |
| `AUTO_NO_POD` | system | On completion when `isPodRequired=false` | `CONFIRMED` automatically |

### POD state machine

```
NONE ──► PENDING ──► CONFIRMED   (immutable once confirmed; tamper-proofed)
              │
              └──► DISPUTED ──► CONFIRMED   (admin re-settle only)
```

- Confirmation uses a bcrypt-hashed 6-digit OTP (10-min TTL, max 5 attempts, hourly cap) and a SHA-256 hash chain for audit.
- Once `CONFIRMED`, signed fields cannot change except by admin.
- A driver late can still append photos (idempotent, no overwrite).
- One POD record per journey (UNIQUE `journeyUniqueId`).

---

## 7. Queue Management (Busy Ports)

The queue system is for **busy loading places** (ports, factories, cement, depots) where FIFO fairness matters. See `docs/queue-dispatch-design.md` and `docs/queue-tables-access.md` for deeper details.

### Key flow — driver check-in

```
Driver check-in (POST /api/queue/driver/checkin)
   |
   +-- resolve targeted shipper (if phone given)
   +-- org must exist + be approved + queueEnabled=true
   +-- proximity: within checkinRadiusKm (Haversine) if a radius is set
   +-- active-journey fence: if driver already on an active trip, block
   +-- one-queue-per-day fence: 
         - already in THIS queue today → idempotent re-check-in
         - already in ANOTHER queue today → 409 conflict
         - else → create DriverQueue entry with next queueNumber
   |
   v
Auto-scan pending orders of that vehicle type and offer the newest
   |
   v
Notify Queue Org Admins (queue_position_changed) + targeted shipper
```

### Queue Org Admin actions

| Action | Route | Purpose |
|--------|-------|---------|
| Check-in driver manually | `POST /api/queue/manualCheckin` | Put driver in the line |
| View status board | `GET /api/queue/status` | All entries grouped by vehicle type |
| Override an entry | `PATCH /api/queue/entry/:queueUniqueId/override` | Change position/status |
| Remove an entry | `DELETE /api/queue/entry/:queueUniqueId` | Take driver out of line |
| Manual dispatch | `POST /api/queue/dispatch` | Offer order by type / entry / driver phone |
| View entry history | `GET /api/queue/entry/:queueUniqueId/history` | Full audit of queue changes |

### Queue organization lifecycle

```
Admin creates QueueOrganization (approvalStatus=pending)
   |
   v  Admin/SuperAdmin approves (POST .../approve) → set queueEnabled=true
   |
   v  QueueOrgAdmin adds members (QueueOrganizationMembership, roleId 11)
   |
   v  Drivers check in daily; FIFO dispatch runs
```

Every mutate action on a queue entry is recorded in `QueueAuditLog` (immutable) and `DriverQueueHistory` (column-level `oldValue` changes).

---

## 8. Street Pickup (Driver-Initiated)

Street pickup (`takeFromStreet`, `Services/DriverRequest/actionTakeFromStreet.service.js`) is the **only flow with no matching** — the driver is already physically with the goods, so the trip is registered directly.

```
Driver finds shipper's goods on the street
   |
   v
Verify driver has no active trip
   (if a pending/waiting request exists → it's auto-cancelled first)
   |
   v  In ONE atomic transaction:
   +-- create the shipper as a new user
   |     (email is generated: fakeEmail_<random>@shipper.com)
   +-- create ShipperRequest  → status 8 (journeyStarted) — goods already picked up
   +-- create DriverRequest  → status 8 (journeyStarted)
   +-- create JourneyDecision → decisionBy: "driver"
   +-- create Journey → already started AND completed, fare 0
   +-- capture origin route point
   |
   v
Send SMS to the shipper
   |
   v
Return shipper + driver (with vehicle tariff rate) + journey + decision
```

**Key characteristics:**
- Starts directly at **status 8** — it skips the whole waiting→requested→accepted negotiation.
- The journey start GPS uses the driver's current location (`currentLocation ?? originLocation`).
- `shippingCostByDriver` is taken straight from the request body.
- Everything (user + request + decision + journey + route point) is **one atomic transaction** — all succeed or all roll back (no orphaned users/records).

### Contrast with matching flows

| | Street pickup | Nearby matching | Queue FIFO |
|---|---|---|---|
| Who initiates | Driver | Shipper | Shipper (order) |
| Matching | None (already chosen) | Distance + type within 10 km | Queue position |
| Starting status | 8 (journeyStarted) | 1 → 2 (requested) | 4 (acceptedByShipper) |
| Price | From street body | Negotiated | Fixed |
| Queue involvement | No | No | Yes |

---

## 9. Nearest Matching (Shipper-Initiated)

Nearest matching is the **default dispatcher for normal `individual_target` requests that have no `queueOrganizationUniqueId`**. When a shipper posts a request, the system finds the nearest free drivers of the matching vehicle type.

### The matcher (`CRUD/Read/ReadData.matching.js` → `findNearbyDrivers`)

```
Shipper posts request (status waiting / 1, no queue org)
   |
   v
findNearbyDrivers:
   - bounding-box pre-filter on origin lat/lng
   - exact Haversine great-circle distance
   - MAX_RADIUS_KM = 10
   - DriverRequest.journeyStatusId = 1 (waiting)
   - active vehicle assignment (VehicleDriver.assignmentStatus = 'active')
   - matching vehicle type
   - ORDER BY distanceKm ASC, driverRequestId ASC (FIFO tiebreaker)
   - HAVING distanceKm <= 10
   - skip drivers who already refused this request
   - LIMIT → up to 5 drivers offered
   |
   v
handleWaitingRequest (statusVerification.service.js):
   - re-verify each driver is still available (race-condition guard)
   - create a JourneyDecision per driver (status requested / 2, decisionBy: "shipper")
   - update ShipperRequest + DriverRequest → requested (2)
   - notify each driver (messageType: driver_found_shipper_request)
```

**Guards in the matcher:**
- **Queue orders are excluded** — `findNearbyDrivers` returns `[]` if `queueOrganizationUniqueId` is set; queue orders are FIFO-dispatched only.
- **Company-target orders are excluded** — they short-circuit in `create.service.js` before reaching matching.

### The two directional matchers

| Function | Direction | Finds |
|----------|-----------|-------|
| `findNearbyDrivers` | order → drivers | Nearest free drivers for a shipper's request (order by distance, up to 5) |
| `findNearbyShippers` | driver → shippers | Waiting/requested/accepted nearby shipper requests (for driver-scan / availability) |

Both use the same 10 km Haversine technique with a bounding-box pre-filter.

---

## 10. Live Tracking

Location flows in **two directions** over WebSocket (Socket.IO), and is also persisted as historical route points.

### Socket events (`Config/SocketAdapter.config.js`)

| Event | Direction | Meaning |
|-------|-----------|---------|
| `locationUpdateToShipper` | Driver → Shipper | Driver streams live GPS during a trip |
| `locationUpdateToDriver` | Shipper → Driver | Shipper sends GPS to driver |

### The streamed payload (`sendUpdatedLocation`)

```
Driver app calls PATCH ... (sendUpdatedLocation) with:
   { journeyDecisionUniqueId, latitude, longitude, userUniqueId }
   |
   v
Validations:
   - coordinate ranges (lat -90..90, lng -180..180)
   - driver owns the journey decision
   - journey is in an ACTIVE status (4,5,6,7,8)
   |
   v
Persist a JourneyRoutePoint
   |
   v
Notify the shipper (messageType: update_drivers_location_to_shipper)
```

### When tracking is captured beyond streaming

Every **loading stage** and **journey start/complete** also records the GPS and pushes a live mirror to the shipper (`locationUpdateToShipper`), so the shipper's map shows the truck even at stage boundaries. The shipper's `journeyStartingLat/Lng` and `journeyCompletingLat/Lng` become the blue-line on the map.

### Socket rooms for the queue

- `queueOrg:{queueOrganizationUniqueId}` — org-wide broadcasts
- `queueOrg:{queueOrganizationUniqueId}:{queueDate}` — day-specific room

Drivers subscribe via `queue:subscribe` when they want real-time queue updates.

---

## 11. Status Counts (Dashboard Badges)

The shipper dashboard shows how many of their requests are in each state. This is computed by `checkActiveShipperRequest` → `getActiveRequestsCount` (`CRUD/Read/ReadData.shipper.js`).

### The individual + company breakdown

```js
{
  totalCount,                       // all active + terminal-but-unseen
  waiting:      { individual, company },   // status 1 / company batch waiting
  requested:    { individual, company:0 }, // status 2 (offered)
  bidding:      { individual, company },   // individual=status 21 (planned), company=batch bidding
  acceptedByShipper: {
     individual,                            // status 4
     company: {                             // pipeline of all slots under the won bid
        notAssigned, needsReassignment,     // free / needs new driver
        assigned,                           // vehicle: driver notified
        driverConfirmed,                    // vehicle: confirmed / loading
        journeyStarted,                     // vehicle: in transit
        completed,                          // vehicle: delivered
        ongoingVehicles, batchCount, total
     }
  },
  journeyStarted:   { individual, company },  // status 8
  notSeenCompleted: { individual, company },  // status 9, not yet seen
  notSeenCancelledByDriver: { individual, company }, // status 12, not yet seen
}
```

### What each counter reflects

| Badge | Counts |
|-------|--------|
| **Waiting** | requests at status 1 (still looking for a driver) / company batches awaiting bids |
| **Requested** | individual requests status 2 (driver offered, not accepted) |
| **Bidding** | individual = `bidding` status (21, planned for queue-driver bid); company = batches in auction |
| **Accepted** | individual status 4; company = full **vehicle-slot pipeline** after a bid is won |
| **Journey started** | individual status 8; company = slots in transit |
| **Not seen completed** | status 9 journeys the shipper hasn't acknowledged |
| **Not seen cancelled by driver** | status 12 cancellations the shipper hasn't seen |

**Note on counts:** individual counts come from the `ShipperRequest` table; **company** counts come from `ShipperRequestBatch` (batch-level: waiting/auction/ongoing sums of `totalVehicles`) plus slot-level joins from `CompanyBidVehicleAssignment`.

---

## 12. The Full Table-Relationship Workflow

This is how the core tables connect as a shipment moves through the platform. It shows the **flow of a request** through creation, matching/bidding, loading, delivery, and settlement — plus which tables register each event.

### The shipment spine (core journey)

```
                           ┌──────────────────────┐
                           │   ShipperRequestBatch │  groups N orders (one create call)
                           └───────────┬──────────┘
                                       │ 1:N (shipperRequestBatchUniqueId)
                                       v
        ┌──────────────────────────┐
        │      ShipperRequest      │  one order = one vehicle slot  (status machine)
        └────────────┬─────────────┘
                     │ 1:N (shipperRequestId on JourneyDecisions)
                     v
   ┌──────────────────────────────┐
   │       JourneyDecision         │  the match link: order ↔ driver ↔ price
   └──────┬───────────────┬───────┘
          │               │
   (driverRequestId)      │
          v               v (journeyDecisionUniqueId)
   ┌──────────────┐  ┌──────────────────┐
   │ DriverRequest │  │      Journey      │  the physical trip
   └──────────────┘  │  starting/completing GPS, fare,
                     │  route points, proof-of-loading
                     └────────┬─────────┘
                              │ (journeyUniqueId)
                              v
                     ┌──────────────────────┐
                     │ DeliveryConfirmations │  POD + photos
                     └──────────────────────┘
```

### Table cascade by workflow stage

| Stage | Tables written | Key link fields | Notes |
|-------|----------------|-----------------|-------|
| **Shipper posts** | `ShipperRequestBatch`, `ShipperRequest` | batch → `shipperRequestBatchUniqueId` (1:N) | Batch header + N order rows |
| **Queue check-in** | `QueueOrganizationMembership`, `DriverQueue`, `QueueAuditLog` | `DriverQueue.queueOrganizationUniqueId`, `vehicleDriverUniqueId` | One entry per vehicle/day/type |
| **FIFO dispatch** | `DriverQueue`, `ShipperRequest`, `DriverRequest`, `JourneyDecision` | `DriverQueue.shipperRequestUniqueId`; `JourneyDecision.shipperRequestId↔driverRequestId` | Offers front driver; entry → `requested` |
| **Distance match** | `JourneyDecision`, `ShipperRequest`, `DriverRequest` | `JourneyDecision.shipperRequestId↔driverRequestId` | decisionBy = `shipper` |
| **Company bid** | `ShipperRequestBatch`, `CompanyBidRequest`, `CompanyBidVehicleAssignment` | `CompanyBidRequest.shipperRequestBatchUniqueId`; assignment → `companyBidRequestUniqueId` + `shipperRequestUniqueId` | Company wins → SR rows lazily created |
| **Driver accepts / deal** | `DriverRequest`, `JourneyDecision`, `ShipperRequest`, `Journey`, `DriverQueue` | `Journey.journeyDecisionUniqueId`; queue entry → `agreed`/`notagreed` | Queue/company: born at status 4 |
| **Loading stages** | `Journey`, `JourneyRoutePoints` | `JourneyRoutePoints.journeyDecisionUniqueId` | 5 → 6 → 7; proof-of-loading on 7 |
| **Start journey** | `Journey`, `JourneyRoutePoints` | start GPS + route point | status 8 |
| **Live tracking** | `JourneyRoutePoints`, socket | route point per GPS point | streamed to shipper |
| **Complete journey** | `Journey`, `JourneyRoutePoints`, `UserBalance`, `Commission`, `CompanyCommission`, `DriverQueue` | `Journey.journeyCompletedAt`, `journeyCompletingLat/Lng` | settle fare + commission; close queue slot |
| **POD** | `DeliveryConfirmations`, `DeliveryConfirmationPhotos` | `DeliveryConfirmations.journeyUniqueId` | POD sources (§6) |
| **Rate / settle** | `Ratings`, `CompanyRating`, `UserBalance` | `Ratings.journeyDecisionUniqueId` | after `seenByShipper` |

### Relationship web (users ↔ organizations ↔ orders)

```
 Users ──┐
         ├─ UserRole ── Roles                        (a user has many roles: 1,2,3,...11)
         ├─ CompanyMembership ─ TransportCompany     (role 8/7/10/2 → company fleet)
         │      └─ CompanyVehicle ─ Vehicle ─ VehicleTypes
         ├─ QueueOrganizationMembership ─ QueueOrganization
         │      └─ DriverQueue ── VehicleDriver      (role 11 admin / role 1 shipper)
         └─ VehicleOwnership ─ Vehicle ─ VehicleTypes (individual owner-drivers)

 Companies ── CompanyBidRequest ── ShipperRequestBatch
   │                │
   └── CompanyBidVehicleAssignment ── { ShipperRequest, Vehicle, DriverRequest, JourneyDecision }
```

**Notes on integrity:**
- `JourneyDecision` is the central pivot: `shipperRequestId ↔ driverRequestId` (1:1 driver per decision), plus `JourneyDecisions.decisionBy` tracking who made the match (`shipper`/`driver`/`admin`/`queue`/`company`).
- `QueueOrganization` and `TransportCompany` have **no direct FK** — they connect only through `ShipperRequest`/`ShipperRequestBatch` (a queue order can become a company bid, and vice versa, via the planned queue-bid bridge).
- Some cross-table links (e.g. `ShipperRequest.shipperRequestBatchUniqueId`, `CompanyBidRequest.shipperRequestBatchUniqueId`) are enforced at the **application layer** rather than as DB FKs (table-definition ordering); see comments in `Database/Database.js`.

---

## 13. Key Code Locations

| Concern | File |
|---------|------|
| Request routing (queue vs distance vs company) | `Services/ShipperRequest/create.service.js` |
| Status machine / status map | `Utils/ListOfSeedData.js` (lines 718–766) |
| Multi-table status propagation | `Services/JourneyStatus/update.service.js` |
| Driver accepts an order (queue/company short-circuit) | `Services/DriverRequest/actionAcceptShipperRequest.service.js` |
| Shipper picks a driver | `Services/ShipperRequest/actionAccept.service.js` |
| Journey born at accept (queue/company) | `Services/Journey/promoteAcceptedJourney.service.js` |
| Loading stages (5/6/7) + start + complete | `Services/Journey/journeyManagement.service.js` |
| Queue FIFO dispatch core | `Services/DriverQueue.service.js` (`offerToDriver`, `checkin`, `dispatch`, `applyRefusalPolicy`) |
| Refusal / queue position policy | `Services/DriverQueue.service.js` (`applyRefusalPolicy`) |
| Street pickup | `Services/DriverRequest/actionTakeFromStreet.service.js` |
| Nearest matching | `CRUD/Read/ReadData.matching.js` (`findNearbyDrivers` / `findNearbyShippers`), `Services/ShipperRequest/statusVerification.service.js` (`handleWaitingRequest`) |
| Company bid lifecycle | `Services/CompanyBid/` (`bidCreate`, `bidUpdate`, `bidRead`, `bidDelete`) |
| POD system | `Services/DeliveryConfirmation.service.js` |
| Live tracking | `Services/Journey/journeyManagement.service.js` (`sendUpdatedLocation`), `Services/JourneyRoutePoints.service.js` |
| Counts / badges | `CRUD/Read/ReadData.shipper.js` (`getActiveRequestsCount`) |
| Socket events | `Config/SocketAdapter.config.js`, `Utils/QueueSocket.js` |
| Queue org + admin | `Services/QueueOrganization.service.js` |
| Roles & auth middleware | `Middleware/VerifyToken.js`, `Middleware/VerifyUsersIdentity.js`, `Utils/ListOfSeedData.js` |
| Database schema | `Database/Database.js` (77 tables) |
