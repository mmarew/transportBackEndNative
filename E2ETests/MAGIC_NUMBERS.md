# E2E Magic Numbers — Reference

A legend for the numeric literals scattered across the E2E suite, so tests can
be read (and updated) against the backend's named constants instead of raw
numbers.

## Why the literals exist

The numbers fall into two distinct categories:

1. **Domain-ID literals (genuine magic numbers).** Journey-status IDs, role
   IDs, user-status IDs, and cancellation-reason IDs are primary keys/`*Id`
   columns in the backend. Their source of truth is `Utils/ListOfSeedData.js`
   (`journeyStatusMap`, `usersRoles`, `USER_STATUS`, `cancellationReasons`).
   The E2E suite **inlines** them instead of importing that module because
   importing it chains into `Utils/CurrentDate.js` and can trigger macOS
   `com.apple.provenance` EPERM errors at test startup — see the comment at the
   top of `constants.js`. Role IDs were already mirrored there (`usersRoles`);
   the rest were left as literals as the tests grew around the live driver
   journey state machine.

2. **Test fixtures (NOT magic numbers).** Coordinates (`9.03`, `38.74`), prices
   (`40000`, `58000`, `100000`), quantities (`450` quintal), dates, and
   `OTP: 101010` are arbitrary sample data — they are intentionally not
   constants and should not be extracted.

Backend `Services/`/`Controllers/` runtime code is already clean: it uses
`journeyStatusMap.*`, `usersRoles.*`, and `USER_STATUS.*` rather than literals
(see §7 for the few remaining exceptions).

## 1. Journey status IDs — `journeyStatusMap`

Source of truth: `Utils/ListOfSeedData.js` → `journeyStatusMap`. Mirrored in
`E2ETests/constants.js` → `journeyStatusMap` (same values).

| ID | Constant (`journeyStatusMap.`) | Name                 | Used by E2E |
| -- | ------------------------------ | -------------------- | ----------- |
| 1  | `waiting`                      | Initial state        | ✅          |
| 2  | `requested`                    | Sent to a driver     | ✅          |
| 3  | `acceptedByDriver`             | Driver bid/accept    | ✅          |
| 4  | `acceptedByShipper`            | Shipper selected     | ✅          |
| 5  | `journeyStarted`               | Driver started       | ✅          |
| 6  | `journeyCompleted`             | Delivered            | ✅          |
| 7  | `cancelledByShipper`           | Whole job cancelled  | ✅          |
| 8  | `rejectedByShipper`            | Price-reject one drv | ❌          |
| 9  | `cancelledByDriver`            | Driver cancels       | ❌          |
| 10 | `cancelledByAdmin`             | Admin cancels        | ✅          |
| 11 | `completedByAdmin`             | Admin completes      | ❌          |
| 12 | `cancelledBySystem`            | System cancels       | ❌          |
| 13 | `noAnswerFromDriver`           | Driver no-answer     | ❌          |
| 14 | `notSelectedInBid`             | Lost a bid           | ✅          |
| 15 | `rejectedByDriver`             | Driver refuses       | ❌          |
| 16 | `replacedByCompanyAssignment`  | Company override     | ❌          |
| 17 | `partiallyCancelled`           | Batch partial cancel | ❌          |

Where the ✅ IDs appear: `status === N` state-machine chains in
`Driver/DriverRequest.js`; `journeyStatusId` assertions in
`Queue/QueueOrders.js` and `Queue/QueueAdminOps.js`; direct `SET
journeyStatusId` in `Socket/index.js`; `?journeyStatusId=3` in `Socket/index.js`.

## 2. Role IDs — `usersRoles`

Source of truth: `Utils/ListOfSeedData.js` → `usersRoles`. Already mirrored in
`E2ETests/constants.js` → `usersRoles`.

| ID | Constant            | Role          | Used in E2E query strings |
| -- | ------------------- | ------------- | ------------------------- |
| 1  | `shipperRoleId`     | Shipper       | —                         |
| 2  | `driverRoleId`      | Driver        | `roleId=2` (cancel flows) |
| 3  | `adminRoleId`       | Admin         | —                         |
| 4  | `vehicleOwnerRoleId`| Vehicle owner | —                         |
| 5  | `systemRoleId`      | System        | —                         |
| 6  | `supperAdminRoleId` | Super admin   | —                         |
| 7  | `companyAdminRoleId`| Company admin | —                         |
| 8  | `companyRoleId`     | Company entity| `roleId=8` (`Company/CompanyProfileManagement.js`) |
| 9  | `vehicleRoleId`     | Vehicle entity| `roleId=9` (`Vehicles/vehicle.js`, `Driver/VehicleDriver.js`) |
| 10 | `dispatcherRoleId`  | Dispatcher    | —                         |
| 11 | `queueOrgAdminRoleId` | Queue org admin | —                      |

## 3. Cancellation reason IDs — `CancellationReasonsType`

`CanceledJourneys.cancellationReasonsTypeId` is a foreign key to
`CancellationReasonsType`, seeded from `Utils/ListOfSeedData.js` →
`cancellationReasons` (auto-increment `cancellationReasonsTypeId`). **The
numeric values depend on seed order and are therefore fragile.** Mirrored in
`E2ETests/constants.js` → `cancellationReasonsType`.

