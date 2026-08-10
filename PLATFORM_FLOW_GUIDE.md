# Dynamics Transport — Full Platform Flow Guide

**Version:** 1.0 | **Last Updated:** August 2026
Complete end-to-end lifecycle of all platform roles — from registration to journey completion.

---

## Table of Contents

1. Roles Overview
2. Authentication Flow (All Roles)
3. Super Admin Flow
4. Admin Flow
5. Shipper Flow
6. Driver Flow
7. Company Admin Flow
8. Dispatcher Flow
9. Queue Organization Admin Flow
10. The Core Journey Lifecycle (Status Map)
11. Individual Journey Flow (Shipper to Driver)
12. Company Freight Batch Flow (Shipper to Company)
13. Finance and Settlement Flow
14. Notifications and Real-Time Events
15. Quick Reference: Key Endpoints

---

## 1. Roles Overview

| Role ID | Role Name            | Description                                                 |
| ------- | -------------------- | ----------------------------------------------------------- |
| 1       | **Shipper**          | Posts cargo requests; accepts driver offers or company bids |
| 2       | **Driver**           | Individual truck operator; receives and fulfills trips      |
| 3       | **Admin**            | Platform moderator; reviews documents, manages users        |
| 4       | **Vehicle Owner**    | Owns vehicles that drivers can use (delegation flow)        |
| 5       | **System**           | Automated background processes                              |
| 6       | **Super Admin**      | Full platform control; manages admins via API/Postman       |
| 7       | **Company Admin**    | Manages their company, fleet, bids, and assignments         |
| 8       | **Company** (entity) | Entity role for company-level document requirements         |
| 9       | **Vehicle** (entity) | Entity role for vehicle-level document requirements         |
| 10      | **Dispatcher**       | Company dispatcher who manages fleet day-to-day             |
| 11      | **Queue Org Admin**  | Manages driver dispatch queues at loading stations          |

---

## 2. Authentication Flow (All Roles)

Every user regardless of role goes through the same sequence:

```
REGISTER --> OTP Sent --> VERIFY OTP --> Account Active --> LOGIN
```

### Step 1 — Register

```
POST /register

Body: { fullName, phoneNumber (mandatory), email (auto-generated if omitted), password }
```

- On success: 6-digit OTP sent via SMS + email verification link sent
- The new user account is created but marked as unverified until OTP is confirmed

### Step 2 — Verify OTP

```
POST /verifyUserByOTP

Body: { phoneNumber, phoneOTP }
```

- On success: phone verified, account activated, JWT token returned

### Step 3 — Login

```
POST /login

Body: { phoneNumber, password }
```

- Returns JWT token
- Use as: `Authorization: Bearer <token>` in all subsequent requests
- All further actions below require this token

> **Admin-created users:** Admins can also create users via `POST /api/auth/createUserByAdmin` (requires admin token). New users still must verify via OTP.

---

## 3. Super Admin Flow

Super Admin has full platform authority. Uses Postman or admin tools — there is no mobile app for this role.

### First-Time System Setup

```
System boots
  -> preStart.js seeds: roles, statuses, vehicle types, document types

Super Admin auto-created from .env variables:
  SUPER_ADMIN_PHONE, SUPER_ADMIN_EMAIL, SUPER_ADMIN_TEMP_PASSWORD

Super Admin logs in: POST /login
Super Admin creates Admin accounts: POST /api/auth/createUserByAdmin
Super Admin sets tariff rates per vehicle type: POST /api/admin/tariffRateForVehicleType
```

### Super Admin Actions

| Action                          | Endpoint                                 |
| ------------------------------- | ---------------------------------------- |
| Create Admin users              | POST /api/auth/createUserByAdmin         |
| Manage user statuses            | GET/PATCH /api/admin/userRoleStatus      |
| Manage vehicle types            | GET/POST/PATCH /api/admin/vehicleTypes   |
| Set tariff rates                | POST /api/admin/tariffRateForVehicleType |
| Ban/unban any user              | POST /api/admin/bannedUsers              |
| Review and decide delinquencies | POST /api/admin/userDelinquencyDecisions |
| Seed the database               | POST /api/database/seed                  |

---

## 4. Admin Flow

Admins approve or reject documents, manage user accounts, and handle delinquencies.

