# Queue Refusal Policy — "Driver passed on the order"

> Status: **IMPLEMENTED**. Base behavior (order advances, driver keeps position),
> move-to-back, the **shipper-side price-rejection count**, and whole-job-cancel
> **no-count** (including when a **queue org admin** cancels) are all **live** in
> `Services/DriverQueue.service.js` (`applyRefusalPolicy` in `rejectOffer` +
> `releaseExpiredOffers`; `releaseEntryOnOrderCancel` for job cancels — see
> [queue-order-cancellation.md](queue-order-cancellation.md)). Related:
> [queue-dispatch-design.md](queue-dispatch-design.md),
> [queue-order-dispatch.md](queue-order-dispatch.md),
> [queue-order-cancellation.md](queue-order-cancellation.md).

## 1. Decision

**Terminology used here:** _penalty point_ = _refusal count_ = the
`DriverQueue.queueRefusalCount` integer. One increment = one counted refusal.

When the driver at the front of a queue line refuses (rejects or ignores) a
queue dispatch offer:

- **Baseline — the ORDER advances, the DRIVER stays.** The load is immediately
  offered to the next driver in line (same vehicle type, FIFO). The refusing
  driver keeps their queue position for the _next_ order. Removing a driver for
  one refusal is rejected (see §2).
- **Escalation — move-to-back after N refusals.** If the same driver refuses
  **N consecutive front-position offers within one queue day**, they are moved
  to the **back** of their line and their refusal counter resets. Default
  **N = 3**, configurable (`QUEUE_REFUSAL_LIMIT`, see §5).

One refusal = "I pass on _this_ order", never "I lose my turn". Repeated
refusals = the driver is farming the front position without serving, so the
line is corrected.

