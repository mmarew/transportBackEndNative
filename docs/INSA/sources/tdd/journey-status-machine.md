# Journey Status Machine (TDD / LLD)

Every `ShipperRequest` carries a `journeyStatusId` referencing the `JourneyStatus`
table (20 rows, seeded from `Utils/ListOfSeedData.js` → `journeyStatuses` /
`journeyStatusMap`). All transitions are executed server-side inside DB
transactions by action services — clients never write the status column directly.

## 1. Status catalogue

| ID | Name | Meaning | Class |
|---:|---|---|---|
| 1 | `waiting` | Request created; no driver connected yet (also: no shipper for a driver-side offer) | inactive (pre-connection) |
| 2 | `requested` | Offer sent to a driver; not yet accepted | active |
| 3 | `acceptedByDriver` | Driver accepted and submitted its bidding price | active |
| 4 | `acceptedByShipper` | Shipper selected this driver / bid | active |
| 5 | `goToLoadingPlace` | Driver en route to the loading point (stage 1 of loading) | active |
| 6 | `loading` | Loading in progress (stage 2) | active |
| 7 | `loaded` | Loading complete, ready to depart (stage 3) | active |
| 8 | `journeyStarted` | Vehicle departed — trip in transit | active |
| 9 | `journeyCompleted` | Trip finished normally (POD/delivery confirmation) | completed (terminal, enriched) |
| 10 | `cancelledByShipper` | Shipper cancelled the whole shipment | terminal |
| 11 | `rejectedByShipper` | Shipper rejected this driver's offer | decision outcome |
| 12 | `cancelledByDriver` | Driver cancelled after accepting | terminal |
| 13 | `cancelledByAdmin` | Admin cancelled the request | terminal |
| 14 | `completedByAdmin` | Admin force-marked the journey completed | terminal |
| 15 | `cancelledBySystem` | System auto-cancellation (e.g. timeout rules) | terminal |
| 16 | `noAnswerFromDriver` | Driver ignored the offer within the time budget; auto-retried with another driver | decision outcome |
| 17 | `notSelectedInBid` | Driver's bid lost the selection round | decision outcome |
| 18 | `rejectedByDriver` | Driver rejected the incoming call/offer | decision outcome |
| 19 | `replacedByCompanyAssignment` | Individual link replaced because a company assignment took over this driver | decision outcome |
| 20 | `partiallyCancelled` | Batch request: some vehicle slots cancelled while others completed/continue (applies to `ShipperRequestBatch`) | batch state |

## 2. Code-level status classes

Defined in `Utils/ListOfSeedData.js` and consumed by services/read paths:

- **`activeJourneyStatuses` = {2,3,4,5,6,7,8}** — `requested`,
  `acceptedByDriver`, `acceptedByShipper`, `goToLoadingPlace`, `loading`,
  `loaded`, `journeyStarted`. Only requests in these states may be rewritten by
  automatic reconciliation.
- **`supportingDecisionStatuses` = {2,3,4,5,6,7,8,9}** — statuses for which a
  positive `JourneyDecision` row still evidences a live request. The list
  endpoint uses this set to surface rows **with their connected driver first**
  (connected-first ordering + hydration of `driver` on advanced states).
- **`terminalJourneyStatuses` = {10,12,13,14,15}** — deliberate end states;
  never re-opened, never reconciled back to `waiting`.
- **`inactiveJourneyStatuses` = {1} ∪ terminal** — read paths render these as
  inactive orders instead of the active-order payload.
- Helper predicates: `isActiveJourneyStatus(id)`, `isTerminalJourneyStatus(id)`.
- Fast active check in verification code:
  `journeyStatusId <= journeyStatusMap.journeyStarted` used by
  `Services/ShipperRequest/statusVerification/verify.service.js`
  (ids 1–8 are the live window; ids ≥ 9 are outcomes).

## 3. Main flow — individual driver request