### Admin Document Review Flow

```
Driver uploads documents
        |
        v
Admin receives notification
        |
        v
Admin reviews document --> APPROVE or REJECT
        |                        |
        v                        v
Driver status -> ACTIVE    Driver status -> INACTIVE (rejected)
                           Driver notified and must re-upload
```

### Admin Actions

| Action                      | Endpoint                                 |
| --------------------------- | ---------------------------------------- |
| Review all documents        | GET /api/attachedDocuments               |
| Approve or reject document  | PATCH /api/attachedDocuments/:id         |
| Ban a user                  | POST /api/admin/bannedUsers              |
| Unban a user                | DELETE /api/admin/bannedUsers/:id        |
| Create delinquency case     | POST /api/admin/userDelinquency          |
| Rule on delinquency dispute | POST /api/admin/userDelinquencyDecisions |

### User Account Status Values

| ID  | Meaning                               |
| --- | ------------------------------------- |
| 1   | Active — all documents approved       |
| 2   | Inactive — vehicle not registered     |
| 3   | Inactive — required documents missing |
| 4   | Inactive — documents rejected         |
| 5   | Inactive — documents pending review   |
| 6   | Inactive — banned by admin            |
| 7   | Inactive — no active subscription     |
| 8   | Account deleted                       |

---

## 5. Shipper Flow

The Shipper is the cargo owner who posts freight requests and selects drivers or accepts company bids.

### 5.1 Registration to Active Account

```
Register -> OTP Verify -> Login
                |
                v
     Upload Profile Photo (optional)
     Upload National ID (optional)
                |
                v
     Shipper is ACTIVE immediately (documents are optional for shippers)
```

### 5.2 Post an Individual Freight Request

```
requestMode: "individual_target"

Body:
{
  "originPlace": "DSTV, Kombolcha, Amhara Region",
  "originLatitude": "11.05072090",
  "originLongitude": "39.74932460",
  "destinationPlace": "Dessie, Amhara Region",
  "destinationLatitude": "11.12260400",
  "destinationLongitude": "39.63498200",
  "shippableItemName": "Coffee",
  "shippableItemQtyInQuintal": 300,
  "vehicleTypeUniqueId": "uuid-of-vehicle-type",
  "requestMode": "individual_target"
}
```

### 5.3 Individual Request Flow — After Request is Posted

```
Shipper posts request (status: waiting / 1)
        |
        v
System finds nearest available driver from queue
        |
        v
Request sent to Driver (status: requested / 2) + FCM push
        |
        |-- Driver ACCEPTS --> status: acceptedByDriver (3)
        |           |          JourneyDecision record created
        |           v
        |   Shipper sees driver offer --> ACCEPT or REJECT
        |           |                         |
        |           v                         v
        |   status: acceptedByShipper (4)   status: rejectedByShipper (8)
        |           |
        |           v
        |   Driver STARTS journey --> status: journeyStarted (5)
        |           |
        |           v
        |   Driver COMPLETES --> status: journeyCompleted (6)
        |           Earnings + commission calculated
        |
        |-- Driver REJECTS --> status: rejectedByDriver (15)
        |       System re-queues, next available driver tried
        |
        +-- Driver NO ANSWER (timeout) --> status: noAnswerFromDriver (13)
                System re-queues, next available driver tried
```

### 5.4 Company Batch Flow — After Batch Request is Posted

```
requestMode: "company_target"

Shipper posts batch request (totalVehicles: N)
        |
        v
Companies see available batch in their marketplace
Companies submit bids: POST /api/company/bids
        |
        v
Shipper reviews all offers --> ACCEPTS one company's bid
        |
        v
Batch status: acceptedByShipper
        |
        v
Company assigns drivers to each slot (manual or auto-assign)
        |
        v
Each slot: journeyStarted (5) --> journeyCompleted (6)
```

### 5.5 Other Shipper Actions

| Action                     | Endpoint                                    |
| -------------------------- | ------------------------------------------- |
| View active request status | GET /api/shipper/verifyShipperJourneyStatus |
| Cancel a request           | POST /api/canceledJourneys                  |
| Rate a completed journey   | POST /api/ratings                           |
| View wallet balance        | GET /api/finance/balance                    |
| Deposit funds              | POST /api/finance/userDeposit/santimPay     |

