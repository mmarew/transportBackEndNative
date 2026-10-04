# Large File Decomposition — Implementation Plan

Status: **PLAN ONLY — not started.**
Author: generated from ESLint `max-lines` audit on branch `getJobsAlongRoute`.

## Goal
Bring all production modules under the 500-code-line ESLint threshold without changing
behaviour, following the decomposition convention this repo already established in
commit `f1869e65` ("disintegrate large files", 2026-09-13).

## Why ESLint alone is not enough

From `eslint.config.js`:

```js
"max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }]
```

and, for test files:

```js
"max-lines-per-function": "off",
"complexity": "off",
"max-params": "off",
```

Consequences:

1. `max-lines` is a **`warn`**, not an error — nothing fails CI today.
2. It counts **code lines only** (blank + comment lines skipped), so raw `wc -l`
   and the ESLint number differ.
3. `max-lines-per-function` is **off**, so ESLint is blind to the worst offender:
   `bidUpdate.service.js` contains a **624-line single function** and reports
   nothing. File-length warnings and function-length risk are not the same problem.

## Existing precedent (do not invent a new pattern)

`f1869e65` already did this to the `DriverQueue` domain — it removed **4213 lines**
from `Services/DriverQueue.service.js` and produced the current layout:

```
Services/DriverQueue/
  index.js              <- re-export barrel (the only public surface)
  checkin.service.js
  dispatch.service.js
  dispatch-offer.service.js
  dispatch-notify.js
  expiry.service.js
  lifecycle.service.js
  position.service.js
  queue-admin.service.js
  release.service.js
  helpers.js
```

The convention is: **one concern per `*.service.js` inside a feature directory, with
`index.js` re-exporting.** `assignmentUpdate/transitions/` (one file per status
transition) is the same idea applied to a state machine.

---

## Inventory

### Production files over 500 code lines (7)

| Code | Raw | File | Structure | Importers |
|-----:|----:|------|-----------|----------:|
| 878 | 1217 | `Services/Database/tableManage.service.js` | 14 `ensure*` migrations + 5 CRUD fns | few |
| 776 | 1200 | `Services/DriverQueue/helpers.js` | 21 functions, grab-bag | **29** |
| 625 | 793 | `Services/DriverQueue/position.service.js` | 4 endpoint handlers | 3 |
| 603 | 748 | `Services/CompanyBid/bidUpdate.service.js` | 1 fn of **624 lines** | few |
| 552 | 718 | `Services/TransportCompany.service.js` | `getCompanies` 286 | few |
| 523 | 945 | `Services/ShipperRequest/readActive.service.js` | 8 geo fns + 1 fn of 414 | few |
| 502 | 735 | `Services/DriverQueue/dispatch-offer.service.js` | `offerToDriver` 383 | few |

### Function-level hot spots

```
Services/DriverQueue/position.service.js
  207  myPosition      [L44-250]
  158  checkout        [L366-523]
  115  yardPass        [L251-365]
  270  getQueueStatus  [L524-793]

Services/CompanyBid/bidUpdate.service.js
  624  updateBidStatus          [L59-683]   <- single function
   65  markCancellationAsSeen   [L683-748]

Services/ShipperRequest/readActive.service.js
  414  getAllActiveRequests     [L531-945]
  169  tagCorridorMatches       [L362-531]
  165  buildQueueEntry (helpers.js) [L597-762]
   84  resolveRouteCorridor     [L134-218]
   + 7 pure geo helpers [L35-134, L218-362]

Services/DriverQueue/dispatch-offer.service.js
  383  offerToDriver     [L352-735]
  145  createQueueOffer  [L207-352]
  106  ensureWaitingDriverRequest [L101-207]

Services/TransportCompany.service.js
  286  getCompanies     [L177-462]
  147  createCompany    [L30-176]
  134  approveCompany   [L572-705]
  109  updateCompany    [L463-571]

Services/Database/tableManage.service.js
  232  createTable      [L853-1085]
   14  ensure* migration functions [L48-853]
```

### Test / E2E files over 500 (9)

| Code | File |
|-----:|------|
| 712 | `E2ETests/Queue/QueueOrders.js` |
| 683 | `E2ETests/Queue/QueueYardAccess.js` |
| 613 | `E2ETests/Socket/index.js` |
| 607 | `E2ETests/Vehicles/vehicle.js` |
| 601 | `E2ETests/Queue/helpers.js` |
| 573 | `tests/jobsAlongRoute.test.js` |
| 531 | `E2ETests/Finance/Balance.js` |
| 527 | `E2ETests/ReceiptPod.js` |
| 508 | `E2ETests/testDriverRejectionFlow.js` |

---

## Target structure

### Tier 1 — mechanical, no logic change

**1. `Services/DriverQueue/position.service.js` (625 → 4 files)**

The seams are already drawn — it holds four unrelated endpoint handlers. One file
each, named to match siblings:

```
Services/DriverQueue/
  myPosition.service.js     (207)
  yardPass.service.js       (115)
  checkout.service.js       (158)
  queueStatus.service.js    (270)
  position.service.js       -> re-export barrel (keeps 3 importers untouched)
```

**2. `Services/Database/tableManage.service.js` (878 → migrations + CRUD)**

Fourteen independent `ensure*` functions are trivially separable:

```
Services/Database/
  migrations/
    deliveryConfirmation.migrations.js
    driverQueue.migrations.js
    schemaEnums.migrations.js
    indexes.migrations.js      <- runs them in the existing order
  tableManage.service.js       <- createTable/dropTable/dropAllTables/updateTable/checkTableExists
```

