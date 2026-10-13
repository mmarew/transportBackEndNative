# Data Model (TDD / LLD)

MySQL 8 schema for the Transport Management System API — **103 tables**
(live database enumeration; naming pattern `<Entity>`, `<Entity>History` for
audit copies). All writes use parameterized SQL via `mysql2`; multi-step writes
run inside transactions (`Utils/DatabaseTransaction.js`).

## 1. Entity groups

### Identity & access
`Users`, `usersCredential`, `UserProfileHistory`, `UserRole`,
`UserRoleStatusCurrent`, `UserRoleStatusHistory`, `Roles`, `RolesHistory`,
`RoleDocumentRequirements`, `DeviceTokens`, `BannedUsers`, `SMSSender`.

Core relations: `Users 1—1 usersCredential` (hashed password + contact),
`Users 1—* UserRole 1—* Roles` (a user may hold several roles),
`UserRole *—1 UserRoleStatusCurrent` (current active/suspended state).

### Transport requests & journeys (core flow)
`ShipperRequest`, `ShipperRequestBatch`, `DriverRequest`, `DriverBid`,
`Journey`, `JourneyDecisions`, `JourneyStatus`, `JourneyStatusHistory`,
`JourneyRoutePoints`, `JourneyNotifications`, `JourneyPayments`,
`CanceledJourneys`, `CancellationReasonsType`, `DeliveryConfirmations`,
`DeliveryConfirmationPhotos`.

Relations:
- `ShipperRequest *—1 ShipperRequestBatch` (batch = multi-vehicle company order;
  `shipperRequestBatchUniqueId`), `ShipperRequest *—1 VehicleTypes`
- `DriverRequest` — driver-side offer state (driver `userUniqueId`,
  `journeyStatusId`, `activeRequestGuard`); one row per driver offer
- `DriverBid` — the price offer linking both sides: `shipperRequestUniqueId` +
  `driverRequestUniqueId` + `driverUserUniqueId` + `bidAmount`/`bidStatus`
  (`ShipperRequest 1—* DriverBid *—1 DriverRequest`)
- `JourneyDecisions` — immutable decision log joining `shipperRequestId` +
  `driverRequestId` with the resulting `journeyStatusId`, decision time/actor
  and bid/cost dates (every accept/reject/cancel/status move writes a row)
- `Journey` — trip execution record created off `journeyDecisionUniqueId`
  (loading/transit/completion timestamps + GPS + proof-of-loading)
- `ShipperRequest *—1 JourneyStatus` via `journeyStatusId` (1–20, see
  [`journey-status-machine.md`](journey-status-machine.md))
- `DeliveryConfirmations 1—* DeliveryConfirmationPhotos` (proof of delivery)

### Companies & fleet
`TransportCompany`, `CompanyMembership`, `CompanyRoles`, `CompanyRolesHistory`,
`CompanyProfileHistory`, `CompanyVehicle`, `Vehicle`, `VehicleTypes`,
`VehicleStatus`, `VehicleStatusTypes`, `VehicleOwnership`, `VehicleDriver`,
`CompanyRating`, `CompanyBan`, `CompanyProfileHistory`.

Relations: `TransportCompany 1—* CompanyMembership *—1 Users`;
`TransportCompany 1—* CompanyVehicle *—1 Vehicle`;
`Vehicle 1—* VehicleDriver *—1 Users` (driver↔vehicle assignment with
active/inactive status).

### Dispatch queue
`QueueOrganization`, `QueueOrganizationMembership`, `DriverQueue`,
`QueueAuditLog`.

`DriverQueue` holds the FIFO dispatch order per queue context; membership links
users to queue organizations (roles 11/12); every entry/exit is journaled in
`QueueAuditLog`.

### Bidding & assignment (company target)
`CompanyBidRequest`, `CompanyBidVehicleAssignment`.

`ShipperRequest(batch) 1—* CompanyBidRequest 1—* CompanyBidVehicleAssignment`.