---

## 6. Driver Flow

The Driver receives trip requests, carries cargo, and completes journeys.

### 6.1 Registration to Active Account

```
Register -> OTP Verify -> Login
                |
                v
1. Upload Driver License (mandatory, with expiry date)
2. Upload Profile Photo (mandatory)
                |
                v
3. Register a Vehicle:
   POST /api/vehicle/create
   Body: { licensePlate, color, vehicleTypeUniqueId }
                |
                v
4. Upload Vehicle Documents:
   - Insurance Document (mandatory, expiry date + file number)
   - Vehicle Registration / Librea (mandatory, file number)
                |
                v
5. (If subscription model) Purchase subscription plan
                |
                v
Admin reviews and approves all documents
                |
                v
Driver status -> ACTIVE (statusId: 1)
Driver can now receive trip requests
```

### 6.2 Go Online — Signal Availability

```
POST /api/driver/request/create

Body:
{
  "originLatitude": "11.04979570",
  "originLongitude": "39.74870670",
  "originPlace": "Kombolcha, Amhara Region",
  "vehicleUniqueId": "uuid-of-registered-vehicle"
}
```

- Creates a DriverRequest with journeyStatusId: 1 (waiting/online)
- Driver is now visible in the queue and can receive incoming trip requests

### 6.3 Receive and Respond to a Trip (Individual Mode)

```
System sends request (journeyStatusId: 2 - requested)
Driver receives FCM push notification + WebSocket alert
        |
        |-- Driver ACCEPTS --> provides bidding price
        |       status: acceptedByDriver (3)
        |       JourneyDecision record is created
        |
        +-- Driver REJECTS
                status: rejectedByDriver (15)
                Next driver in queue is tried automatically
```

### 6.4 After Shipper Accepts the Driver's Offer

```
Shipper accepts the driver --> status: acceptedByShipper (4)
Driver receives notification
        |
        v
Driver goes to loading location
        |
        v
Driver STARTS journey: status: journeyStarted (5)
        |
        v
(Optional) Driver records GPS waypoints:
POST /api/journeyRoutePoints
        |
        v
Driver COMPLETES journey at destination:
status: journeyCompleted (6)
        |
        v
System calculates commission and driver earnings
Driver earnings credited to wallet balance
```

### 6.5 Company Assignment Mode

```
Company assigns driver to a freight slot
        |
        v
Driver receives FCM: "You have been assigned to a freight job"
        |
        |-- Driver ACCEPTS --> status advances to accepted
        |
        +-- Driver REJECTS --> status: rejected_by_driver
                Company must re-assign another driver to this slot
```

### 6.6 Other Driver Actions

| Action                       | Endpoint                                  |
| ---------------------------- | ----------------------------------------- |
| Check current journey status | GET /api/driver/verifyDriverJourneyStatus |
| Cancel a trip                | POST /api/canceledJourneys                |
| Upload/update documents      | POST /api/attachedDocuments               |
| Check-in to a queue          | POST /api/queue/checkIn                   |
| Rate a shipper               | POST /api/ratings                         |

---

## 7. Company Admin Flow

Top-level manager of a transport company. Registers the company, manages fleet, submits bids, and oversees all operations.

### 7.1 Registration to Company Created

```
Register -> OTP Verify -> Login
        |
        v
1. Upload Company Admin Personal Documents:
   - National ID (mandatory, with file number)
   - Profile Photo (optional)
        |
        v
2. Create the Transport Company:
   POST /api/company/companies
   Body: { companyName, companyPhone, companyAddress }
        |
        v
3. Upload Company Entity Documents:
   POST /api/company/attachDocuments/:companyUniqueId
   - Business License (mandatory, expiry + file number)
   - Commercial Registration (mandatory, expiry + file number)
   - Tax Registration TIN Certificate (mandatory, expiry + file number)
   - Company Logo (optional)
        |
        v
Admin reviews company documents --> APPROVE or REJECT
        |
        v
Company is VERIFIED and active -- ready for bidding
```

### 7.2 Build the Fleet

