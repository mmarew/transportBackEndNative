# Queue Order Cancellation — Queue Integrity on Shipper/Admin Cancel

> Status: **IMPLEMENTED.** `releaseEntryOnOrderCancel` is live on the whole-job
> cancel paths (see §4.2 for the accurate hook list). The driver-initiated
> transfers (§3.5 — `releaseQueueEntryAfterDriverCancel`) are **E2E-verified**
> by the queue suite **TQ-34** (queue cancel-after-accept) and **TQ-35**
> (non-queue reject → nearest re-match). Related:
> [queue-dispatch-design.md](queue-dispatch-design.md),
> [queue-refusal-policy.md](queue-refusal-policy.md),
> [queue-order-dispatch.md](queue-order-dispatch.md).

## 1. Two different cancellation types

"Cancel" is overloaded in this system. Queue integrity depends on telling these
apart:

| Type | Status | The job | The queue effect |
| ---- | ------ | ------- | ---------------- |
| **A. Whole-job cancellation** | `cancelledByShipper` (10) / `cancelledByAdmin` (13) | **Dead** — no more drivers get it | **RELEASE** the holding entry back to `waiting` (this doc, §3). No advance, **no penalty count**. |
| **B. Single-driver agreement rejection** | `rejectedByShipper` (11) | **Alive** — advances to the next driver | **HANDLED** by `rejectOffer` (§2). Driver keeps position; **counts as a penalty** toward the refusal limit. |
| **C. Driver-initiated transfer** | `rejectedByDriver` (18) before accept / `cancelledByDriver` (12) after accept | **Alive** — re-matched | Driver-side cancel goes to the **active-transfer** path (§3.5): pre-accept reject → `rejectOffer`; post-accept cancel → `releaseQueueEntryAfterDriverCancel`. **Both count as a refusal penalty.** |

Type B is the common queue moment: the admin dispatches the front driver
(`requested`, `decisionBy='queue'`), the driver responds — possibly with their
own `shippingCostByDriver` (a counter-price, high or low) — and the shipper
rejects that price. Only *this driver's agreement* is cancelled; the order moves
down the line. This section documents why that already works and what Type A
still needs.

## 2. Type B — single-driver agreement rejection (already works)

### 2.1 Flow

```
queue admin dispatches front driver
  → JourneyDecision = requested(2), decisionBy='queue'     [createQueueOffer]
driver accepts, quotes price
  → JourneyDecision = acceptedByDriver(3), shippingCostByDriver set
     (queue orders fall back to the fixed order shippingCost if none quoted)
shipper rejects the driver's price
  → JourneyDecision + DriverRequest = rejectedByShipper(8), decisionBy='shipper'
     [Services/ShipperRequest/actionReject.service.js → updateNegativeJourneyStatus]
  → rejectOffer (shipper-side, no driverUserUniqueId)
      entry: requested → notagreed   (keeps queueNumber, stays in line)
      order:  offered to NEXT driver of same vehicle type   [offerToNextDriver]
```

### 2.2 Queue guarantees

- The rejecting driver **keeps their position** — rejecting one agreement is
  "pass on this load", not "lose your turn".
- The order **advances** — `offerToNextDriver` skips to the next `waiting`/
  `notagreed` driver of the order's vehicle type.
- **Counted** against the refusal policy (`applyRefusalPolicy`) — the driver
  quoted their own price and did not close at the shipper's terms, so the line
  moved past them; at N it triggers move-to-back (see
  [queue-refusal-policy.md](queue-refusal-policy.md)). A whole-job cancel is
  different — the shipper's decision, **not** counted (§3).
- The audit trail is already correct: that driver's decision is
  `rejectedByShipper`, `decisionBy='shipper'`.

No code change is needed for Type B.

## 3. Type A — whole-job cancellation (the gap)

A queue order cancelled at the job level updates `ShipperRequest` /
`JourneyDecisions` / `DriverRequest` and writes a `CanceledJourneys` record, but
**never touches `DriverQueue`.**

### 3.1 How it breaks the line

If a driver is currently **holding the offer** (`DriverQueue.status = 'requested'`)
when the order is cancelled:

1. The entry keeps `status = 'requested'` with `shipperRequestUniqueId` still set.
2. The background offer-window scan (`releaseExpiredOffers`) will **not** release
   it, because that query filters `sr.journeyStatusId = requested` — the order is
   now `cancelled`.
3. `offerToDriver` only ever offers to `status IN ('waiting','notagreed')`
   entries — so the stuck driver receives **no future offers for the rest of the day**.
