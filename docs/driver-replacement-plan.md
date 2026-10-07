# Driver Replacement Flow — Implementation Plan

**Feature:** a transport company replaces a driver who accepted a company_target job but can no longer
finish it, and the dispatcher controls which vehicles may be assigned.

**Status:** `VERIFIED` — all phases P0–P7 plus section 4 verification are ticked off. Flags F1–F3 remain open by design.

---

## 1. Decisions (locked with the requester)

| # | Decision |
|---|---|
| D1 | Replacement triggers = **driver cancel after acceptance** *and* **company recall** (post-confirm only). Pre-confirm `rejected_by_driver` does **not** deactivate a vehicle. |
| D2 | Replacement is created through a new **atomic** `POST /api/company/assignments/:assignmentUniqueId/replace` (close old + open new in one transaction). |
| D3 | The replacement assignment row carries status **`reassigned`** (schema spec, `18_company_bidding.js:100-101`). |
| D4 | On a post-confirm drop/recall the replaced driver's `CompanyVehicle.assignmentStatus` goes **`active` → `inactive`**. |
| D5 | Re-freeing is **manual only** — a dispatcher flips it back with the existing `PATCH /api/company/fleet/:companyVehicleUniqueId`. Normal `completed` never touches the flag. |
| D6 | Assignment is allowed **only for `active` vehicles** (single, bulk and auto). |
| D7 | Assignment endpoints stay gated to **platform admin / super admin / company admin / dispatcher** (already shipped: `Middleware/VerifyToken.js`). |
| D8 | No system auto re-dispatch for `company_target` — a human always drives it (`actionCancelDriverRequest.service.js:366` keeps its exclusion). |

## 2. Current state (why this plan exists)

- **Driver-initiated cancel already works end to end:** assignment → `rejected_by_driver` /
  `cancelled_by_driver`, `ShipperRequest` back to `acceptedByShipper (4)` for company_target,
  `DriverRequest` → `waiting (1)`, `Journey` → `cancelledByDriver` if started, queue entry released,
  bid stays `accepted_by_shipper` — and a second `POST /api/company/assignments` can claim the slot
  because `CompanyBidVehicleAssignment` has no UNIQUE on the slot.
- **Gaps:**
  1. `cancelled_by_company` is written by nothing — the company cannot recall a driver who will not cancel. `DELETE /assignments/:id` is a bare soft-delete with no status and a copy-pasted message.
  2. `assignmentCreate.service.js` performs **no `CompanyVehicle` check at all** — neither ownership nor `assignmentStatus='active'` (only `assignmentAuto.service.js:141` filters active).
  3. `needsReassignment` is keyed exclusively on a prior `cancelled_by_driver`, so rejected/recalled slots read as `notAssigned`.
  4. `reassigned` exists in the live enum but is never written; two filters already expect it (`cancelBatch.service.js:246`, `partialCancelBatch.service.js:164`), while three exact-match `= 'assigned'` filters would lose a `reassigned` slot from every bucket.
  5. No test covers CancelRules R1 (`E2ETests/Company/CancelRules.js:6-7`, header only).

## 3. Phases

### P0 — Enum alignment (prerequisite)
- [x] Add `going_to_loading`, `journey_started` to the live `CompanyBidVehicleAssignment.assignmentStatus` enum (`sql_mode` has `STRICT_TRANS_TABLES`, so today `PATCH /assignments/:id/status` cannot persist them). — ALTER applied, round-trip write verified (`journey_started` persists), 2 existing rows preserved.
- [x] Mirror it in `Database/schema/18_company_bidding.js`.

### P1 — Make `cancelled_by_company` real
- [x] Recall path writes `cancelled_by_company` on an active assignment. — new `assignmentHelper/recall.service.js` (`readAssignmentForUpdate` + `recallAssignment`), which also releases DriverRequest/JourneyDecision/Journey to `cancelledByAdmin (13)`, reverts the slot to `acceptedByShipper (4)`, and closes the queue holder entry via new `releaseQueueEntryForCompanyRecall` (no refusal penalty, no auto next-driver).
- [x] `DELETE /api/company/assignments/:id` sets `cancelled_by_company` when the row is still active, and stops returning `"Auto-assignment completed"` (`assignmentDelete.service.js:233-244`). — now returns `Assignment recalled by company` / `Assignment deleted` + `{assignmentUniqueId, recalled}`.
- [x] **Security (added while touching the route):** DELETE now runs `assertCompanyAccess` (403 for a member of another company) and is role-gated `mayAssignDrivers` like the create paths. Verified live: foreign dispatcher 403, own dispatcher 200, repeat 404, non-dispatcher 403, no token 401.
- [x] Driver notified of the recall (FCM + WS via new `notifyDriverOfRecall`, new `company_driver_recalled` message type).

### P2 — `POST /api/company/assignments/:assignmentUniqueId/replace`
- [x] Route + validation (`driverUserUniqueId`, `vehicleUniqueId`). — `Routes/company/CompanyAssignment.routes.js:78-83`, Joi `replaceAssignment` (`Validations/CompanyAssignment.schema.js:15-18`).
- [x] Role gate: `verifyIfUserIsAdminSuperAdminCompanyAdminOrDispatcher`. — `mayAssignDrivers` on the route; live-verified 403 for a driver token.
- [x] Transaction: lock old row (404 gone / 409 terminal) → `assertCompanyAccess` → validate new vehicle active+owned, `assertDriverNotDoubleBooked` → close old as `cancelled_by_company` → free old driver (`DriverRequest`→`waiting`, `Journey`→cancelled, queue release) → `ShipperRequest` stays 4 → new vehicle `inactive` → insert new row as **`reassigned`** → notify old driver / new driver / company / shipper / queue org. — `Services/CompanyAssignment/assignmentReplace.service.js` (same-truck swaps re-free the truck at :143-151).
- [x] Return `{ previousAssignmentUniqueId, assignment }`. — returns `{previousAssignmentUniqueId, assignmentUniqueId, assignmentStatus: "reassigned", shipperRequestUniqueId, driverRequestUniqueId, journeyDecisionUniqueId}`; live curl → 201.