| ID | Constant (`cancellationReasonsType.`) | E2E flow                                        |
| -- | ------------------------------------- | ----------------------------------------------- |
| 2  | `driverCancel`                        | Driver cancels (`roleId=2`, `DriverRequest.js`, `Queue/helpers.js`, `Queue/QueueOrders.js`, `testDriverRejectionFlow.js`) |
| 6  | `shipperWholeJobCancel`               | Shipper whole-job cancel (queue tests: `Queue/helpers.js`, `Queue/QueueOrders.js`) |

> Verify the exact reason text for these IDs against `CancellationReasonsType`
> in the target DB before changing them.

## 4. User status IDs — `USER_STATUS`

Source of truth: `Utils/ListOfSeedData.js` → `USER_STATUS`.

| ID | Constant            | Meaning |
| -- | ------------------- | ------- |
| 1  | `ACTIVE`            | Active user/vehicle. Used as `statusId: 1` default in `Services/DriverRequest/actionTakeFromStreet.service.js:87` and admin fixtures |
| 6  | `INACTIVE_USER_IS_BANNED_BY_ADMIN` | Banned (referenced in `Services/CommissionEvasion.service.js` docs) |

## 5. String status params

| Value | Used at |
| ----- | ------- |
| `?seenStatus=not%20seen%20by%20driver%20yet` | `Driver/DriverRequest.js` (`testGetCancellationNotifications`) — mirrored as `seenStatusNotSeenByDriver` in `constants.js` |

## 6. Per-file usage index (E2E)

| File                                                              | IDs used                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `Driver/DriverRequest.js`                                         | journey 1,2,3,4,5,14; role 2; reason 2; `seenStatus` string; `journeyStatusId="1,2"` |
| `Driver/DriverJourneyStatus.js`                                   | journey statuses referenced in comments/defaults (2,4,5)                  |
| `Driver/VehicleDriver.js`                                         | role 9                                                                    |
| `Queue/QueueOrders.js`                                            | journey 1,2,3,7,10; role 2; reason 2,6                                    |
| `Queue/QueueAdminOps.js`                                          | journey 1                                                                 |
| `Queue/helpers.js`                                                | journey 2 (default); role 2; reason 2,6                                   |
| `Queue/QueueOrg.js`                                               | role 11 / org setup ids (verify)                                          |
| `Shipper/ShipperRequest.js`                                       | journey 1,2 (query params)                                                |
| `Shipper/ShipperRequestBatch.js`                                  | journey statuses (batch flow)                                             |
| `Company/CompanyProfileManagement.js`                             | role 8                                                                    |
| `Journey/JourneyCounts.js`                                        | role 2                                                                    |
| `Journey/JourneyDecisions.js`                                     | journey statuses                                                          |
| `Vehicles/vehicle.js`                                             | role 9                                                                    |
| `Socket/index.js`                                                 | journey 3,5,6; `SET journeyStatusId`; `IN (...)` placeholders             |
| `Status/MarkAsSeen.js`                                            | `seenStatus` strings                                                      |
| `Admin/Dashboard.js`, `Admin/SystemAdmin.js`, `Auth/authApi.js`   | role/status literals (verify per use)                                     |
| `Phases/runCompanyFlow.js`, `runIndividualFlow.js`, `runTakeFromStreetFlow.js` | journey statuses in phase scripts                          |
| `testDriverRejectionFlow.js`                                      | role 2; reason 2                                                          |
| `constants.js`                                                    | source of the mirrored maps (`usersRoles`, `journeyStatusMap`, `cancellationReasonsType`, `seenStatusNotSeenByDriver`) |

## 7. Backend residual literals (outside E2E)

Runtime code is constant-based; the exceptions to know about:

| Location | Literal | Note |
| -------- | ------- | ---- |
| `Services/DriverRequest/actionTakeFromStreet.service.js:87` | `statusId: 1` | Default status; equivalent to `USER_STATUS.ACTIVE` |
| `Services/ShipperRequestBatch/batchCancel/sendNotifications.service.js:212,255` | `roleId: 2/1` | Cancel notification records |
| `Services/DriverRequest/journeyManagement.service.js:186,431`, `actionAcceptShipperRequest.service.js:178`, `actionTakeFromStreet.service.js:86` | `roleId: 1` | CanceledJourneys records |
| `Services/Journey` / `Controllers/Journey.controller.js` comments | `journeyStatusId=5/6`, `roleId=1/2` | Doc comments only — no runtime effect |

## 8. Fragility notes

- `status === N` chains in `Driver/DriverRequest.js` encode the driver journey
  state machine (1 → 2 → 3 → 4 → 5 → 6, with 14 as a dead-end after bid loss).
  If the backend ever renumbers `journeyStatus`, every chain must be updated.
- `cancellationReasonsTypeId` values are seed-order dependent; a DB reseeded
  with extra reasons shifts every id.
- `Socket/index.js` writes `journeyStatusId` directly to the DB via SQL — keep
  in sync with the constants, not the API.
- Regexes above are deliberately `journeyStatusMap.*`-aware: the E2E suite must
  stay a self-contained mirror and must **not** import
  `Utils/ListOfSeedData.js` (EPERM startup risk).

## 9. Follow-up (status)

- [x] `E2ETests/MAGIC_NUMBERS.md` — this reference.
- [x] `E2ETests/constants.js` — added `journeyStatusMap`, `cancellationReasonsType`, `seenStatusNotSeenByDriver` mirrors.
- [x] Literal replacement across the E2E suite (see §6).
- Fixtures (coordinates/prices/quantities) intentionally left as-is.