Order of execution must be preserved — these are applied in sequence against a live schema.

### Tier 2 — needs care, real logic

**3. `Services/CompanyBid/bidUpdate.service.js` — highest priority**

Extract the status dispatch into per-status handlers, mirroring
`assignmentUpdate/transitions/`:

```
Services/CompanyBid/
  bidUpdate.service.js          -> dispatch map + shared validators
  transitions/<status>.js
```

**Write characterisation tests BEFORE touching this file** — it has no unit test today.

**4. `Services/ShipperRequest/readActive.service.js`**

The 8 geo helpers (`distanceMeters`, `sampleCorridor`, `boxAround`, `tileCorridor`,
`resolveRouteCorridor`, `progressAlongRouteKm`, `insideAnyBox`, `corridorPredicate`)
are pure and dependency-free. Moving them to `Services/ShipperRequest/geo/corridor.js`
makes them unit-testable for free — this is the highest testability win per line moved.
Then split `getAllActiveRequests` (414) into query vs. corridor filtering.

### Tier 3 — highest blast radius, last

**5. `Services/DriverQueue/helpers.js` (776, 29 importers)**

Split by domain, keeping `helpers.js` as a re-export barrel so all 29 importers keep working:

```
Services/DriverQueue/helpers/
  busy.helper.js       findDriverBusyState, assertDriverNotDoubleBooked,
                      hasActiveJob, hasActiveJourney, getDriverQueueState
  entry.helper.js      buildQueueEntry, publicEntry, yardAccessForEntry
  number.helper.js     nextQueueNumber, nextLoadingNumber
  history.helper.js    logQueueHistory
  shipper.helper.js    resolveShipperUserByPhone, servingShipperFor,
                      yardAccessWithShipperTurn
```

**6. `Services/TransportCompany.service.js`** → `create` / `update` / `approve` / `read`.

**7. `Services/DriverQueue/dispatch-offer.service.js`** → split `offerToDriver` (383)
into offer creation, entry mutation, notification.

---

## Safety pattern (applies to every split)

**New files own the logic; the old path stays as a re-export barrel.**

No importer changes, so each split is a pure code move and `git diff` reads as
relocation rather than rewrite. One file per commit so any regression bisects to a
single module.

```js
// Services/DriverQueue/position.service.js  (after the split)
module.exports = {
  myPosition: require("./myPosition.service").myPosition,
  yardPass: require("./yardPass.service").yardPass,
  checkout: require("./checkout.service").checkout,
  getQueueStatus: require("./queueStatus.service").getQueueStatus,
};
```

## Verification gate (per tier)

| Step | Expectation |
|------|-------------|
| `npx jest` | **90 passed / 90 total** |
| `npx eslint <file>` | target file's `max-lines` warning **gone**; 0 errors |
| Public surface probe | `require()` the barrel and diff its exported keys against `HEAD` |
| Full Queue E2E | **108 tests**, with only the 4 known pre-existing failures |
| Live smoke | `GET /api/queue/driver/myPosition` returns `queue, shipper, driverQueueHistory, organization` |

**Known pre-existing E2E failures** (unrelated to this work — do not chase):
`QYA-03`, `QYA-05`, `QYA-06`, `QYA-08`.

## Risks

| Risk | Mitigation |
|------|------------|
| `helpers.js` has 29 importers | Last; barrel re-export keeps all of them byte-identical |
| `tableManage` migration **order** is load-bearing | Keep a single ordered `indexes.migrations.js` runner |
| `updateBidStatus` is untested | Characterisation tests before any edit (Tier 2 gate) |
| Silent import drift after removing code | ESLint `no-undef` + explicit surface probe in the gate |
| Scope creep into behaviour fixes | Any bug found while splitting becomes a **separate** commit |

## Out of scope

- Business-logic changes, bug fixes, or renames of public API fields.
- Turning on `max-lines-per-function` repo-wide before the outliers are fixed (see
  Open Decisions — it would fail immediately on `updateBidStatus`).

---

## Open decisions

1. **Test files:** split the 9 files, or add a `max-lines: off` override for
   `E2ETests/**` + `tests/**`? They are linear scenario scripts, so the cohesion
   intent of the rule barely applies and splitting them can hurt readability.
   *Recommendation:* the override — except `QueueOrders.js` (712) and
   `QueueYardAccess.js` (683), which are large enough to split by scenario.
2. **Enable `max-lines-per-function` (~100)?** It would immediately flag
   `updateBidStatus` (624), `getAllActiveRequests` (414), `offerToDriver` (383) —
   the real maintainability risks that file-length warnings miss. Recommend
   enabling with a baseline/disable pass rather than a big-bang cleanup.
3. **Commit hygiene:** `d8a68f08` ("create queue on bidd winning for individual and
   driver assignments", 2026-10-04 18:20) bundles five unrelated areas across 28
   files (+2831/−356). Consider splitting it into ~5 commits. This is a history
   rewrite and needs explicit approval.

## Definition of done

- [ ] 0 production files over 500 code lines
- [ ] 0 new ESLint errors; `max-lines` warnings cleared for the 7 target files
- [ ] Jest still 90/90
- [ ] Queue E2E still 108 tests with only the 4 known pre-existing failures
- [ ] No public API change (exported keys and HTTP response shapes unchanged)
- [ ] Each split landed as its own commit