```
1. Register vehicles:
   POST /api/vehicle/create
   Body: { licensePlate, vehicleTypeUniqueId, color }

2. Upload vehicle documents per vehicle:
   - Insurance Document
   - Vehicle Registration (librea)

3. Add driver members to company:
   POST /api/company/memberships
   Body: { driverUserUniqueId, companyUniqueId, companyRoleUniqueId }

4. Assign driver to vehicle:
   POST /api/vehicleDriver
   Body: { vehicleUniqueId, driverUserUniqueId }

5. Add vehicle to company fleet:
   POST /api/company/fleet
   Body: { vehicleUniqueId, companyUniqueId }
```

### 7.3 Company Roles within the Company

| Role       | Description                                      |
| ---------- | ------------------------------------------------ |
| owner      | Full company access — same as Company Admin user |
| manager    | Manages members and fleet                        |
| dispatcher | Manages assignments and bids day-to-day          |
| driver     | A driver who is also a company member            |

### 7.4 Bid on a Shipper Batch Request

```
1. View available freight batches:
   GET /api/shipperRequestBatch

2. Submit a bid:
   POST /api/company/bids
   Body:
   {
     "shipperRequestBatchId": "uuid",
     "companyUniqueId": "uuid",
     "proposedCostPerVehicle": 50000,
     "numberOfVehiclesOffered": 10,
     "bidNotes": "Expedited delivery"
   }

3. Wait for shipper to accept: bidStatus -> "accepted_by_shipper"

4. Assign drivers to each slot:

   AUTO-ASSIGN (system picks available drivers matching vehicle type):
   POST /api/company/assignments/auto
   Body: { "companyBidRequestUniqueId": "uuid" }

   NOTE: Auto-assignment STRICTLY enforces vehicle type matching.
   The assigned vehicle must exactly match what the shipper requested.
   This ensures shippers always receive the truck capacity they paid for.

   MANUAL ASSIGN (dispatcher picks specific driver + vehicle per slot):
   POST /api/company/assignments
   Body:
   {
     "companyBidRequestUniqueId": "uuid",
     "shipperRequestUniqueId": "uuid",
     "vehicleUniqueId": "uuid",
     "driverUserUniqueId": "uuid"
   }
```

### 7.5 Other Company Admin Actions

| Action                 | Endpoint                                    |
| ---------------------- | ------------------------------------------- |
| Edit a bid             | PATCH /api/company/bids/:bidId              |
| Cancel a bid           | DELETE /api/company/bids/:bidId             |
| View fleet status      | GET /api/company/fleet?companyUniqueId=uuid |
| View all assignments   | GET /api/company/assignments                |
| Cancel an assignment   | DELETE /api/company/assignments/:id         |
| Add or remove members  | POST/DELETE /api/company/memberships        |
| View company bids      | GET /api/company/bids                       |
| Respond to delinquency | POST /api/company/delinquency-response      |
| View company ratings   | GET /api/company/ratings                    |

---

## 8. Dispatcher Flow

Company staff member (roleId: 10) managing day-to-day fleet operations.
Same assignment capabilities as Company Admin; cannot change company settings or finances.

### 8.1 Registration to Active

```
Register -> OTP Verify -> Login
        |
        v
Company Admin adds them to company with dispatcher role:
POST /api/company/memberships
Body: { "companyRoleUniqueId": "750858d6-e816-45b0-a088-9dfe6b4d80ff" }
        |
        v
Dispatcher uploads mandatory documents:
  - National ID (mandatory)
  - Profile Photo (mandatory)
        |
        v
Admin approves documents --> Dispatcher is ACTIVE
```

### 8.2 Dispatcher Daily Workflow

```
1. View accepted bids ready for assignment:
   GET /api/company/bids?bidStatus=accepted_by_shipper

2. Check fleet availability:
   GET /api/company/fleet?companyUniqueId=uuid

3. Assign drivers to freight slots:
   POST /api/company/assignments/auto   (bulk auto-assign)
   POST /api/company/assignments        (individual manual assign)

4. Monitor all assignment statuses:
   GET /api/company/assignments?companyBidRequestUniqueId=uuid

5. Handle driver rejections:
   DELETE /api/company/assignments/:id   (cancel rejected slot)
   POST /api/company/assignments         (assign a replacement driver)
```

---

## 9. Queue Organization Admin Flow

Manages the physical loading-zone driver dispatch queue (roleId: 11).

### 9.1 Registration to Active