### P3 — "Assign actives only"
- [x] `createAssignment`: assert the vehicle belongs to the bid's company and is `assignmentStatus='active'` (409 otherwise). — `assertAssignableVehicle` (`assignmentHelper/fleet.service.js`: 404 unknown / 403 foreign / 409 inactive).
- [x] `createBulkAssignments`: same check per row. — one bad row fails the whole atomic batch.
- [x] `assignmentAuto`: unchanged (already filters active).
- [x] Re-free documented against the existing `PATCH /api/company/fleet/:companyVehicleUniqueId`. — `fleet.service.js` docblock + `recall.service.js:186` comment; E2E D5 asserts the re-free round-trip.

### P4 — Deactivate the replaced driver's vehicle
- [x] `cancelled_by_driver` path (`actionCancelDriverRequest.service.js:313-329`) → `CompanyVehicle.assignmentStatus='inactive'`.
- [x] `cancelled_by_company` path (P1/P2) → same. — `recall.service.js:190-191`.
- [x] Not applied to `rejected_by_driver`, not applied to `completed`. — grep: only the two sites above write `inactive` (excluding the unrelated fleet soft-delete).

### P5 — Slot accounting knows `reassigned` (+ recall)
- [x] `ReadData.shipper.js:443` → `IN ('assigned','reassigned')`.
- [x] `batchRead.service.js:404` → same.
- [x] `actionReleaseConflictingOffers.service.js:54` → include `reassigned`.
- [x] `needsReassignment` also fires for `cancelled_by_company` and `rejected_by_driver` (`ReadData.shipper.js:431-435`, `batchRead.service.js:391-397`).

### P6 — Tests
- [x] E2E **R1**: driver cancels post-confirm → slot stays 4, assignment `cancelled_by_driver`, vehicle `inactive`, then replace → old terminal / new `reassigned`. — `E2ETests/Company/CancelRules.js` `runReplacementFlowTests` (15 assertions), green in E2E run5.
- [x] E2E company replace → `cancelled_by_company` + vehicle inactive + `reassigned` row + old driver freed. — same flow.
- [x] E2E/Jest gate: non-dispatcher on `/replace` → 403; inactive vehicle → 409. — E2E gates D7/D6 (+ D1 terminal → 409), plus manual curl below.
- [x] Jest: bucket counts include `reassigned`; `needsReassignment` fires for recall. — `Tests/companyAssignmentReplacement.test.js` (12 tests).

### P7 — Docs
- [x] `PLATFORM_FLOW_GUIDE.md:556-557` (dispatcher step 5 now maps to `/replace`).
- [x] `appWorkflow.md:852` lifecycle row.
- [x] `AdminDashboard.md:381` status enum.
- [x] `Database/schema/18_company_bidding.js:81-101` Step 3 (code sets DriverRequest to `waiting`, not `cancelledByDriver`).

## 4. Verification

- [x] `node --check` + `npx eslint` on every touched file. — `node --check` all modified files clean; eslint 0 errors (1 pre-existing `max-lines` warning in `DriverQueue/helpers.js`).
- [x] `npx jest --no-coverage` — baseline **90/90** must hold. — **102/102** (90 baseline + 12 new P6 tests).
- [x] `node E2ETests/Queue/index.js` — baseline **111/111** must hold. — 111/111.
- [x] New P6 cases green. — full E2E run5: **238 passed / 3 failed / 7 skipped**; the 3 fails are the known pre-existing ones (`individualDriverRejection`, `companyAssignmentRejection`, `batchDriverRejection`), unrelated to this roadmap.
- [x] Manual curl of `/replace` with a role-7 token; confirm 403 for a non-dispatcher token. — driver token → 403 `"Only a company admin or dispatcher can assign drivers"`; role-7 companyAdmin → 201 with `assignmentStatus: "reassigned"`.

### Found during final verification (fixed)
- `Services/ShipperRequest/actionAccept.service.js` — `connectedDrivers` is scoped to ALL of the shipper's open bids, and the accept loop called `verifyDriverJourneyStatus` for every bidder, so a non-selected driver bidding on one of the shipper's OTHER orders who had no active `VehicleDriver` row threw `404 "No vehicle found for this driver"` and rolled back the whole accept (this broke `socketNotificationTest`, `QBB-05`, `QYA-05` in E2E runs 3–4). Fix: the journey-status lookup is now try/caught — rethrown only for the accepted driver (real error), warn + skip the socket notification for non-selected drivers. E2E run5: all three green.

## 5. Flagged, deliberately NOT in scope (awaiting a decision)

| # | Item |
|---|---|
| F1 | Manual assign does not enforce **vehicle-type match** to the bid — only `assignmentAuto` does (`PLATFORM_FLOW_GUIDE.md:736`). A replacement could silently put a wrong-size truck on the job. |
| F2 | `PATCH /api/company/fleet/:id` is guarded by **membership only**, not by admin/dispatcher, so any company member (including a driver) can flip a vehicle `active`/`inactive`. |
| F3 | A pulled vehicle drops out of `companyFleetSize` (`bidRead.service.js:272`, `OrganizationCounts.service.js:35` count `active` only) until re-freed. Accepted as-is. |