```
waiting(1)
  └─ offer dispatched ──> requested(2)
        ├─ driver accepts ──> acceptedByDriver(3)   [DriverBid price submitted]
        ├─ driver rejects ──> rejectedByDriver(18)
        └─ no answer/timeout ──> noAnswerFromDriver(16)  ── re-offer to next driver
acceptedByDriver(3)
  └─ shipper selects the bid ──> acceptedByShipper(4)
        ├─ (other bids) ──> notSelectedInBid(17) / rejectedByShipper(11)
acceptedByShipper(4)
  └─ goToLoadingPlace(5) ──> loading(6) ──> loaded(7) ──> journeyStarted(8)
        └─ delivery confirmed (POD) ──> journeyCompleted(9)

cancel paths (any live state):
  shipper ──> cancelledByShipper(10)   driver ──> cancelledByDriver(12)
  admin   ──> cancelledByAdmin(13)     system ──> cancelledBySystem(15)
  admin override completion ──> completedByAdmin(14)
```

Loading stages are driven by `Services/DriverRequest/journeyManagement/loading.service.js`
(`transitionLoadingStage`, endpoints `goToLoadingPlace` / `loading` / `loaded`).

## 4. Main flow — company target / batch

1. Shipper creates a batch (`ShipperRequestBatch`) with vehicle slots; each slot
   becomes a `ShipperRequest` with `requestMode = "company_target"`.
2. Companies submit bids (`CompanyBidRequest`); shipper awards one
   → per-slot status moves through 3 → 4, `JourneyDecisions` rows record the
   company-side decision (`DriverRequest` links the assigned driver/vehicle).
3. Slots progress through the loading stages and transit exactly like the
   individual flow; per-slot rows keep their own terminal status.
4. If the shipper cancels part of the batch → batch status `partiallyCancelled(20)`;
   cancelled slots get `cancelledByShipper(10)`, completed slots stay
   `journeyCompleted(9)`.
5. When a company assignment takes over a driver that had an individual link,
   that link moves to `replacedByCompanyAssignment(19)`.

## 5. Reconciliation (`reconcileStatus`)

`Services/ShipperRequest/reconcileStatus.service.js` corrects stale statuses:

- May only rewrite rows whose current status is in `activeJourneyStatuses`.
- Derives `nextStatus` from the row's `JourneyDecisions`/`DriverRequest` evidence
  (e.g. a row stuck in `waiting` that actually has a connected driver is advanced).
- Terminal statuses are explicitly out of scope — rewriting one to `waiting`
  would resurrect a cancelled order onto the offerable board.
- `journeyCompleted` is terminal but still enriched (journey/POD data joined on read).

## 6. Read-path presentation

`Services/ShipperRequest/read/detailed.service.js` (hydration for
`getShipperRequest4allOrSingleUser`):

- Builds `allDecisions` per request; for **active statuses** with an exact-status
  decision match it projects the decision-backed state; additionally, for
  `requestMode = "company_target"` rows in an active status without an exact
  match it keeps the request's own status and attaches the available decisions —
  so the response never drops to a `waiting` projection while a driver is
  connected.
- Responses therefore always include: request row, current `journeyStatus`,
  linked `driver` (when connected), decisions, batch/assignment context.

## 7. Notification hooks

Any status change notifies the involved parties over Socket.IO
(`Services/ShipperRequest/statusVerification/notify.service.js` — shipper-side
push on change) and, where configured, FCM push via `DeviceTokens`
and `JourneyNotifications`.

## 8. History / audit

Every status mutation is journaled: `JourneyStatusHistory`,
`ShipperRequest`-related history tables, plus `History.service.js`
`insertHistoryRecord` entries (who/when/change type). `CanceledJourneys` and
`CancellationReasonsType` capture cancellation context, tagged by
`requestMode` (`individual` | `company` | `both`) and actor role
(1 shipper, 2 driver, 3 admin, 11 queue org admin).