```
Register -> OTP Verify -> Login
        |
        v
Super Admin or Admin assigns QueueOrgAdmin role to user
        |
        v
Upload: National ID (mandatory)
        |
        v
Admin approves --> Queue Org Admin is ACTIVE
```

### 9.2 Queue Setup and Management

```
1. Create Queue Organization:
   POST /api/queueOrganization
   Body: { location, vehicleTypesServed, capacity }

2. View all drivers currently in queue:
   GET /api/queueOrganization/:id/queue

3. Check-in a driver to queue:
   POST /api/queue/checkIn

4. Override queue position (every override is audit logged):
   PATCH /api/queue/position

5. Remove a driver from queue:
   DELETE /api/queue/checkOut
```

### 9.3 Queue Dispatch Priority (FIFO)

```
Driver checks in to queue
  -> Added to end of queue (First-In, First-Out order)

Shipper request arrives matching that vehicle type
  -> FIRST available driver in queue is selected
  -> Request sent to that driver
       --> Driver accepts: trip is assigned
       --> Driver rejects or no answer: next driver in queue is tried
```

---

## 10. The Core Journey Lifecycle (Status Map)

All journeys — individual or company-batch — share the same journeyStatusId progression.

### Active Statuses

| ID  | Status Name       | Description                                                |
| --- | ----------------- | ---------------------------------------------------------- |
| 1   | waiting           | Request created, looking for a driver                      |
| 2   | requested         | Request sent to a specific driver                          |
| 3   | acceptedByDriver  | Driver accepted and bid submitted; JourneyDecision created |
| 4   | acceptedByShipper | Shipper accepted driver offer (or company bid accepted)    |
| 5   | journeyStarted    | Driver physically started the trip                         |
| 6   | journeyCompleted  | Trip delivered; earnings calculated                        |

### Terminal and Exception Statuses

| ID  | Status Name                 | Description                              |
| --- | --------------------------- | ---------------------------------------- |
| 7   | cancelledByShipper          | Shipper cancelled the entire request     |
| 8   | rejectedByShipper           | Shipper rejected this specific driver    |
| 9   | cancelledByDriver           | Driver cancelled after accepting         |
| 10  | cancelledByAdmin            | Admin forcefully cancelled               |
| 11  | completedByAdmin            | Admin manually marked complete           |
| 12  | cancelledBySystem           | System auto-cancelled (timeout, etc.)    |
| 13  | noAnswerFromDriver          | Driver did not respond; system re-queues |
| 14  | notSelectedInBid            | Driver's offer not chosen by shipper     |
| 15  | rejectedByDriver            | Driver rejected incoming request upfront |
| 16  | replacedByCompanyAssignment | Individual match replaced by company job |
| 17  | partiallyCancelled          | Batch partially cancelled by shipper     |

---

## 11. Individual Journey — Full E2E Sequence

```
SHIPPER                           SYSTEM                          DRIVER
  |                                 |                               |
  |-- POST shipper request ------>  |                               |
  |   (status: waiting / 1)         |                               |
  |                                 |-- Find nearest driver ------> |
  |                                 |   (status: requested / 2)     |
  |                                 |   FCM + WebSocket push sent   |
  |                                 |                               |
  |                                 |<- Driver ACCEPTS -------------|
  |                                 |   (status: acceptedByDriver/3)|
  |                                 |   JourneyDecision created     |
  |<-- Shipper notified of ---------|                               |
  |    driver offer and price       |                               |
  |                                 |                               |
  |-- Shipper ACCEPTS offer ------> |                               |
  |   (status: acceptedByShipper/4) |                               |
  |                                 |-- Notify Driver ------------> |
  |                                 |                               |
  |                                 |<- Driver STARTS journey ------|
  |                                 |   (status: journeyStarted/5)  |
  |                                 |   GPS tracking begins         |
  |                                 |                               |
  |                                 |<- Driver COMPLETES -----------|
  |                                 |   (status: journeyCompleted/6)|
  |<-- Shipper notified ------------|                               |
  |                                 |-- Commission deducted         |
  |                                 |-- Driver earnings credited    |
  |                                 |                               |
  |-- Rate driver ----------------> |                               |
  |   POST /api/ratings             |<- Rate shipper ---------------|
```

---

