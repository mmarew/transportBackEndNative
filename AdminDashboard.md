# Admin Dashboard API Reference

Base URL: `http://localhost:3000/api`

---

## Authentication

All endpoints require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Dashboard and company admin endpoints require **Admin** or **SuperAdmin** role (`roleId` 3 or 6).

---

## Dashboard Cards

### `GET /admin/dashboard`

Aggregate platform statistics for dashboard cards.

**Access:** Admin / SuperAdmin only

**Response `200`:**

```json
{
  "message": "success",
  "data": {
    "pendingCompanies": 5,
    "approvedCompanies": 20,
    "suspendedCompanies": 3,
    "totalCompanyVehicles": 200,
    "totalCompanyDrivers": 150,
    "activeCompanyBids": 45,
    "averageRating": 4.2
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pendingCompanies` | number | Companies awaiting approval |
| `approvedCompanies` | number | Active approved companies |
| `suspendedCompanies` | number | Currently suspended companies |
| `totalCompanyVehicles` | number | Active vehicles across all company fleets |
| `totalCompanyDrivers` | number | Distinct drivers with active company membership |
| `activeCompanyBids` | number | Bids with `submitted` status (awaiting shipper response) |
| `averageRating` | number \| null | Platform-wide average company rating (1–5), or `null` if no ratings |

---

## 🏢 Companies

### List Companies

