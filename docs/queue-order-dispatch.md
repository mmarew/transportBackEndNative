# Queue Order Dispatch — "Shipper at the factory needs 1 or N vehicles"

> Operational runbook. **No new API is required** — the existing order engine +
> queue engine already implement this flow. Design rationale lives in
> [queue-dispatch-design.md](queue-dispatch-design.md) (esp. §2 steps 3–4, §8–9);
> the generic order API is documented in [shipper-operations.md](shipper-operations.md).
>
> Flow map of the code that runs: `Services/ShipperRequest/create.service.js`
> (Step 2a → `handleQueueDispatch`) → `Services/DriverQueue.service.js`
> (`offerToDriver` → `ensureWaitingDriverRequest` → `createQueueOffer`).
> Check-in retry: `DriverQueue.service.js` `checkin` → `rescanPendingQueueOrder`
> → `handleQueueDispatch` (re-offers the oldest pending order to the front
> waiting driver of the checked-in driver's vehicle type).
>
> Status: creation-time dispatch is **live**. The check-in auto-offer for orders
> that outlived an empty queue (§5, agreed design) is **implemented**
> (`checkin` → `rescanPendingQueueOrder` → `handleQueueDispatch`).

## 1. The scenario

A shipper walks into the factory (a **QueueOrganization** like Mojo Kaliy /
National Cement) and says _"I need 1 vehicle"_ or _"I need N vehicles."_ The
queue admin (role 11) has a line of drivers already checked in, grouped by
vehicle type:

```
VehicleType: Isuzu FSR          VehicleType: Sino Truck
  pos1  D7   (joined 08:01)       pos1  D3   (joined 08:04)
  pos2  D12  (joined 08:10)       pos2  D9   (joined 08:22)
  pos3  D21  (joined 08:33)       pos3  D15  (joined 08:40)
```

The rule is **FIFO within a vehicle type**: the order is always offered to the
**front** waiting driver (lowest `queueNumber`) of the order's
`vehicleTypeUniqueId`. The queue admin does **not** hand-pick a driver — the
ticket machine decides who is next.

## 2. Which API to use

Use the existing order endpoint — the same one a shipper app / call-in uses:

```
POST /api/shipperRequest/createRequest
```

with `queueOrganizationUniqueId` set. The queue dispatch is triggered
automatically when the request is created; nothing else needs to be called.

**No new endpoint is needed.** `POST /api/queue/dispatch` exists only as a
_manual re-offer_ for an order that is still `waiting` because the queue was
empty or every driver rejected (see §5).

### Who can place it

`createRequest` only requires a valid token (`verifyTokenOfAxios`), so both:

- a **shipper** (role 1) linked to the queue organization, and
- the **queue admin** (role 11, placing it on the shipper's behalf)

can create the order. The org must be `approved` + `queueEnabled = 1`, otherwise
dispatch rejects with `403`.

### Example request body (1 vehicle)

```json
{
  "shipperRequestBatchUniqueId": "batch-0001...",
  "numberOfVehicles": 1,
  "shippingDate": "2026-08-07",
  "deliveryDate": "2026-08-08",
  "shippingCost": 12000,
  "shippableItemQtyInQuintal": 40,
  "shippableItemName": "Cement",
  "requestMode": "individual_target",
  "queueOrganizationUniqueId": "qorg-0001...",
  "vehicle": { "vehicleTypeUniqueId": "isuzu-fsr..." },
  "originLocation": { "latitude": ..., "longitude": ..., "description": "Factory gate" },
  "destination": { "latitude": ..., "longitude": ..., "description": "Addis warehouse" }
}
```

`numberOfVehicles: N` creates **N ShipperRequest rows** under the same batch; each
row is dispatched independently, so **N orders → N front drivers get one offer
each** (see §4).

## 3. What records get created (the chain)

When the order is placed against a queue organization, the backend runs, per
ShipperRequest row:

```
ShipperRequestBatch            one header (auto-upserted), shared order details
   └── ShipperRequest × N      one row per vehicle (status: waiting → requested)
          └── DriverQueue       front driver's entry: waiting → requested, shipperRequestUniqueId linked
                └── DriverRequest
                      └── JourneyDecisions   requested, decisionBy = 'shipper'
```

| Record                | Created by                                               | Notes                                                                                                                                   |
| --------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ShipperRequestBatch` | `create.service.js` Step 1a (`batchService.upsertBatch`) | header with totalVehicles, origin/destination, cost, dates                                                                              |
| `ShipperRequest` × N  | Step 1 (`numberOfVehicles - rowsAlreadyInBatch`)         | `queueOrganizationUniqueId` set, status `waiting` → `requested`                                                                         |
| `DriverRequest`       | `ensureWaitingDriverRequest`                             | reuses the driver's`waiting` request if it has **no** linked decision, else inserts a fresh one (origin = queue org's site)             |
| `JourneyDecisions`    | `createQueueOffer`                                       | `journeyStatusId = requested`, `decisionBy = 'shipper'`; `JourneyDecisions.driverRequestId` is UNIQUE (one decision per driver request) |
| `DriverQueue` update  | `offerToDriver`                                          | `status='requested'`, `requestedAt`, `shipperRequestUniqueId`                                                                               |

After that the **existing accept/reject/timeout engine takes over** — queue
dispatch only decides _which driver_ gets the offer; the journey lifecycle is
unchanged.

## 4. Assignment: how one / N drivers get picked

For each of the N ShipperRequest rows, `offerToDriver` (the same function used by
manual `dispatch`) does:

1. Finds the **lowest `queueNumber`** entry where `status IN ('waiting','notagreed')`,
   same queueOrganizationUniqueId, same queueDate, same vehicleTypeUniqueId.
2. Skips a driver who is already holding an active offer elsewhere
   (`ensureWaitingDriverRequest` returns null) — advance to the next in line.
3. Marks the entry `requested`, links the order, creates the JourneyDecision, and
   notifies **only that driver** (SMS/push, contact via `VehicleDriver`).
4. Starts the **3-minute offer window** (`QUEUE_OFFER_WINDOW_MINUTES`).

```
Queue: D1(pos1)  D2(pos2)  D3(pos3)   ← one vehicle type

Order (N=1) ──offer──> D1 ──rejects──> offer to D2 ──accepts──> D2 agreed (leaves queue)
Order (N=2) ──offer──> D1 (still pos1) ──accepts──> D1 agreed
            ──offer──> D3 (new front) ──accepts──> D3 agreed
```

Key behaviors:

- **Reject / timeout (3 min)** → the _order_ advances to the next driver in line;
  the rejecting driver **keeps their position** for the next order (entry `notagreed`).
- **Accept** → `markEntryAgreed`: entry becomes `agreed` and leaves the queue.
- **Driver agreed (left the line) may re-check-in** the same day → new number at the back.
- **Empty queue / everyone rejected** → the order stays `waiting`, `offered:false`.
  It is **auto-offered on the next check-in** of a matching-type driver — see §5.

## 5. Order recovery: auto-offer on check-in + manual fallback

If an order is `waiting` because the queue was empty or every driver rejected:

- **Auto (primary):** when a driver checks in
  (`POST /api/driver/queue/checkin`), the backend rescans pending `waiting`
  queue orders for the same `queueOrganizationUniqueId` + `vehicleTypeUniqueId`,
  picks the **oldest** (`shipperRequestCreatedAt ASC`), and offers it to the
  **front** waiting driver of that type via `offerToDriver` — the same primitive
  used at order creation. One order per check-in; N pending orders pair with N
  matching-type check-ins.
- **Manual (fallback):** the queue admin can re-offer it to the front driver at
  any time:

```
POST /api/queue/dispatch
{
  "queueOrganizationUniqueId": "qorg-0001...",
  "vehicleTypeUniqueId": "isuzu-fsr...",
  "shipperRequestUniqueId": "sr-0001..."
}
```

## 6. Known limitations / decisions to make

| Limitation                                   | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                   | Recommendation                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **`numberOfVehicles > 9`**                   | ✅**Resolved.** `createShipperRequest` no longer requires `company_target` when `queueOrganizationUniqueId` is set — each of the N rows is offered to its own FRONT waiting driver, so N can exceed 9 (`Validations/ShipperRequest.schema.js` custom rule skips queue orders)                                                                                                                                                            | Place 10+ as one queue order; verified E2E (N=10 → 10 rows)                                           |
| **Role 11 = queue admin create**             | ✅**Resolved.** Role 11 (queue org admin) is treated like a shipper in `Controllers/ShipperRequest.controller.js` — `userUniqueId` is stamped from the token, no more `400 userUniqueId is required`                                                                                                                                                                                                                                     | Verified E2E: role-11 order placed → SR owned by the admin, dispatch offered it                       |
| **FIFO only — no picking a specific driver** | Dispatch always takes the front driver of the matching type; the queue admin cannot assign a driver out of turn                                                                                                                                                                                                                                                                                                                          | By design (dispute-proof). Turn-skipping = supervisor`override`/`remove` (audit logged), not dispatch |
| **Batch must exist**                         | `createRequest` requires `shipperRequestBatchUniqueId` and auto-upserts the batch header; the same batch can be extended with more orders until it reaches `totalVehicles`                                                                                                                                                                                                                                                               | Reuse one batch per shipper/order group; create a new`batchUniqueId` per new order                    |
| **Org must be approved + enabled**           | Otherwise`403` "Queue organization is not enabled for dispatch"                                                                                                                                                                                                                                                                                                                                                                          | Approve +`queueEnabled=1` via the QueueBoard / org manage page first                                  |
| **Offer window**                             | Fixed 3 min; timeout silently advances the order (driver not pushed a dedicated "you lost order X" notice yet)                                                                                                                                                                                                                                                                                                                           | Optional UX follow-up                                                                                 |
| **Shipper notified over socket**             | ✅**Resolved.** `notifyShipperOfQueueEvent` (`Services/DriverQueue.service.js`) resolves the owner via `ShipperRequest.shipperRequestCreatedBy → Users.phoneNumber` and emits `queue_order_offered` on offer and `queue_order_assigned` on accept (`markEntryAgreed`) to the `shipper` socket. Offline shipper / order placed by a role-11 admin (no `shipper` socket) is skipped silently — the QueueOrgAdmin rooms still get snapshots | Verified E2E: offer + accept paths run the notification without error                                 |
| **Multiple sites / gates**                   | One org = one queue; a second gate needs a new QueueOrganization                                                                                                                                                                                                                                                                                                                                                                         | Tracked in`queue-dispatch-design.md` §10                                                              |

## 7. End-to-end checklist for the queue admin

1. Org exists, `approvalStatus = approved`, `queueEnabled = 1`.
2. Drivers checked in (drivers use `POST /api/driver/queue/checkin`, or admin uses
   `POST /api/queue/manualCheckin`).
3. Shipper arrives with an order → admin (or the shipper) calls
   `POST /api/shipperRequest/createRequest` with `queueOrganizationUniqueId`,
   `vehicle.vehicleTypeUniqueId`, `numberOfVehicles`, `shippingCost`, dates, qty,
   origin/destination.
4. Watch `GET /api/queue/status` — the front driver(s) of the matching type flip
   to `requested`, then `agreed` on accept; queue order holds for rejects.
5. If an order is stuck `waiting` (empty queue), it will be auto-offered on the
   next matching-type check-in; or re-offer it now via
   `POST /api/queue/dispatch`.

## 8. Comparison: the three driver-assignment engines

The codebase has **three** ways a driver gets tied to a load. Queue dispatch is
the third; it is important not to confuse it with the other two.

| Aspect                     | `POST /api/driver/takeFromStreet`                                                                                                      | `POST /api/company/assignments/auto`                                                                                                              | **Queue dispatch** (this doc)                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source file                | `Services/DriverRequest/actionTakeFromStreet.service.js`                                                                               | `Services/CompanyAssignment/assignmentAuto.service.js`                                                                                            | `Services/ShipperRequest/create.service.js` Step 2a → `Services/DriverQueue.service.js` (`offerToDriver`)                                                   |
| Initiator                  | The**driver** found a street shipper                                                                                                   | **Dispatcher** after a company bid is `accepted_by_shipper`                                                                                       | **Shipper / queue-admin** places an order against an approved+enabled queue org                                                                             |
| Who is assigned            | The driver themself (they own the load)                                                                                                | Auto 1-to-1: next available**vehicle+driver** pair from the company's fleet                                                                       | FIFO:**front waiting driver** of the order's vehicle type (lowest `queueNumber`)                                                                            |
| Driver availability rule   | Must have no active request; a waiting/requested one is cancelled first                                                                | Two-layer: (1) no active assignment**anywhere** (`NOT IN completed/cancelled/rejected`), (2) driver must not have **already rejected this batch** | Must not be holding an active offer elsewhere —`ensureWaitingDriverRequest` returns null for a driver with a live offer, and the loop **skips to the next** |
| Records created            | `ShipperRequest` + `DriverRequest` + `JourneyDecisions` (`decisionBy='driver'`) + `Journey` + route points, all in **one transaction** | `DriverRequest` (upsert, requested) + `JourneyDecisions` + **`CompanyBidVehicleAssignment`** (`'assigned'`)                                       | N`ShipperRequest` rows + reuse-or-create `DriverRequest` + `JourneyDecisions` (`decisionBy='shipper'`); `DriverQueue` entry `waiting→requested→agreed`        |
| Dedicated assignment table | No —`JourneyDecisions` is the junction                                                                                                 | Yes —`CompanyBidVehicleAssignment`                                                                                                                | No —`DriverQueue.shipperRequestUniqueId` + `JourneyDecisions` (design decision, `queue-dispatch-design.md` §9)                                              |
| Partial assignment         | n/a (1 driver = 1 load)                                                                                                                | Assigns as many slots as the fleet allows, returns a summary of the remainder                                                                     | Each of the N orders dispatches independently; an order with an empty/short queue stays`waiting`, auto-offered on the next matching-type check-in (or re-offered via `POST /api/queue/dispatch`) |
| Confirmation model         | None — driver self-assigns, journey starts immediately                                                                                 | Offer held as`requested` until the driver explicitly confirms (→ status 4)                                                                        | Offer held as`requested` for the **3-min window**; driver accepts/rejects/times out                                                               |
| Notifications              | SMS to the shipper                                                                                                                     | FCM + WebSocket to the driver and the shipper                                                                                                     | Offer to the front driver (SMS/push) + socket`queue` events to the queue-org admins                                                                         |

### Lessons reused from the other engines

- **Two-layer availability (from `autoAssignBatch`)** is the closest analog to the
  queue's own rules: the queue fence (one active queue per driver/day) ≈ Layer 1,
  and the existing "skip already-rejected" verification
  (`VerifyIfShipperRequestWasNotRejected`) ≈ Layer 2 — a driver who rejected an
  order is not re-offered _that_ order. If "driver rejected this batch" memory is
  ever needed for queue orders, the same NOT EXISTS pattern applies.
- **`takeFromStreet` builds the whole chain (request → decision → journey) in one
  transaction** because there is no selection step — the driver _is_ the assignee.
  Queue dispatch stops at `requested` because a driver must still
  accept; the `Journey` is created later by the existing accept flow. The queue
  engine intentionally does **not** create a `Journey` at offer time.
- **If a "pick a specific driver" UI is ever required** (out-of-turn assignment),
  the queue engine deliberately does **not** do this in `dispatch` — that is what
  supervisor `override`/`remove` (audit-logged) is for. The
  `CompanyBidVehicleAssignment` record is only for the company/bid flow; queue
  dispatch is fixed-price individual.
