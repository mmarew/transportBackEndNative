# `Database/Database.js` — Schema Slice Plan

Status: **PLAN ONLY — not started.**
Target: `Database/Database.js` (2439 raw lines / **2114 code lines** — the largest file in the repo).

## Findings

### Shape

The file is not application logic. It is **two SQL strings** and one export line:

| Lines | Symbol | Contents |
|------:|--------|----------|
| 13–50 | `driverQueueHistoryDdl` | 1 `CREATE TABLE` (DriverQueueHistory) |
| 52–2437 | `sqlQuery` | 5 `SET` + **78 `CREATE TABLE`** = 83 statements |
| 2439 | `module.exports` | `{ sqlQuery, driverQueueHistoryDdl }` |

No functions, no branching, no logic. A statement-keyword census found **only**
`CREATE TABLE` (79) and `SET` (5) — no `ALTER`, `INSERT`, `DROP`, `TRUNCATE`,
`UPDATE` or `DELETE` anywhere, so there is no seed data or migration logic to
accidentally split.

### The hard constraint: order is load-bearing

`Services/Database/tableManage.service.js:871` executes the whole schema as a
**single** statement batch:

```js
const adminConnection = await mysql.createConnection({ ...configWithoutDb, multipleStatements: true });
await adminConnection.query(sqlQuery);
```

So the concatenation order **must be preserved exactly** — MySQL has no deferred
FK creation, and a child table created before its parent fails with
`ER_FK_CANNOT_OPEN_PARENT` (1825) on a fresh database.

I verified the current ordering discipline (FK references bounded per table, not
per line window):

- **Only 2 backward FK references exist**, both in `driverQueueHistoryDdl`
  (`DriverQueueHistory` → `DriverQueue`, `Users`).
- Both are safe. `DriverQueueHistory` is created at original line **2342**, which is
  *inside* the `sqlQuery` literal and interpolates `${driverQueueHistoryDdl}` — i.e.
  `sqlQuery` **does** contain that DDL, and its FK parents (`Users`, `DriverQueue`)
  are created earlier in the same batch. It is also executed a second time at
  `tableManage.service.js:847` inside `ensureDriverQueueHistorySnapshotShape`, which
  `createTable` calls at line **926** — after `sqlQuery` (871). No fresh-DB ordering
  bug, and slicing must not move that interpolation earlier than slice 20.
- Every table inside `sqlQuery` has its FK parents defined before it.

### Blast radius: one consumer

```
$ grep -rn "require(.*Database/Database" --include="*.js" .
./Services/Database/tableManage.service.js:5
```

A single importer. (`Utils/Constants.js` and `scripts/migrate-queue-org-types.js`
merely *mention* the path in comments — they do not import it.) This is the
lowest-risk refactor in the repo.

### Audit correction

My earlier large-file inventory scanned `Services/Controllers/Routes/CRUD/Utils/Middleware`
and so **missed the whole `Database/` directory**. Repo-wide there are 16
`max-lines` warnings, and **two files are invisible to ESLint** because they opt out:

| File | Raw | Code | Visible to ESLint? |
|------|----:|-----:|--------------------|
| `Database/Database.js` | 2439 | 2114 | No — `/* eslint-disable max-lines */` line 1 |
| `Utils/ListOfSeedData.js` | 1293 | — | No — same disable |
| `Database/HistoryTables.js` | 534 | 502 | Yes — warns |

So `Database/HistoryTables.js` (502) is an **8th production file over the limit**
that my earlier list omitted. It should be added to the main plan.

---

## Target structure

Slices must be **contiguous line ranges** — you cannot group by domain freely,
because the file's order is not domain-clean (my first grouping attempt produced 3
contiguity violations). The ranges below are derived strictly from file order and
each is verified contiguous, in-order, and under the 500-line budget.

```
Database/
  Database.js                 <- keeps { sqlQuery, driverQueueHistoryDdl }; composer only
  HistoryTables.js            <- untouched by this plan
  schema/
    index.js                  <- ordered composition + ORDER-IS-LOAD-BEARING warning
    01_core_identity.js
    02_journey_users.js
    03_roles_permissions.js
    04_documents.js
    05_shipper_orders.js
    06_driver_orders.js
    07_vehicles_drivers.js
    08_ratings_profile.js
    09_comms.js
    10_payments.js
    11_canceled_tariff.js
    12_commission.js
    13_subscriptions.js
    14_finance.js
    15_notifications.js
    16_delinquency.js
    17_company_core.js
    18_company_bidding.js
    19_driver_bid.js
    20_queue.js
    21_delivery.js
    00_driver_queue_history.js   <- the separate driverQueueHistoryDdl export
```

### Slice manifest (all validated)

| Slice | Source lines | Tables | Code lines |
|-------|-------------:|-------:|-----------:|
| `01_core_identity` | 53–141 | 4 | 79 |
| `02_journey_users` | 142–229 | 4 | 79 |
| `03_roles_permissions` | 230–304 | 4 | 66 |
| `04_documents` | 305–446 | 5 | 124 |
| `05_shipper_orders` | 447–594 | 2 | 129 |
| `06_driver_orders` | 595–733 | 4 | 120 |
| `07_vehicles_drivers` | 734–838 | 5 | 93 |
| `08_ratings_profile` | 839–898 | 2 | 53 |
| `09_comms` | 899–939 | 2 | 37 |
| `10_payments` | 940–1000 | 3 | 52 |
| `11_canceled_tariff` | 1001–1073 | 3 | 66 |
| `12_commission` | 1074–1132 | 3 | 55 |
| `13_subscriptions` | 1133–1198 | 3 | 58 |
| `14_finance` | 1199–1363 | 6 | 137 |
| `15_notifications` | 1364–1392 | 1 | 24 |
| `16_delinquency` | 1393–1525 | 6 | 119 |
| `17_company_core` | 1526–1708 | 5 | 153 |
| `18_company_bidding` | 1709–2089 | 9 | **319** |
| `19_driver_bid` | 2090–2156 | 1 | 59 |
| `20_queue` | 2157–2332 | 4 | 165 |
| `21_delivery` | 2333–2436 | 2 | 86 |