## 12. Company Freight Batch — Full E2E Sequence

```
SHIPPER                    COMPANY ADMIN / DISPATCHER            DRIVERS
  |                                 |                               |
  |-- POST batch request -------->  |                               |
  |   requestMode: company_target   |                               |
  |   totalVehicles: 10             |                               |
  |                                 |                               |
  |        Multiple companies see and bid on this batch             |
  |                                 |                               |
  |<-- Bids arrive (bidStatus: pending)                             |
  |                                 |                               |
  |-- Shipper ACCEPTS one bid ----> |                               |
  |   (bidStatus: accepted_by_shipper)                              |
  |                                 |                               |
  |                     Company assigns drivers per slot:           |
  |                     POST /api/company/assignments/auto          |
  |                     or manually slot-by-slot                    |
  |                                 |-- Notify each driver -------> |
  |                                 |   (status: assigned / 2)      |
  |                                 |                               |
  |                                 |<- Driver ACCEPTS -------------|
  |                                 |   (status: accepted / 4)      |
  |<-- Shipper notified of ---------|                               |
  |    driver assignments           |                               |
  |                                 |                               |
  |                                 |<- Each Driver STARTS ---------|
  |                                 |   (journeyStarted / 5)        |
  |                                 |                               |
  |                                 |<- Each Driver COMPLETES ------|
  |                                 |   (journeyCompleted / 6)      |
  |<-- Notified as each slot -------|                               |
  |    completes                    |-- Earnings credited per driver|
  |                                 |                               |
  |-- Rate company --------------> |<- Rate shipper ---------------|
```

### Company Assignment Status Values

| Status               | Meaning                                           |
| -------------------- | ------------------------------------------------- |
| assigned             | Company assigned driver; awaiting driver response |
| accepted             | Driver accepted the company assignment            |
| rejected_by_driver   | Driver rejected; slot needs re-assignment         |
| cancelled_by_company | Company cancelled this assignment                 |
| cancelled_by_shipper | Shipper cancelled this slot                       |
| cancelled_by_driver  | Driver cancelled after accepting                  |
| completed            | Journey for this slot is finished                 |

> **Auto-Assignment Business Rule:** The system only auto-assigns a driver if their vehicle type EXACTLY matches the vehicle type requested in the bid. This ensures shippers always receive the truck capacity they paid for. Mismatched vehicles must be assigned manually by a dispatcher with the shipper's awareness.

---

## 13. Finance and Settlement Flow

### Payment Model

Controlled by the `DRIVERS_PAYMENT_SYSTEM` environment variable.

| Mode         | How it works                                                            |
| ------------ | ----------------------------------------------------------------------- |
| COMMISSION   | Platform deducts a percentage of each trip. Driver earns the remainder. |
| SUBSCRIPTION | Driver pays a flat monthly fee. Keeps 100% of each trip payment.        |

### Finance Flow

```
SHIPPER DEPOSITS FUNDS
  POST /api/finance/userDeposit/santimPay
        |
        v
Balance credited to shipper wallet

JOURNEY COMPLETES (status 6)
        |
        v
System calculates trip cost using tariff rates per vehicle type
        |
        v
Commission deducted --> Platform revenue
Remainder credited --> Driver wallet balance
        |
        v
Driver uses balance for subscription renewal or future withdrawals
```

### Finance Endpoints

| Action                | Endpoint                                        |
| --------------------- | ----------------------------------------------- |
| Check balance         | GET /api/finance/balance                        |
| Deposit via SantimPay | POST /api/finance/userDeposit/santimPay         |
| SantimPay webhook     | POST /api/finance/userDeposit/santimPay/webhook |
| View transactions     | GET /api/finance/\*                             |

---

## 14. Notifications and Real-Time Events

The platform uses two parallel notification channels for every significant event.

### FCM (Firebase Cloud Messaging) — Push Notifications

Out-of-app alerts. Flat key-value payloads (Firebase platform limitation).

| Event                           | Who receives it |
| ------------------------------- | --------------- |
| New trip request sent           | Driver          |
| Driver accepted offer           | Shipper         |
| Shipper accepted driver         | Driver          |
| Journey started                 | Shipper         |
| Journey completed               | Shipper         |
| Company assigned driver to slot | Driver          |
| Batch auto-assigned (all slots) | Shipper         |
| Document approved or rejected   | User            |