### Finance
`UserDeposit`, `DepositSource`, `UserBalance`, `UserBalanceTransfer`,
`UserRefund`, `FinancialInstitutionAccounts`, `PaymentMethod`, `PaymentStatus`,
`Commission`, `CommissionRates`, `CommissionStatus`, `CompanyCommission`,
`TariffRate`, `TariffRateForVehicleTypes`, `JourneyPayments`.

Flow: `UserDeposit` (created by SantimPay webhook) → `UserBalance` credit →
earnings/commission splits (`Commission` / `CompanyCommission` against
`CommissionRates`) → payouts/refunds (`UserRefund`, `UserBalanceTransfer`).
Tariffs: `TariffRate *—* VehicleTypes` via `TariffRateForVehicleTypes`.

### Documents & media
`AttachedDocuments`, `AttachedDocumentsHistory`, `DocumentTypes`.
`AttachedDocuments *—1 DocumentTypes`, polymorphic owner (user/vehicle/company),
validated by `CheckDocumentTypeExists` / `CheckDuplicateDocuments`.

### Delinquency & governance
`UserDelinquency`, `UserDelinquencyResponse`, `CompanyDelinquency`,
`CompanyDelinquencyResponse`, `AdminDecisionOnDelinquency`,
`AdminDecisionOnUserDelinquency`, `BannedUserDelinquency`,
`CompanyBanDelinquency`, `DelinquencyTypes`, `Ratings`.

### Subscriptions & reference data
`SubscriptionPlan`, `SubscriptionPlanPricing`, `UserSubscription`,
`VehicleTypes`, `VehicleStatusTypes`, `Statuses`, `JourneyStatus`,
`DocumentTypes`, `CancellationReasonsType`, `DepositSource`, `PaymentMethod`,
`PaymentStatus` (+ their `*History` twins).

## 2. Conventions

- **Primary business keys:** `...UniqueId` UUID columns (indexed), used in
  routes and payloads. Numeric surrogate ids (`userId`, `journeyStatusId`,
  `roleId`, …) exist for legacy joins and status maps.
- **Audit:** mutable entities have a paired `<Entity>History` table written on
  every INSERT/UPDATE (`Services/History/History.service.js` →
  `insertHistoryRecord`), storing who/when/change type.
- **Soft delete:** `...DeletedAt IS NULL` guards on read paths.
- **Timestamps:** `...CreatedAt` / `...UpdatedAt` / `...CreatedBy` /
  `...UpdatedBy` columns.
- **Enums** are stored as small int ids referencing seeded reference tables
  (`JourneyStatus`, `Roles`, `Statuses`, `PaymentStatus`, …) with labels joined
  on read.
- **State machine tables** (`UserRoleStatusCurrent`) keep exactly one current
  row per subject; transitions are appended to the matching `*History` table.

## 3. Referential diagram (core flow)

```
Users ──< UserRole >── Roles
  │
  ├──< ShipperRequest >── JourneyStatus
  │        │  ├──< DriverBid >── DriverRequest (driver-side offer, driver user)
  │        │  ├──< JourneyDecisions ──< JourneyRoutePoints (GPS trace)
  │        │  └──> ShipperRequestBatch ──< CompanyBidRequest ──< CompanyBidVehicleAssignment
  │        └── (via chosen JourneyDecision) 1─ Journey ── 1─ DeliveryConfirmations
  │                                                        └──< DeliveryConfirmationPhotos
  ├──< VehicleDriver >── Vehicle ──< CompanyVehicle >── TransportCompany
  ├──< CompanyMembership >── TransportCompany
  ├──< DriverQueue >── QueueOrganization
  └──< UserDeposit / UserBalance / Commission …
```

## 4. Access patterns

- All queries go through `CRUD/Read/ReadData.js` (`getData`) and
  `CRUD/Update/*` helpers or hand-written parameterized SQL in services.
- Listing uses the shared pagination/sorting contract
  (see [`api-conventions.md`](api-conventions.md) §5); the shipper-request list
  applies connected-first ordering with an `EXISTS` subquery over
  `JourneyDecisions` + `DriverRequest`.
- Read enrichment (driver, decisions, batch, POD) happens in
  `Services/ShipperRequest/read/detailed.service.js`.
