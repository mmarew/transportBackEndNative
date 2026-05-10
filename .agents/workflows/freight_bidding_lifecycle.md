---
description: Freight Bidding & E2E Journey Lifecycle
---

This workflow describes the complete end-to-end journey of a freight request, from initial shipper creation to final journey completion and fleet capacity release.

### 1. Request Creation (Shipper)
- **Action**: Shipper creates a "Freight Batch" (Request for multiple or single trucks).
- **Endpoint**: `POST /api/passenger/createPassengerRequestBatch`
- **Status**: `journeyStatusId` = 1 (Waiting).
- **Lazy Creation**: For `company_target` mode, ONLY the `PassengerRequestBatch` header
  is created — no individual `PassengerRequest` rows. PRs are deferred to Step 4.
  For `individual_target` mode, PRs are created immediately (eager path).

### 2. Matching & Notification
- **Action**: System identifies eligible transport companies.
- **Notification**: Companies receive FCM notifications.
- **Discovery (Company)**: `GET /api/company/bids?target=available`

### 3. Bid Submission (Company Dispatcher)
- **Action**: Company dispatcher submits a bid (Total Price + Dates).
- **Endpoint**: `POST /api/company/bids`
- **Validation**: System checks `validateFleetCapacity`.
- **Status**: `bidStatus` = `submitted`.

### 4. Bid Selection (Shipper)
- **Action**: Shipper reviews and picks the "Winner".
- **Endpoint**: `PATCH /api/company/bids/:id/status` (Body: `{ "bidStatus": "accepted_by_shipper" }`)
- **Status**: `bidStatus` → `accepted_by_shipper`.
- **Lazy PR Creation**: For `company_target` mode, this is when `PassengerRequest` rows
  are created from batch metadata (`numberOfVehiclesOffered` rows). Born with status
  `acceptedByPassenger`. Coordinates and metadata are inherited from the batch header.

### 5. Winner & Loser Notifications
- **Action**: FCM notifications sent to winning and losing bidders automatically.

### 6. Driver & Vehicle Assignment (Dispatcher)
- **Action**: Winning dispatcher assigns specific driver and vehicle.
- **Endpoint**: `POST /api/company/assignments`
- **Status**: `assignmentStatus` = `assigned`.

### 7. Driver Confirmation (Driver App)
- **Action**: Driver confirms assignment via the App.
- **Endpoint**: `PATCH /api/company/assignments/:id/status` (Body: `{ "assignmentStatus": "confirmed_by_driver" }`)

### 8. Journey Execution (Driver App)
- **Action**: Driver "Starts" and "Completes" the journey.
- **Start Endpoint**: `PUT /api/driver/startJourney` (Status 5)
- **Complete Endpoint**: `PUT /api/driver/completeJourney` (Status 6)

### 9. Journey Completion & Capacity Release
- **Action**: Status propagates to `CompanyBidVehicleAssignment` and `CompanyBidRequest`.
- **Result**: Fleet capacity is automatically released.
