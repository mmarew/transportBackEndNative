# AdminPlan API Audit

Audit of `Adminplan.md` against the existing backend. Every item is tagged:

- **EXISTS** — ready, URL + payload + response given.
- **NEEDS MODIFICATION** — endpoint exists but must be extended.
- **NOT FOUND** — no API exists (no new API built per instruction).

---

## Phase 1 — Dashboard Cards (Total / Pending / Approved / Rejected / Suspended Organizations)

**DONE** — `GET /api/admin/dashboard` (Admin/SuperAdmin token) now aggregates **QueueOrganization** counts:

```json
{
  "data": {
    "organizations": {
      "total": 7,
      "pending": 3,
      "approved": 4,
      "rejected": 0,
      "suspended": 0
    }
  }
}
```

Legacy `TransportCompany` fields (`pendingCompanies`, `approvedCompanies`, …) remain in the response for backward compatibility; the admin dashboard cards should read the `organizations` block.

---

## Phase 2 — Organization Management

### 1. Organization List

**EXISTS** — `GET /api/queueOrganization`

Query params: `queueOrganizationType`, `approvalStatus` (`pending|approved|rejected|suspended`), `queueEnabled`, `page`, `limit`.

```json
{
  "message": "...",
  "data": [
    {
      "queueOrganizationUniqueId": "58f68fea-99f4-490c-9f8a-7e1978082ba7",
      "queueOrganizationName": "Company X",
      "queueOrganizationType": "customs",
      "queueOrganizationPhone": "+251...",
      "queueOrganizationAddress": "...",
      "latitude": 9.02,
      "longitude": 38.8,
      "checkinRadiusKm": 5,
      "approvalStatus": "approved",
      "queueEnabled": 1,
      "approvedAt": "2026-09-01T10:00:00.000Z",
      "approvedBy": "...",
      "approvalReason": null,
      "queueOrganizationCreatedAt": "2026-08-20T...",
      "creator": {
        "userUniqueId": "...",
        "fullName": "...",
        "phoneNumber": "...",
        "email": "..."
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "limit": 10,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

Covers the requested columns: Name, Type, Phone, Address, Approval Status, Queue Enabled, Approved At. Actions (View/Edit/Approve/Reject/Suspend/Delete/Members/View Queue) all map to existing endpoints below.

### 2. Create Organization

**EXISTS** — `POST /api/queueOrganization`

```json
{
  "queueOrganizationName": "Company X",
  "queueOrganizationType": "customs",
  "queueOrganizationPhone": "+251...",
  "queueOrganizationAddress": "...",
  "latitude": 9.02,
  "longitude": 38.8,
  "checkinRadiusKm": 5
}
```

- `queueOrganizationType`: `customs | factory | cement | depot | other` (default `other`).
- `checkinRadiusKm`: 1–1000 or `null` (null = no distance check).
- Creator is auto-assigned as QueueOrgAdmin (role 11).

```json
{
  "message": "success",
  "data": { "queueOrganizationUniqueId": "...", "approvalStatus": "pending" }
}
```

### 3. View Organization Detail

**EXISTS** — `GET /api/queueOrganization/:queueOrganizationUniqueId`

```json
{
  "data": {
    "organization": {
      "queueOrganizationName": "...",
      "queueOrganizationType": "customs",
      "queueOrganizationPhone": "...",
      "queueOrganizationAddress": "...",
      "latitude": 9.02,
      "longitude": 38.8,
      "checkinRadiusKm": 5,
      "approvalStatus": "approved",
      "approvalReason": null,
      "queueEnabled": 1,
      "approvedBy": "uuid",
      "approvedAt": "2026-09-01T10:00:00.000Z"
    },
    "creator": {
      "userUniqueId": "...",
      "fullName": "...",
      "phoneNumber": "...",
      "email": "..."
    }
  }
}
```

Covers Organization Information, Approval Information, Creator Information.

### 4. Edit Organization

**EXISTS** — `PATCH /api/queueOrganization/:queueOrganizationUniqueId`

Payload: any subset of the create fields:

```json
{
  "queueOrganizationName": "New Name",
  "queueOrganizationType": "factory",
  "queueOrganizationPhone": "+251...",
  "queueOrganizationAddress": "...",
  "latitude": 9.03,
  "longitude": 38.81,
  "checkinRadiusKm": 10
}
```

### 5. Approve Organization

**EXISTS** — `PATCH /api/queueOrganization/:queueOrganizationUniqueId/approve` (Admin / SuperAdmin)

```json
{
  "approvalStatus": "approved",
  "queueEnabled": true
}
```

### 6. Reject Organization

**EXISTS** — same endpoint

```json
{
  "approvalStatus": "rejected",
  "approvalReason": "Reason for rejection"
}
```

### 7. Suspend Organization

**EXISTS** — same endpoint

```json
{
  "approvalStatus": "suspended"
}
```

### 8. Delete Organization

**EXISTS** — `DELETE /api/queueOrganization/:queueOrganizationUniqueId` (Admin / SuperAdmin, soft delete → `isDeleted = 1`).

---

## Phase 3 — Organization Approval Center (pending only)

**EXISTS** — `GET /api/queueOrganization?approvalStatus=pending` (columns include Creator and `queueOrganizationCreatedAt` as created date). View/Approve/Reject reuse the Phase 2 endpoints.

---

## Phase 4 — Member Management

### 9. Member List

**EXISTS** — `GET /api/queueOrganization/:queueOrganizationUniqueId/members?roleId=&isActive=`

```json
{
  "message": "success",
  "data": [
    {
      "queueOrganizationMembershipUniqueId": "...",
      "queueOrganizationUniqueId": "...",
      "userUniqueId": "...",
      "roleId": 11,
      "roleName": "queue_org_admin",
      "isActive": 1,
      "membershipStartDate": "2026-08-20T...",
      "membershipEndDate": null,
      "fullName": "Driver Name",
      "phoneNumber": "+251...",
      "email": "..."
    }
  ]
}
```

Covers Full Name, Phone Number, Role, Active, Membership Start Date.

### 10. Add Member

**EXISTS** — `POST /api/queueOrganization/:queueOrganizationUniqueId/members/:userUniqueId`

```json
{
  "roleId": 11,
  "isActive": true
}
```

- `roleId` limited to `11` (QueueOrgAdmin) or `1` (Shipper).
- Lifecycle endpoints also exist:
  - `PATCH /api/queueOrganization/:id/members/:membershipId/reactivate`
  - `PATCH /api/queueOrganization/:id/members/:membershipId/deactivate`
  - `DELETE /api/queueOrganization/:id/members/:membershipId`

---

## Phase 5 — Queue Monitoring (Read Only)

Core endpoint: **`GET /api/queue/status?queueOrganizationUniqueId=…&queueDate=YYYY-MM-DD`** (QueueOrgAdmin / Admin / SuperAdmin).

```json
{
  "data": {
    "queueOrganization": {
      "queueOrganizationName": "...",
      "queueOrganizationType": "customs",
      "approvalStatus": "approved",
      "queueEnabled": 1
    },
    "queueDate": "2026-09-10",
    "totalWaiting": 15,
    "queues": {
      "Truck": [
        {
          "queue": {
            "queueUniqueId": "...",
            "queueNumber": 1,
            "status": 1,
            "joinedAt": "2026-09-10T02:50:00.000Z",
            "requestedAt": null,
            "agreedAt": null,
            "driverLatitude": "9.0210",
            "driverLongitude": "38.8031",
            "queueRefusalCount": 0
          },
          "driver": {
            "fullName": "Driver Name",
            "phoneNumber": "+251...",
            "email": "..."
          },
          "vehicle": { "licensePlate": "ABC123", "vehicleTypeName": "Truck" },
          "shipperRequest": {
            "shipperRequestUniqueId": "...",
            "originPlace": "...",
            "destinationPlace": "...",
            "shippingCost": "...",
            "shippingDate": "...",
            "deliveryDate": "..."
          },
          "decisions": [
            {
              "journeyDecisionUniqueId": "...",
              "journeyStatusId": 2,
              "decisionTime": "...",
              "shippingCostByDriver": "..."
            }
          ],
          "journey": {
            "journeyUniqueId": "...",
            "journeyStatusId": null,
            "journeyStartedAt": null,
            "journeyCompletedAt": null
          },
          "proofOfDelivery": null
        }
      ],
      "Trailer": []
    }
  }
}
```

### 11. View Queue (button)

**EXISTS** — no new API; navigates to `GET /api/queue/status`.

### 12. Queue Overview (name, date, total waiting drivers)

**EXISTS** — `queueOrganization.queueOrganizationName`, `queueDate`, `totalWaiting`. `totalWaiting` counts statuses `waiting` (1) + `not_agreed` (18).

### 13. Vehicle Type Tabs (e.g. Truck (15), Trailer (8))

**EXISTS** — `queues` object keyed by `vehicleTypeName`; tab count = array length.

### 14. Queue Table (queueNumber, driver name, driver phone, vehicle, status, joinedAt, requestedAt, agreedAt)

**EXISTS** — all columns present per entry.

Status reference (numeric): `waiting=1, requested=2, agreed=3, goToLoadingPlace=5, loading=6, loaded=7, journeyStarted=8, journeyCompleted=9, cancelledByShipper=10, cancelledByDriver=12, cancelledByAdmin=13, noAnswerFromDriver=16, rejectedByDriver (not_agreed)=18`.

### 15. Queue Statistics (Waiting / Requested / Agreed / Not Agreed / Removed)

**DONE** — `GET /api/queue/status` returns `data.statistics`:

```json
{ "waiting": 15, "requested": 3, "agreed": 2, "notAgreed": 1, "removed": 5 }
```

- `waiting` = statuses `1` (waiting) + `18` (not_agreed/cancelled-before-accept) — same as `totalWaiting`.
- `requested` = status `2`; `agreed` = statuses `3, 5, 6, 7, 8, 9`; `notAgreed` = statuses `16, 18`.
- `removed` = rows with `queueDeletedAt IS NOT NULL` for the org+day (dedicated query — removed rows are hidden from the live lists, so they are counted separately).

### 16. Queue Entry Detail (driver + vehicle + queue + location + order + journey + decision + POD)

**DONE** — all fields now come back from `GET /api/queue/status` `buildQueueEntry`:

- Driver info, vehicle info, queue info (`queueNumber`/`status`/`joinedAt`/`requestedAt`/`agreedAt`), location (`driverLatitude`/`driverLongitude`), Shipper Request, Journey, JourneyDecision.
- **Proof of Delivery restored**: entries now include

```json
"proofOfDelivery": {
  "deliveryConfirmationUniqueId": "...",
  "receiverFullName": "...",
  "receiverPhoneNumber": "+251...",
  "deliveredQuantity": 12,
  "quantityUnit": "quintal",
  "condition": "good",
  "deliveryConfirmationStatus": "confirmed",
  "deliveryConfirmationSource": "driver",
  "shipperSignature": "...",
  "notes": "...",
  "podSubmittedAt": "2026-09-10T...",
  "photos": ["https://..." ]
}
```

- `null` when the order has no journey / no delivery confirmation yet.

### 17. Queue History (column changed, old value, performed by, performed date)

**EXISTS (shape differs)** — `GET /api/queue/entry/:queueUniqueId/history`

Returns full pre-mutation snapshots, newest first:

```json
{
  "data": [
    {
      "historyUniqueId": "...",
      "historyEvent": "offer_rejected",
      "performedBy": "uuid",
      "performedAt": "2026-09-10T03:00:26.000Z",
      "queueNumber": 1,
      "status": 18,
      "joinedAt": "...",
      "requestedAt": "...",
      "agreedAt": null,
      "shipperRequestUniqueId": "...",
      "queueRefusalCount": 1,
      "... (all DriverQueue columns)": null
    }
  ]
}
```

- Event vocabulary: `checkin, manual_checkin, checkout, remove, lane_override, offer, offer_rejected, offer_timeout, accept, order_cancelled, driver_cancel_after_accept, journey_progress, journey_completed, refusal, advance_release, not_selected, shipper_reserved`.
- Snapshot is a superset of `columnChanged/oldValue` — a UI can compute diffs by pairing consecutive rows with the current `DriverQueue` value. A strict columnar-diff format would require modification.

---

## Phase 6 — Simple Statistics (per organization)

**DONE** — all fields present on `GET /api/queueOrganization/:queueOrganizationUniqueId`:

- Approval Status (`approvalStatus`), Queue Enabled (`queueEnabled`), Org Type (`queueOrganizationType`), Approved Date (`approvedAt`), Created Date (`queueOrganizationCreatedAt`).
- **Member Count**: now included as `memberCount` on both the list and detail responses (counts active memberships where `membershipDeletedAt IS NULL`).

---

## Summary of required code work

| #   | Endpoint                    | Assessment             | Work                                                                                                       |
| --- | --------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Dashboard org status counts | **DONE**               | `GET /api/admin/dashboard` → `data.organizations = { total, pending, approved, rejected, suspended }` (queue orgs only). |
| 2   | `GET /api/queue/status`     | **DONE**               | `data.statistics = { waiting, requested, agreed, notAgreed, removed }` added in `getQueueStatus`.           |
| 3   | Queue entry POD             | **DONE**               | `proofOfDelivery` object (incl. photos) restored in `buildQueueEntry` (`Services/DriverQueue.service.js:392`). |
| 4   | Org member count            | **DONE**               | `memberCount` added to org list + detail (`Services/QueueOrganization.service.js`).                         |
| 5   | Queue history diff view     | **EXISTS (shape differs)** | Frontend diffs snapshot rows; true columnar diff requires modification.                                  |