4. No `emitQueueSnapshot` fires, so the queue-org-admin dashboard shows the
   driver as still holding an order that no longer exists.

Net effect: **one cancelled order silently blocks one driver's whole queue day.**

### 3.2 When it does *not* break

| Driver state at cancel | Queue impact |
| ---------------------- | ------------ |
| `requested` (holds the offer) | **BREAKS** — entry stuck `requested`, driver blocked |
| `waiting` / `notagreed` (no offer) | None — entry untouched, still in line |
| `agreed` (already accepted / on the road) | Driver already left the line (`agreed`); they simply become free to re-check-in |

### 3.3 Design decision

**Release on cancel.** Whenever a queue order is cancelled at the job level,
release any `DriverQueue` entry currently holding that order's offer back to
`waiting`, keep its position, and **do not count it against the refusal policy**
(the cancellation is the decision of the **shipper, the platform admin, or the
queue org admin** — never the driver's). A queue admin cancelling a job is
`cancelledByAdmin` (10) and follows exactly the same release path with **zero
penalty** to the holding driver.

**Audit clarity.** A queue-admin cancel is recorded in `CanceledJourneys` with
`roleId = 11` (Queue Organization Admin) plus the seeded cancellation reason
**"Cancelled by queue admin"** (`roleId: 11` in `CancellationReasonsType`),
which is deliberately **distinct from the system/platform admin** (`roleId = 3`
and its reasons). Consumers can therefore tell a queue-admin cancel apart from a
system-admin cancel at a glance. (The `ShipperRequest.journeyStatusId` is still
`cancelledByShipper`(7) when the admin cancels their own order, or
`cancelledByAdmin`(10) when a platform admin does it — the role + reason carry
the queue-admin signal.)

| Case | Action |
| ---- | ------ |
| Entry `requested` for the cancelled order | → `waiting`, clear `requestedAt`/`shipperRequestUniqueId`, **keep queueNumber**, **refusal counter untouched — no penalty for the holding driver, no matter who cancelled (shipper / platform admin / queue org admin)**, emit snapshot + notify org admin |
| Entry already `waiting` | Nothing to do |
| Entry `agreed` (accepted / journey started) | No release needed (already out of line) — see §6 policy note |
| Batch order (`numberOfVehicles = N`) | Each cancelled `ShipperRequest` slot releases **its own** holding entry |

Rejected alternative: **blocking queue-order cancellation entirely.** Clients
(factory/customs) legitimately cancel — the design must make cancellation safe,
not forbid it.

## 3.5 Type C — the DRIVER cancels (active transfer)

Sections 2–3 covered the **shipper/admin** deciding against a driver or a job.
When the **driver themselves** cancels or rejects, the job is still *alive* and
must be transferred — this is the **active-transfer** decision.

### 3.5.1 Two driver-side moments

| Driver state when they cancel | Status written | Queue path |
| ----------------------------- | -------------- | ---------- |
| **Before accepting** (holding an incoming offer, `requested`=2) | `rejectedByDriver` (18) | `rejectOffer` — entry keeps position, `count += 1` (refusal), order advances FIFO. (§2/§4.1 in [queue-refusal-policy.md](queue-refusal-policy.md)) |
| **After accepting** (`acceptedByDriver`=3 or later journey state) | `cancelledByDriver` (12) | `releaseQueueEntryAfterDriverCancel` — entry soft-deleted out of line, refusal `count += 1`, order advances to the next waiting driver (§3.5.2) |

Both count as a **refusal penalty** toward `QUEUE_REFUSAL_LIMIT`: from the line's
perspective the front driver had the chance to close the load and did not.

### 3.5.2 `releaseQueueEntryAfterDriverCancel` (queue orders, post-accept)

`Services/DriverQueue.service.js` (exported next to `rejectOffer`). On a queue
driver who cancels a job **after accepting**:

1. `SELECT` the entry holding the order FOR UPDATE (status `acceptedByDriver`→
   journey in progress, `queueDeletedAt IS NULL`). None → `{ released:false,
   offered:false }` (idempotent).
2. Audit-log the close: status → `cancelledByDriver` (12).
3. Update the entry: `status=12`, `requestedAt=NULL`, `shipperRequestUniqueId=NULL`,
   `queueUpdatedAt/By`, and **`queueDeletedAt/By`** — the driver **forfeits their
   slot** and must re-check-in (new `queueNumber` at the back) for the next load.
4. **`applyRefusalPolicy`** → `queueRefusalCount += 1` (and move-to-back if it
   reaches N — moot on a soft-deleted row, kept for audit consistency).
5. `emitQueueSnapshot()` + `notifyQueueOrgAdmins({ messageType:
   "queue_order_cancelled" })`.
6. `offerToNextDriver({ afterQueueNumber, excludeVehicleDriverUniqueId })` — the
   order is offered to the **next waiting driver of the same vehicle type**.
7. If no next driver → `notifyQueueOrgAdmins("online_driver_not_found")` +
   `notifyShipperOfQueueEvent` (`online_driver_not_found`) — the order stays
   `waiting` and is auto-offered on the next matching-type check-in.

### 3.5.3 Non-queue (street/distance) orders — nearest re-match

`Services/DriverRequest/actionCancelDriverRequest.service.js` routes driver cancels:

- Order carries a **queue organization** (via its `ShipperRequestBatch`):
  pre-accept → `rejectOffer`; post-accept → `releaseQueueEntryAfterDriverCancel`.
- Order is **non-queue** (street / distance match): the reject/cancel reruns
  `handleWaitingRequest` at the order's origin and re-engages the **nearest**
  waiting driver; if none, notifies admin (`sendSocketIONotificationToAdmin` +
  FCM, role 1) and the shipper, and the order stays `waiting`.
- `DriverQueue` is **never** touched for non-queue orders.
- Company-target orders (`company_target` + `isCompanyTarget`) keep their own
  assignment semantics and are skipped by the re-match.

### 3.5.4 Penalty decision

A driver reject (pre- or post-accept) **counts** as a refusal — it is the driver
declining a load the line was waiting to serve. This is deliberate contrast with
Types A/B where the *shipper/admin* decides and the front driver is **not**
penalized.

## 4. Mechanics

### 4.1 New release function

Mirror `rejectOffer` minus the refusal counter and minus the advance:

```js
// DriverQueue.service.js
exports.releaseEntryOnOrderCancel = async ({ shipperRequestUniqueId, user }) => {
  // SELECT the entry where dq.shipperRequestUniqueId = ? AND dq.status = 'requested'
  //   AND dq.queueDeletedAt IS NULL ... FOR UPDATE
  //   → none found: return { released: false }
  // updateData(DriverQueue, { status:'waiting', requestedAt:null, shipperRequestUniqueId:null,
  //                          queueUpdatedAt, queueUpdatedBy }, { queueId })
  // emitQueueSnapshot(...)
  // notifyQueueOrgAdmins({ ..., messageType: "queue_order_cancelled" })
  return { released: true };
};
```

**DONE.** Implemented next to `rejectOffer` in `DriverQueue.service.js`. It uses
`db()` (transaction-aware: the ambient tx connection inside a transaction, else
the pool) plus `updateData`, so it is safe to call from inside a transaction or
after commit; the `FOR UPDATE` row lock serializes against the offer-window
background scan. Returns `{ released: false }` when no `requested` entry exists
(idempotent).

Same guarantees as `rejectOffer`: resets the entry in place, position preserved,
other entries' `queueNumber`s untouched. Crucially it does **not** call
`applyRefusalPolicy` and does **not** offer the order to the next driver (there is
no next driver — the order is gone).

### 4.2 Hook points (all Type-A entry paths)

| Path | File | What to add | Status |
| ---- | ---- | ----------- | ------ |
| Shipper / platform admin / **queue org admin** full cancel | `Services/ShipperRequest/actionCancel.service.js` (`cancelShipperRequest`) | After the transaction commits, call `releaseEntryOnOrderCancel` when the row has `queueOrganizationUniqueId`. Queue org admins cancel as `cancelledByAdmin` (10) through this same path — no penalty, no refusal count | **DONE** (fires once, post-commit) |
| Negative-status updates that set a cancel status | `Services/JourneyStatus/update.service.js` (`updateNegativeJourneyStatus`) | Guarded call when the target order is a queue order; `cancelShipperRequest` passes `skipQueueRelease: true` so it does not double-fire inside its own transaction | **DONE** |
| Admin batch / slot cancel | `Services/ShipperRequest/cancellation.service.js` | **No hook needed** — this file only reads cancellation notifications. The real batch-slot cancels are `Services/ShipperRequestBatch/batchCancel/*` (company-bid domain) | N/A |
| `Services/JourneyStatus/delete.service.js` | — | **No hook needed** — only deletes the `JourneyStatus` reference rows, never cancels orders (its negative-status JSDoc is a stale copy) | N/A |
| Batch cancel (`cancelBatch`) | `Services/ShipperRequestBatch/batchCancel/cancelBatch.service.js` | **No hook needed** — queue orders (`queueOrganizationUniqueId`) and batch orders (`shipperRequestBatchUniqueId`) are created through mutually exclusive flows in `create.service.js`; a queue order is never a batch slot | N/A |

Pattern to follow: `actionReject` already branches on
`shipperRequestRow.queueOrganizationUniqueId` before calling
`rejectOffer` — the Type-A cancel path does the same for
`releaseEntryOnOrderCancel`.

### 4.3 New message type

`queue_order_cancelled` in `Utils/MessageTypes.js` → org admins see the order is
gone and the driver released (data: `{ driverUserUniqueId, queueUniqueId }`).
**DONE**.

## 5. Edge cases

| Case | Behavior |
| ---- | -------- |
| Driver holds offer + order cancelled (Type A) | Released to `waiting`, position kept, **not counted** as refusal |
| **Queue org admin** cancels the job (role 11 → `cancelledByAdmin`) | Same as above — release to `waiting`, position kept, **no penalty** to the holding driver. The admin's cancel goes through the same `actionCancel` → `releaseEntryOnOrderCancel` path as a shipper cancel |
| Driver's price rejected by shipper (Type B) | `rejectOffer` advances the order; driver keeps position; **`count += 1`** toward the refusal limit |
| Driver already accepted (entry `agreed`) | Already out of line; nothing to release. Optional policy: first-right-of-refusal on the next matching order this day (open question) |
| Partial batch cancel | Only the cancelled slot's entry is released; other slots continue dispatch |
| Order cancelled twice / already cancelled | Idempotent — no `requested` entry → `released: false` |
| Driver refused earlier (counter > 0), then order cancelled (Type A) | Counter **unchanged** (cancellation ≠ refusal) |
| Cancel while no offer held | No-op on the queue |

## 6. Verification (how we know this doc is true)

> Implementation is complete; the checks below still need a manual DB run
> (cancel a real queue order mid-offer and inspect `DriverQueue`). Type C
> (driver-cancel) checks are **automated** — see **TQ-34** and **TQ-35** in
> the queue E2E suite (`E2ETests/Queue/ActiveTransfer.js`).

| # | Check | Pass criteria |
| - | ----- | ------------- |
| 1 | Cancel a queue order while the front driver holds the offer | Entry → `waiting`, position kept, `requestedAt`/`shipperRequestUniqueId` cleared, **no `count += 1`** |
| 2 | Same entry immediately offered a NEW order | The released driver is eligible again (proves no stuck `requested`) |
| 3 | Cancel a non-queue order | Queue untouched; no-op |
| 4 | Cancel an already-cancelled order | Idempotent; `released: false` |
| 5 | Partial batch cancel (N slots) | Only the cancelled slot's entry released; other slots keep dispatching |
| 6 | Driver had accepted (entry `agreed`) before cancel | Entry not touched; driver free to re-check-in |
| 7 | Admin/system cancel paths (`cancelledByAdmin`/`cancelledBySystem`) | Same release behavior as #1 |
| 8 | **Queue org admin** cancels the job (role 11 → `cancelledByAdmin`) while a driver holds the offer | Same as #1 — released to `waiting`, position kept, **no penalty** to the holding driver |
| 9 | **TQ-34** — queue driver cancels AFTER accepting | Entry closed `cancelledByDriver`(12)+soft-deleted, `queueRefusalCount` **+1**, order offered to the next driver or left `waiting`; HTTP 200 |
| 10 | **TQ-35** — driver rejects a NON-queue (street) order | `DriverQueue` untouched (0 links); order re-engaged (`requested`) by the nearest driver or back to `waiting`

## 7. Open questions

- When an `agreed` driver's order is cancelled mid-journey: reinsert at their old
  position for the next order, or require a fresh re-check-in at the back?
  (Recommend: fresh re-check-in — simple, predictable; document for the driver.)
- Should the *driver* be notified of the cancellation reason via the existing
  journey-cancel notifications? (The order engine already notifies drivers; only
  the queue-side release + admin snapshot is new here.)
- Type B price negotiation: should a rejected counter-price be recorded on the
  `JourneyDecision` (e.g. quoted vs. accepted price audit), or is
  `rejectedByShipper` + `decisionBy='shipper'` sufficient? (Current: sufficient.)
- Type B counting: a shipper rejection currently counts **every** shipper-side
  `rejectOffer` as a penalty. If non-price rejection reasons are added later
  (e.g. safety / bad rating / wrong vehicle), add a `rejectionReason` field so
  only **price** rejections count.