| Case                                                                                  | Action                                                   |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Driver rejects offer                                                                  | Order → next driver; driver keeps position;`count += 1`  |
| Driver times out (3 min)                                                              | Order → next driver; driver keeps position;`count += 1`  |
| Shipper rejects the driver's quoted price (agreement rejection)                       | Order → next driver; driver keeps position;`count += 1`  |
| Job cancelled by shipper / platform admin /**queue org admin** / system (whole order) | Entry released to`waiting`, position kept; **no count**  |
| `count` reaches N                                                                     | Driver moves to back of line;`count = 0`                 |
| Driver accepts (loaded)                                                               | Driver leaves queue;`count` is irrelevant (entry closed) |

## 2. Why not "remove the driver from the queue"

Removal was evaluated and rejected. In freight dispatch (Uber Freight, Convoy,
TMS auto-dispatch, airline standby lists) the standard is a **cascade** — the
load moves to the next eligible party and the declining party is **not**
expelled:

1. **Supply.** A refusal is usually legitimate (driver already booked, breakdown,
   unattractive offer). Removal shrinks the pool and punishes the whole line.
2. **Throughput.** The client's goods must ship on time; a single refusal must
   never stall fulfillment.
3. **Trust.** Drivers who fear expulsion stop joining the queue, killing the
   virtual-ticket-line mechanic the whole product is built on.

A single hard removal path is still kept, but only for **abuse** and decided by
the queue org admin via the existing supervisor override (audit logged) — never
automatically on a refusal.

## 3. Mechanics (today, unchanged)

Today's engine already implements the baseline. Refusals and timeouts go through
the same exit: the `DriverQueue` entry returns to `waiting`, the order advances.
The only change vs. today is **who increments the counter** (§4.1) — the advance
mechanics stay exactly as they are.

```
Driver-side reject (POST /api/driverRequest/actionCancelDriverRequest)
  → JourneyDecision: rejectedByDriver (15)
  → rejectOffer()   [DriverQueue.service.js]
       entry.offer → status waiting, offer cleared
       applyRefusalPolicy → count += 1
       offerToNextDriver(afterQueueNumber)  → offer to next driver, same vehicle type

Shipper-side price rejection (POST /api/shipperRequest/actionReject)
  → JourneyDecision: rejectedByShipper (8)
  → rejectOffer()   [DriverQueue.service.js]
       entry.offer → status waiting, offer cleared
       applyRefusalPolicy → count += 1
       offerToNextDriver(afterQueueNumber)  → offer to next driver, same vehicle type

Background timeout scan  (QUEUE_OFFER_WINDOW_MINUTES = 3)
  → expired offers: JourneyDecision → rejectedByDriver, entry → waiting,
    applyRefusalPolicy → count += 1, advance
```

Whole-job cancellation is **not** a reject path: it goes to
`releaseEntryOnOrderCancel` (no counter) — see
[queue-order-cancellation.md](queue-order-cancellation.md).

Statuses in play (see `Utils/ListOfSeedData.js` `journeyStatusMap`):

| id  | status             | meaning                                    |
| --- | ------------------ | ------------------------------------------ |
| 2   | requested          | offer currently held by a driver           |
| 8   | rejectedByShipper  | shipper rejected the driver's quoted price |
| 13  | noAnswerFromDriver | offer window expired (timeout)             |
| 15  | rejectedByDriver   | driver declined the incoming offer         |

## 4. New rule — move-to-back after N

### 4.1 Hook points

The counter is incremented on **every** queue-offer rejection, regardless of who
initiates it — the front driver always had the chance to close the order and did
not:

1. `rejectOffer()` — called for **all** queue-order rejections:
   - **Driver-side** (driver cancels the offer; `actionCancelDriverRequest`).
   - **Shipper-side price rejection** (shipper rejects the driver's quoted
     `shippingCostByDriver`; `actionReject` → `rejectedByShipper`). Rationale:
     the driver quoted their own price and did not close at the shipper's terms —
     the line had to move past them.
2. The **timeout scan** (implicit reject) — same dispatch impact, counted the
   same. Rationale: from the line's perspective a silent driver blocks the front
   exactly like a declining one.

**Not counted:** whole-job cancellation (shipper / platform admin / **queue org
admin** / system cancel — `releaseEntryOnOrderCancel`), and admin manual
overrides. A job cancel is the shipper's or admin's decision; it is never a
driver refusal.

### 4.2 Counting

- Counter lives on the `DriverQueue` entry as `queueRefusalCount` (int, default 0).
- Increment on each counted refusal **while the entry holds the front position**.
- Reset to 0 when the driver reaches the back via the rule, or naturally when the
  entry leaves/re-enters (accept → `loaded`; check-out → re-check-in creates a
  new entry with a fresh counter and a new `queueNumber` at the back).
- The queue resets daily (`queueDate`), so the counter is implicitly per-day.

### 4.3 Move-to-back

When `queueRefusalCount >= N` at refusal time:

1. Set the entry's `queueNumber` to `max(queueNumber) + 1` among **active**
   (`waiting`) entries of the same `(queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId)` — i.e. the back of the line.
2. Reset `queueRefusalCount = 0`.
3. Leave other entries' numbers untouched (no renumbering storm).
4. Emit a queue snapshot + notify the queue org admin (`messageType: queue_refusal_moved_to_back`) so the admin sees the position change.
5. The **order still advances to the next driver** in the _current_ offer cycle.

All position changes write `queueUpdatedAt` / `queueUpdatedBy` for audit, and the
entry's refusal history is reconstructable from `JourneyDecisions`
(`rejectedByDriver` / `rejectedByShipper` / `noAnswerFromDriver` rows for that
driver, that day).

### 4.4 Edge cases

| Case                                                                          | Behavior                                                                                                                                |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Timeout while driver offline                                                  | Counted (same as reject); admin can manually override position                                                                          |
| Shipper rejects driver's quoted price (agreement rejection)                   | **Counted** — front driver did not close at the shipper's terms                                                                         |
| Whole job cancelled by shipper / platform admin /**queue org admin** / system | **Not counted** — entry released, position kept (see [queue-order-cancellation.md](queue-order-cancellation.md))                        |
| All drivers in line refuse                                                    | Order stays`requested` with no active offer; notify org admins; auto-offer resumes when a matching driver joins or on the next dispatch |
| Company-assignment override on the order                                      | `replacedByCompanyAssignment` (16) path — not a refusal; queue entry handled by the assignment flow                                     |
| Re-check-in on a later day                                                    | Fresh entry, fresh counter, position at the back                                                                                        |
| Admin position override                                                       | Supervisor override, audit logged; does not touch the counter                                                                           |

### 4.5 Entry state machine (the invariant)

`DriverQueue.status` is the whole queue contract. The counter only ever exists on
`waiting`/`offered` entries; it never survives `loaded`/`removed`.

```
            check-in (queueNumber = MAX+1, count = 0)
                     │
                     ▼
                 ┌──────────┐   offer (createQueueOffer)
                 │  waiting │ ─────────────────────────► ┌──────────┐
                 └──────────┘                            │  offered │
                     ▲   ▲                               └──────────┘
                     │   │                                    │
  release on         │   │  rejection / timeout:              │  driver accepts
  whole-job cancel   │   │    status → waiting,               │  (markEntryLoaded)
  (no count)         │   │    count += 1;                     │
                     │   │    count == N → queueNumber        │
                     │   │    = MAX+1, count = 0              │
                     │   └─────── (order advances)            ▼
                     │                                    ┌──────────┐
   re-check-in       │                                    │  loaded  │ (left the
   (revive,          └──────────(moved to back)──────────►│          │  line)
   count = 0)                                             └──────────┘
```

Rules:

- Rejection / timeout / price-reject: `offered → waiting`, `count += 1`; on
  `count == N` also `queueNumber = MAX+1` and `count = 0`.
- Whole-job cancel: `offered → waiting`, position and count untouched
  (see [queue-order-cancellation.md](queue-order-cancellation.md)).
- Accept: `offered → loaded` (leaves the line; count is moot).
- Re-check-in revives a previous entry with `count = 0` and a new back position.

## 5. Config & schema

- Env: `QUEUE_REFUSAL_LIMIT` (default `3`; read in `DriverQueue.service.js`).
  `QUEUE_OFFER_WINDOW_MINUTES` (default `3`) unchanged.
- `DriverQueue.queueRefusalCount INT NOT NULL DEFAULT 0` — added to
  `Database/Database.js` and applied to the live DB. Incremented on **every
  counted refusal** (driver-side reject, shipper price-reject, timeout); **never**
  on whole-job cancel; reset to 0 on move-to-back or re-check-in.

## 6. `decisionBy` enum (backs the audit trail)

`JourneyDecisions.decisionBy` distinguishes _who/what_ made each decision:

| value     | meaning                                                            |
| --------- | ------------------------------------------------------------------ |
| `shipper` | The shipper / order-placer decided (picked or rejected a driver)   |
| `driver`  | The driver decided (accept / reject / cancel)                      |
| `admin`   | Platform admin acted (override / cancel / complete)                |
| `queue`   | The queue dispatch engine (automatic FIFO offer) made the decision |
| `company` | A transport company (company admin/dispatcher) assigned the driver |

Queue dispatch writes:

- Offer creation (`createQueueOffer`) → `decisionBy: 'queue'` (engine dispatched).
- Driver accept/reject/timeout → `decisionBy: 'driver'` (via the existing
  accept/reject engine).
- Company assignment flow (`assignmentHelper.js`, `assignmentUpdate.service.js`)
  → `decisionBy: 'company'` (migrated from the old hardcoded `'admin'`).

## 7. Verification (how we know this doc is true)

| #   | Check                                                                     | Pass criteria                                                                                                                   |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Driver rejects offer                                                      | `queueRefusalCount` increments; entry `waiting`; order offered to next driver                                                   |
| 2   | Driver times out (3 min)                                                  | Same as#1 via `releaseExpiredOffers` scan                                                                                       |
| 3   | Shipper rejects driver's price                                            | `JourneyDecision = rejectedByShipper(8)`; `queueRefusalCount` increments                                                        |
| 4   | Whole-job cancel (shipper / platform admin /**queue org admin** / system) | Entry released to`waiting`, position kept, **count unchanged** — see [queue-order-cancellation.md](queue-order-cancellation.md) |
| 5   | `count == N`                                                              | Entry moves to back (`queueNumber = MAX+1`), `count = 0`, admin notified `queue_refusal_moved_to_back`                          |
| 6   | Re-check-in                                                               | Revived entry has`count = 0`, back position                                                                                     |
| 7   | Schema                                                                    | `DriverQueue.queueRefusalCount` present in live DB; `QUEUE_REFUSAL_LIMIT` env respected                                         |

**Pending code to make the doc true:**

1. ~~`rejectOffer` — apply `applyRefusalPolicy` on every queue rejection (drop the
   `if (driverUserUniqueId)` guard; shipper-side price rejection must count too).~~
   **DONE** — `rejectOffer` counts unconditionally.
2. ~~`releaseEntryOnOrderCancel` — new export + hooks (§4.5 in
   [queue-order-cancellation.md](queue-order-cancellation.md)).~~
   **DONE** — implemented and hooked on all whole-job cancel paths.

## 8. Open questions

- **N = 3** default (env `QUEUE_REFUSAL_LIMIT`) — resolved as implemented.
- Timeout **counts fully** (same dispatch impact) — resolved as implemented.
- Should the move-to-back notify the _driver_ (not just the org admin)? — **open**;
  currently only the queue org admin is notified (`queue_refusal_moved_to_back`).
- Tune N per client (per `QueueOrganization`)? — **open**; currently global.
