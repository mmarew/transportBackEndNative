# Review fixes — check-in / re-check-in + queue cleanup

## 1. Redundant org existence check — FIX (Services/DriverQueue.service.js)
- `queueOrgReady` (:101): add `FOR UPDATE` to its SELECT (org row, `isDeleted = 0`).
- Delete the duplicate checkin block :679-693 (lock SELECT + NOT_FOUND throw).
- Keeps serialization (first-check-in race); also harmless for the other locked
  callers (manualCheckin :1381, offerToDriver :2258 — both in transactions).
- Also needed by fix 5: the org lock serializes concurrent same-driver
  check-ins so the idempotent fence sees the committed row, not a phantom.

## 2. Reuse canonical VehicleDriver CRUD — FIX
- Services/VehicleDriver.service.js `getVehicleDrivers` (:86):
  - SELECT gains `dr.fullName, dr.phoneNumber` (Users `dr` already joined).
  - New optional `phoneNumber` filter (manualCheckin resolves by phone).
- Services/DriverQueue.service.js:
  - Import `getVehicleDrivers`.
  - checkin :697 → `getVehicleDrivers({ vehicleDriverUniqueId,
    assignmentStatus:'active', limit:1 })` → data[0]; NOT_FOUND + deleted guard.
  - manualCheckin :1386/:1388 → same via `vehicleDriverUniqueId` or
    `phoneNumber`; identical guards.
  - Delete local `getVehicleDriverType` (:261) + `getVehicleDriverByPhone` (:289).
- `getVehicleDrivers` runs on transactionStorage.getStore() = the checkin txn
  connection, so transactional behavior is unchanged.

## 3. hasActiveJourney vs verifyDriverJourneyStatus — KEEP AS-IS
- verifyDriverJourneyStatus is the public driver poll: reads via global
  pool/getData (outside the txn) and WRITES (handleExistingJourney.service.js
  :106 resets an inconsistent DriverRequest to waiting). Safe fence needs the
  narrow, read-only, executor-bound `hasActiveJourney` (:566). No change.

## 4. getDriverQueueState vs myPosition — KEEP, but slim down (touches fix 5)
- myPosition is the public poll (newest IN_QUEUE only, unlocked, enriched).
- `getDriverQueueState` stays the transactional fence read (FOR UPDATE on the
  driver's rows; detects 'active today anywhere').
- With retire removed (fix 5), `atOrg` is no longer used → drop it from this
  helper's return + JSDoc; return `{ active }` (keep the FOR UPDATE query).

## 5. Re-check-in = NEW ROW ONLY, old entry untouched — FIX
- checkin (:770-789) and manualCheckin (:1436-1455): DELETE the
  `if (atOrg) { logQueueHistory(RECHECKIN); updateData(retire → status 12,
  queueDeletedAt) }` block. The previous row is NEVER mutated by check-in.
  (Decision path mutations — accept/reject/progress/checkout — are unchanged.)
- New fence, same in both:
  - `active` in ANOTHER org → keep the existing 409 "one queue per day".
  - `active` in THIS org → idempotent: return the existing entry
    (`data.alreadyCheckedIn: true` + entry) — no insert, no mutation.
  - no `active` → fresh insert (brand-new queueUniqueId + back-of-line number)
    as today. Many re-check-ins ⇒ many rows, each after the prior job finished.
- Removed dependencies: `checkInLat/Lng` no longer fall back to `atOrg`
  coords (fresh GPS or null); `preserveTarget` no longer carries an old
  reservation (nothing to preserve when the day is clean).
- Removed `RECHECKIN` history event on the old row; new entry still logs
  CHECKIN / MANUAL_CHECKIN.
- Result: with the fence, ≤ 1 live row per (driver, org, day), so the ~20
  `queueDeletedAt IS NULL` queries (dispatch scan, offerToDriver :2379,
  sweep :2925, board, findNearbyDrivers, myPosition) need NO changes.

## Intentional behavior changes to confirm
- Re-check-in while still in line (WAITING/18/16) no longer refreshes the
  position or re-anchors coordinates — it returns the existing entry. A driver
  who wants a fresh row must checkout first, then check in.
- After a driver rejects an order (entry keeps status 18), a re-check-in now
  returns the existing entry instead of inserting a fresh row — consistent
  with the batch guard (no auto re-offer), but different from earlier tests.

## Files touched
- Services/DriverQueue.service.js — points 1, 2, 4, 5 + JSDoc updates
- Services/VehicleDriver.service.js — point 2 (enrich getVehicleDrivers)
- Services/ShipperRequest/statusVerification.service.js — indentation fix
  (pending from earlier)

## Verification
- node --check + eslint on changed files.
- Restart server. Smoke (live tokens, temp maketok.js if wiped):
  1. checkin → 200, DB shows exactly 1 live entry.
  2. checkin again same org/day → 200 alreadyCheckedIn, SAME queueUniqueId,
     DB still 1 live entry.
  3. checkin at another org → 409.
  4. checkout → entry terminal → checkin → NEW row (DB live count = 1).
  5. bid pull still links the fresh entry (pull block unchanged).
- Grep for dangling refs to deleted helpers/atOrg.