### WebSocket (Socket.IO) — Real-Time In-App Events

Full JSON payloads for live in-app updates.

| Message Type              | Description                             |
| ------------------------- | --------------------------------------- |
| company_driver_assignment | Driver assigned to company freight slot |
| journey_status_update     | Any journey status change               |
| bid_status_update         | Company bid status changed              |
| driver_request_update     | Driver request status changed           |

**Connection Model:**

- Shippers connect to a WebSocket room keyed by their phone number
- Drivers connect via their user unique ID
- The server pushes events to the correct room on every status change

---

## 15. Quick Reference: Key Endpoints

### Auth

| Method | Endpoint         | Who           |
| ------ | ---------------- | ------------- |
| POST   | /register        | All new users |
| POST   | /verifyUserByOTP | All new users |
| POST   | /login           | All users     |
| GET    | /verifyEmail     | All users     |

### Driver

| Method | Endpoint                              | Action                          |
| ------ | ------------------------------------- | ------------------------------- |
| POST   | /api/driver/request/create            | Go online / signal availability |
| GET    | /api/driver/verifyDriverJourneyStatus | Check current journey status    |
| POST   | /api/driver/acceptRequest             | Accept an incoming trip         |
| POST   | /api/driver/rejectRequest             | Reject an incoming trip         |
| POST   | /api/driver/startJourney              | Start the physical trip         |
| POST   | /api/driver/completeJourney           | Mark trip as complete           |

### Shipper

| Method | Endpoint                                | Action                |
| ------ | --------------------------------------- | --------------------- |
| POST   | /api/shipper/request/create             | Post a cargo request  |
| GET    | /api/shipper/verifyShipperJourneyStatus | Check request status  |
| POST   | /api/shipper/acceptDriver               | Accept a driver offer |
| POST   | /api/shipper/rejectDriver               | Reject a driver offer |
| POST   | /api/canceledJourneys                   | Cancel a request      |

### Company

| Method | Endpoint                      | Action                             |
| ------ | ----------------------------- | ---------------------------------- |
| POST   | /api/company/companies        | Register transport company         |
| GET    | /api/company/fleet            | View fleet and driver availability |
| POST   | /api/company/bids             | Submit bid on freight batch        |
| GET    | /api/company/bids             | View all company bids              |
| PATCH  | /api/company/bids/:bidId      | Edit a bid                         |
| DELETE | /api/company/bids/:bidId      | Cancel a bid                       |
| POST   | /api/company/assignments      | Manually assign driver to slot     |
| POST   | /api/company/assignments/auto | Auto-assign all available slots    |
| GET    | /api/company/assignments      | View all assignments               |
| DELETE | /api/company/assignments/:id  | Cancel an assignment               |
| POST   | /api/company/memberships      | Add a member to company            |
| DELETE | /api/company/memberships/:id  | Remove a member                    |

### Admin

| Method | Endpoint                            | Action                       |
| ------ | ----------------------------------- | ---------------------------- |
| GET    | /api/attachedDocuments              | View uploaded documents      |
| PATCH  | /api/attachedDocuments/:id          | Approve or reject a document |
| POST   | /api/admin/bannedUsers              | Ban a user                   |
| DELETE | /api/admin/bannedUsers/:id          | Unban a user                 |
| POST   | /api/admin/userDelinquency          | Open a delinquency case      |
| POST   | /api/admin/userDelinquencyDecisions | Rule on a delinquency case   |
| POST   | /api/auth/createUserByAdmin         | Create a user account        |

### Queue

| Method | Endpoint                         | Action                                 |
| ------ | -------------------------------- | -------------------------------------- |
| POST   | /api/queueOrganization           | Create a queue organization            |
| GET    | /api/queueOrganization/:id/queue | View current queue                     |
| POST   | /api/queue/checkIn               | Driver check-in to queue               |
| DELETE | /api/queue/checkOut              | Driver check-out of queue              |
| PATCH  | /api/queue/position              | Override queue position (audit logged) |

---

_This document reflects the actual backend implementation of the Dynamics Transport platform.
For any discrepancies, refer to the source code in `Routes/`, `Services/`, and `Utils/ListOfSeedData.js`._