Coverage: **53–2436**, exactly the `sqlQuery` body. Largest slice 319 code lines —
comfortably under 500.

## Composition shape

Each slice is a verbatim extracted range wrapped in a template literal. The
composer joins with `""` so the result is byte-identical to the original string:

```js
// Database/schema/index.js
const slices = [
  require("./01_core_identity"),
  require("./02_journey_users"),
  // ... in EXACTLY this order — see warning above
  require("./21_delivery"),
];
module.exports = { slices };
```

```js
// Database/Database.js  (public surface unchanged)
const { slices } = require("./schema");
const driverQueueHistoryDdl = require("./schema/00_driver_queue_history");

// ORDER IS LOAD-BEARING. Executed as one `multipleStatements` batch by
// createTable() (Services/Database/tableManage.service.js:871). MySQL has no
// deferred FK creation, so a child table emitted before its parent fails with
// ER_FK_CANNOT_OPEN_PARENT (1825) on a fresh database. Do NOT reorder, merge or
// "tidy" this list without re-running the fresh-DB gate below.
const sqlQuery = `${slices.join("")}\n`; // trailing \n reproduces the original literal

module.exports = { sqlQuery, driverQueueHistoryDdl };
```

`tableManage.service.js` requires `{ sqlQuery, driverQueueHistoryDdl }`, so with
the export shape above **that file needs zero changes**.

## Implementation method

1. Create `Database/schema/`.
2. Move `driverQueueHistoryDdl` (13–50) → `00_driver_queue_history.js`.
3. For each slice, `awk 'NR>=a && NR<=b' Database.js > schema/NN_name.js` — extract,
   never retype. Then wrap with the `"use strict";` header + template-literal
   fences.
4. Rewrite `Database.js` as the composer above.
5. Fix the one stale comment (see Risks).

## Verification gate

| Step | Expectation |
|------|-------------|
| **Byte-identity** | `node -e` compare the new `sqlQuery` against `git show HEAD:Database/Database.js` — **must be identical strings**. This is the single most important check. |
| Body diff | concatenate the 21 extracted ranges and `diff` against the original range (the technique used for `position.service.js`) |
| `node --check` | all 23 files |
| ESLint | 0 errors, and **no `max-lines` warning** on any slice (max is 319) |
| Import probe | `require` the module and assert `sqlQuery.length` + `driverQueueHistoryDdl.length` match HEAD exactly |
| **Fresh-DB execution** | `CREATE DATABASE scratch_ddl_slice_test`, `USE` it, run `sqlQuery` + `driverQueueHistoryDdl`, then `SHOW TABLES` and assert the expected table count; `DROP DATABASE` after |
| Consumer | `createTable()` still runs the 13 `ensure*` migrations in order afterwards |

The fresh-DB execution is the real gate. A byte-identical string proves the
refactor was textually faithful; it does **not** prove MySQL still accepts the
schema. Running it against an empty database is what catches an ordering mistake.

## Risks

| Risk | Mitigation |
|------|------------|
| Reordering slices breaks FK creation on a fresh DB | `ORDER IS LOAD-BEARING` comment in `index.js` + fresh-DB gate |
| Hand-retyping SQL introduces a typo | Extract with `awk`, never retype; prove with byte-identity diff |
| **Stale line reference** — `Database.js:590` says *"QueueOrganization is created LATER in this schema (line ~2081)"*; that line number dies with the split | Rewrite to name the slice file (`schema/20_queue.js`) instead of a line number |
| Moving `driverQueueHistoryDdl` earlier breaks its 2 deferred FKs | Keep it a separate export, still executed at `tableManage.service.js:847` / called at 926 |
| `multipleStatements` truncation limits | Unchanged — same single string, same connection flags |
| Slices read as "arbitrary chunks" | Numeric prefixes encode emission order; manifest table above documents the grouping |

## Out of scope

- Reordering tables to fix the domain-adjacent ordering (e.g. `DeviceTokens` before
  `Statuses`). Tempting, but it is a schema-behaviour change and belongs in its own
  commit with its own fresh-DB proof.
- Any column, index, FK or charset change. This plan moves text only.
- `Database/HistoryTables.js` (502 lines, 24 snapshot tables) — worth slicing next
  using this same pattern, but a separate plan.
- `Utils/ListOfSeedData.js` (1293 lines) — seed data, different shape, different plan.
- `Services/Database/tableManage.service.js` (878) — its 13 `ensure*` migrations are
  *also* order-dependent, and are covered by the main `LARGE_FILE_REFACTOR_PLAN.md`.

## Open questions

1. **21 slices, or coarser (~8)?** 21 keeps every file under ~320 lines and each
   domain readable, at the cost of 21 files. Coarser groupings (e.g. merge
   `08`–`13` into one `billing_and_comms`) reduce file count but need contiguity
   that the current order does not offer cleanly.
2. **Should `HistoryTables.js` be sliced in the same pass?** It is the same kind of
   file (one DDL string) and the same technique applies; doing both together means
   one migration-verification cycle instead of two.
3. **Remove `/* eslint-disable max-lines */` from `Database.js`?** Once it is a
   ~20-line composer the disable becomes dead and misleading. Recommend yes.