```
GET /company/companies
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `approvalStatus` | string | `pending`, `approved`, `rejected`, `suspended` |
| `companyName` | string | Partial name search (LIKE) |
| `page` | number | Default: 1 |
| `limit` | number | Default: 10, max: 100 |

**Access:** Authenticated users (data segregated by role)

**Response `200`:**

```json
{
  "message": "success",
  "data": [
    {
      "companyUniqueId": "uuid",
      "companyName": "Acme Transport",
      "companyRegistrationNumber": "ET-12345",
      "companyPhone": "+251911111111",
      "companyEmail": "acme@example.com",
      "companyAddress": "Addis Ababa",
      "approvalStatus": "pending",
      "companyCreatedAt": "2025-01-01T00:00:00.000Z",
      "documentCompliance": {
        "accepted": [],
        "pending": [],
        "rejected": [],
        "notAttached": [],
        "isCompliant": false,
        "counts": { "accepted": 0, "pending": 0, "rejected": 0, "notAttached": 3 }
      }
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 5, "totalPages": 1 }
}
```

> Admins & company admins see the `documentCompliance` field. For pending companies, use `?approvalStatus=pending`.

---

### Approve / Reject Company

```
PATCH /company/companies/:companyUniqueId/approve
```

**Body:**

```json
{
  "approvalStatus": "approved",
  "approvalReason": "All documents verified"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `approvalStatus` | string | `approved` or `rejected` |
| `approvalReason` | string | Required when rejecting |

**Access:** Admin / SuperAdmin only

---

### View Company Documents

```
GET /company/attachedDocuments/:companyUniqueId
```

**Access:** Admin / Company members

**Response `200`:** Array of attached documents with acceptance status.

---

### Approve / Reject Document

```
PUT /admin/acceptRejectAttachedDocuments
```

**Body:**

```json
{
  "attachedDocumentUniqueId": "uuid",
  "action": "ACCEPTED",
  "reason": "Document is valid"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `attachedDocumentUniqueId` | string (uuid) | Document to review |
| `action` | string | `ACCEPTED` or `REJECTED` |
| `reason` | string | Optional note |

**Access:** Admin / SuperAdmin only

---

### View Company Profile History

```
GET /company/companies/:companyUniqueId/profileHistory
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `fieldName` | string | Filter: `approvalStatus`, `companyPhone`, etc. |
| `source` | string | Filter: `registration`, `ban`, `unban`, `profile_update`, `manual` |
| `page` | number | Default: 1 |
| `limit` | number | Default: 20, max: 100 |

**Access:** Admin / CompanyAdmin

**Response `200`:**

```json
{
  "message": "success",
  "data": [
    {
      "historyUniqueId": "uuid",
      "fieldName": "approvalStatus",
      "oldValue": "pending",
      "newValue": "approved",
      "reason": "All documents verified",
      "source": "manual",
      "changedByName": "Admin Name",
      "changedAt": "2025-01-01T00:00:00.000Z",
      "banAt": null,
      "banExpiresAt": null,
      "banDurationDays": null
    }
  ],
  "pagination": { "currentPage": 1, "totalPages": 1, "totalItems": 3, "itemsPerPage": 20 }
}
```

---

### Soft-Delete Company

```
DELETE /company/companies/:companyUniqueId
```

**Access:** Admin / SuperAdmin only

---

## 👥 Company Members

### List Members

```
GET /company/memberships
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `companyUniqueId` | string (uuid) | Filter by company |
| `isActive` | boolean | `1` or `0` |

**Access:** Authenticated (segregated — non-admins see their own companies)

**Response `200`:**

```json
{
  "message": "success",
  "data": [
    {
      "membershipUniqueId": "uuid",
      "companyUniqueId": "uuid",
      "userUniqueId": "uuid",
      "fullName": "John Doe",
      "phoneNumber": "+251911111111",
      "email": "john@example.com",
      "companyRoleName": "Driver",
      "isActive": true,
      "membershipStartDate": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

### View Driver Vehicle

```
GET /vehicleDriver?driverUserUniqueId=<uuid>&assignmentStatus=active
```

**Access:** Authenticated

**Response `200`:**

```json
{
  "message": "success",
  "data": [
    {
      "vehicleDriverUniqueId": "uuid",
      "vehicleUniqueId": "uuid",
      "driverUserUniqueId": "uuid",
      "assignmentStatus": "active",
      "licensePlate": "AA-1234",
      "color": "White",
      "vehicleTypeName": "Truck",
      "carryingCapacity": 50
    }
  ]
}
```

### Deactivate Member

```
PATCH /company/memberships/:membershipUniqueId/deactivate
```

**Access:** Admin / Company admin

### Remove Member

```
DELETE /company/memberships/:membershipUniqueId
```

**Access:** Admin / Company admin

---

## 🚚 Company Fleet

### List Fleet Vehicles

```
GET /company/fleet
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `companyUniqueId` | string (uuid) | Required for non-admins with multiple companies |
| `assignmentStatus` | string | `active` or `inactive` |

**Response `200`:**

```json
{
  "message": "success",
  "data": [
    {
      "companyVehicleUniqueId": "uuid",
      "companyUniqueId": "uuid",
      "vehicleUniqueId": "uuid",
      "licensePlate": "AA-1234",
      "color": "White",
      "vehicleTypeName": "Truck",
      "carryingCapacity": 50,
      "assignmentStatus": "active",
      "driverFullName": "John Doe",
      "driverPhoneNumber": "+251911111111",
      "assignmentStartDate": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

### Remove Vehicle from Fleet

```
DELETE /company/fleet/:companyVehicleUniqueId
```

**Access:** Admin / Company admin

---

## 💰 Company Bids

### List Bids

```
GET /company/bids
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `companyUniqueId` | string (uuid) | Filter by company |
| `bidStatus` | string | `submitted`, `accepted_by_shipper`, `rejected_by_shipper`, `cancelled_by_company`, `expired` |

### View Bid Assignments

```
GET /company/assignments
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `companyBidRequestUniqueId` | string (uuid) | Filter by bid |
| `assignmentStatus` | string | `assigned`, `confirmed_by_driver`, `rejected_by_driver`, `completed`, `cancelled` |

**Response `200`:**

```json
{
  "message": "success",
  "data": [
    {
      "assignmentUniqueId": "uuid",
      "companyBidRequestUniqueId": "uuid",
      "vehicleUniqueId": "uuid",
      "driverUserUniqueId": "uuid",
      "driverFullName": "John Doe",
      "licensePlate": "AA-1234",
      "assignmentStatus": "assigned",
      "assignmentCreatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## ⭐ Company Ratings

### List Ratings

```
GET /company/ratings
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `companyUniqueId` | string (uuid) | Filter by company |

### Average Rating

```
GET /company/ratings/average/:companyUniqueId
```

### Edit Rating

```
PUT /company/ratings/:companyRatingUniqueId
```

**Body:** `{ "rating": 4, "comment": "Updated comment" }`

**Access:** Admin / SuperAdmin only

### Delete Rating

```
DELETE /company/ratings/:companyRatingUniqueId
```

**Access:** Admin / SuperAdmin only

---

## ⚠️ Company Delinquencies

### Create Delinquency

```
POST /company/admin/delinquency
```

**Body:**

```json
{
  "companyUniqueId": "uuid",
  "delinquencyTypeUniqueId": "uuid",
  "delinquencyDescription": "Failed to complete delivery",
  "journeyDecisionUniqueId": "uuid"
}
```

**Access:** Admin / SuperAdmin only

### List Delinquencies

```
GET /company/admin/delinquency
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `companyUniqueId` | string (uuid) | Filter by company |
| `severity` | string | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |

### Delete Delinquency

```
DELETE /company/admin/delinquency/:companyDelinquencyUniqueId
```

**Access:** Admin / SuperAdmin only

---

## 💬 Delinquency Responses

### View Response

```
GET /company/delinquency-response/response
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `companyDelinquencyUniqueId` | string (uuid) | Filter by delinquency |

### View Pending Delinquencies (need response)

```
GET /company/delinquency-response/pending
```

**Query:** `companyUniqueId` (required)

---

## ⚖️ Delinquency Decisions

### Create Decision

```
POST /company/admin/delinquency-decisions
```

**Body:**

```json
{
  "companyDelinquencyUniqueId": "uuid",
  "companyDelinquencyResponseUniqueId": "uuid",
  "decisionOutcome": "UPHELD",
  "adminDecisionText": "Company failed to provide valid evidence",
  "delinquencyPointsAfter": 15
}
```

| Field | Type | Description |
|-------|------|-------------|
| `decisionOutcome` | string | `ACCEPTED` (company cleared), `REJECTED` (ban issued), `REDUCED` (points lowered), `DISMISSED` (case closed) |
| `delinquencyPointsAfter` | number | Required when `REDUCED` |

**Responses by outcome:**

| Outcome | Side Effect |
|---------|-------------|
| `ACCEPTED` (EXONERATED) | Delinquency soft-deleted, company cleared |
| `REJECTED` (UPHELD) | Graduated auto-ban check triggers possible suspension |
| `REDUCED` | Points updated to `delinquencyPointsAfter` |
| `DISMISSED` | Case closed, no further action |

### List Decisions

```
GET /company/admin/delinquency-decisions
```

### Get Single Decision

```
GET /company/admin/delinquency-decisions/:adminDecisionOnDelinquencyUniqueId
```

### Edit Decision

```
PUT /company/admin/delinquency-decisions/:adminDecisionOnDelinquencyUniqueId
```

**Body:** `{ "adminDecisionText": "Updated rationale" }`

### Delete Decision

```
DELETE /company/admin/delinquency-decisions/:adminDecisionOnDelinquencyUniqueId
```

---

## 🔓 Unban Company

```
PATCH /company/admin/delinquency/bans/:companyBanUniqueId/unban
```

**Access:** Admin / SuperAdmin only

---

## 🎭 Company Roles

### List Roles

```
GET /company/roles
```

### Create Role

```
POST /company/roles
```

**Body:** `{ "companyRoleName": "Dispatcher", "companyRoleDescription": "Manages fleet operations" }`

### Edit Role

```
PUT /company/roles/:companyRoleUniqueId
```

**Body:** `{ "companyRoleName": "Senior Dispatcher" }`

### Delete Role

```
DELETE /company/roles/:companyRoleUniqueId
```

---

## Navigation Map

```
GET /admin/dashboard                           → Dashboard cards
                                                ↓
GET /company/companies?approvalStatus=pending  → Pending Companies
  ├── GET /company/attachedDocuments/:id       → View Documents
  │     ├── PUT /admin/acceptRejectAttachedDocuments  → Approve Document
  │     └── PUT /admin/acceptRejectAttachedDocuments  → Reject Document
  ├── PATCH /company/companies/:id/approve     → Approve Company
  └── PATCH /company/companies/:id/approve     → Reject Company

GET /company/companies?approvalStatus=approved → Approved Companies
  ├── GET /company/memberships                 → View Members
  │     └── GET /vehicleDriver                 → View Driver Vehicle
  ├── GET /company/fleet                       → View Fleet
  ├── GET /company/bids                        → View Bids
  │     └── GET /company/assignments           → View Assignments
  ├── GET /company/ratings                     → View Ratings
  ├── GET /company/admin/delinquency           → View Delinquencies
  │     ├── GET /company/delinquency-response  → View Response
  │     └── GET /company/admin/...decisions    → View Decision
  ├── GET /company/companies/:id/profileHistory → View History
  └── PATCH /company/.../bans/:id/unban        → Unban (suspended only)

GET /company/roles                             → Company Roles
```
