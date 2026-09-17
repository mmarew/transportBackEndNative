# Single Driver Delinquency Workflow

> **Base URL:** `{{url}}`

End-to-end flow for issuing a delinquency to a driver, the driver submitting a defense, and the system admin issuing a final ruling.

---

## Database Tables Involved

```
UserDelinquency          → accusation record
UserDelinquencyResponse  → driver's defense (1 per delinquency)
AdminDecisionOnUserDelinquency → admin ruling
BannedUsers              → auto-ban if points exceed threshold
```

---

## Flow Overview

```
Admin creates delinquency (Step 1)
         │
         ▼
Driver views pending delinquencies (Step 2)
         │
         ▼
Driver submits response / defense (Step 3)
         │
         ▼
Admin reviews response + issues decision (Step 4)
         │
         ├── EXONERATED  → delinquency soft-deleted, driver cleared
         ├── UPHELD      → points kept, auto-ban check runs
         ├── REDUCED     → points lowered to admin-specified value
         └── DISMISSED   → no action taken
```

---

## Step 1 — Admin Creates a Delinquency

**Endpoint:** `POST {{url}}/api/admin/userDelinquency/` (mounted at `/api/admin/userDelinquency`)

**Auth:** Bearer token (Admin / Super Admin)

**Request Body:**
```json
{
  "userUniqueId": "driver-uuid-here",
  "delinquencyTypeUniqueId": "delinquency-type-uuid",
  "roleId": 2,
  "delinquencyDescription": "Driver failed to deliver on time without prior notice",
  "journeyDecisionUniqueId": "optional-journey-decision-uuid",
  "deliveryConfirmationUniqueId": "optional-delivery-confirmation-uuid"
}
```

| Field | Required | Notes |
|---|---|---|
| `userUniqueId` | Yes | UUID of the driver |
| `delinquencyTypeUniqueId` | Yes | Must reference an active DelinquencyType |
| `roleId` | Yes | `2` for driver |
| `delinquencyDescription` | No | Free-text violation description |
| `journeyDecisionUniqueId` | No | Links to the specific journey |
| `deliveryConfirmationUniqueId` | No | Auto-disputes the linked delivery confirmation |
| `delinquencySeverity` | No | Override: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `delinquencyPoints` | No | Override point value |

**Success Response (201):**
```json
{
  "message": "User delinquency created",
  "data": null,
  "userDelinquencyUniqueId": "generated-uuid",
  "automaticAction": {
    "banApplied": false,
    "totalPoints": 5,
    "threshold": 10
  },
  "deliveryConfirmationDisputed": false,
  "deliveryConfirmationCreated": false
}
```

**Side Effects:**
- Duplicate check runs within 24h window (skippable via `skipDuplicateCheck`)
- Automatic ban check runs if total points exceed threshold
- If `deliveryConfirmationUniqueId` is provided, the linked DC status becomes `DISPUTED`
- `responseDeadline` is auto-set based on severity (CRITICAL=1d, HIGH=3d, MEDIUM=5d, LOW=7d)

---

## Step 2 — Driver Views Pending Delinquencies

**Endpoint:** `GET {{url}}/api/user/delinquencyResponse/pending` (mounted at `/api/user/delinquencyResponse`)

**Auth:** Bearer token (Driver)

**Query Parameters:**

| Param | Required | Notes |
|---|---|---|
| `userUniqueId` | Yes | Driver's own UUID |
| `roleId` | Yes | `2` for driver |
| `page` | No | Default `1` |
| `limit` | No | Default `10` |

**Request Example:**
```
GET {{url}}/api/user/delinquencyResponse/pending?userUniqueId=driver-uuid&roleId=2&page=1&limit=10
```

**Success Response (200):**
```json
{
  "message": "User delinquencies list fetched",
  "data": [
    {
      "userDelinquencyUniqueId": "delinquency-uuid",
      "delinquencyDescription": "Driver failed to deliver on time",
      "delinquencySeverity": "HIGH",
      "delinquencyPoints": 3,
      "delinquencyCreatedAt": "2026-09-15T10:30:00.000Z",
      "responseDeadline": "2026-09-18T10:30:00.000Z",
      "isOverdue": false,
      "delinquencyTypeName": "Late Delivery",
      "delinquencyTypeDescription": "Delivery completed after the agreed deadline",
      "accusedByName": "Admin Name",
      "responseStatus": "AWAITING_RESPONSE"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalItems": 1,
    "limit": 10
  }
}
```

**`responseStatus` values:**
- `AWAITING_RESPONSE` — driver has not yet submitted a defense
- `RESPONDED` — driver has already submitted a defense

**`isOverdue`:**
- `true` — response deadline has passed
- `false` — still within deadline

---

## Step 3 — Driver Submits a Defense

**Endpoint:** `POST {{url}}/api/user/delinquencyResponse/response`

**Auth:** Bearer token (Driver)

**Request Body:**
```json
{
  "userDelinquencyUniqueId": "delinquency-uuid",
  "userDelinquencyResponse": "I was stuck in traffic due to a road accident. I have attached photos as evidence. The delay was beyond my control."
}
```

| Field | Required | Notes |
|---|---|---|
| `userDelinquencyUniqueId` | Yes | The delinquency being disputed |
| `userDelinquencyResponse` | Yes | Driver's defense text (min length enforced) |

**Success Response (201):**
```json
{
  "message": "Delinquency dispute operation completed",
  "data": "Dispute response submitted successfully",
  "userDelinquencyResponseUniqueId": "response-uuid",
  "isLateResponse": false,
  "isPostDecisionResponse": false
}
```

**Possible `data` messages:**

| Condition | Message |
|---|---|
| On time, no prior decision | `"Dispute response submitted successfully"` |
| Late, no prior decision | `"Dispute response submitted (marked as LATE — past the response deadline)"` |
| On time, after admin decision | `"Post-decision defense submitted. Admin notified to re-review the {outcome} ruling."` |
| Late, after admin decision | `"Post-decision defense submitted (late). Admin notified to re-review the {outcome} ruling."` |

**Side Effects:**
- Only **one response** per delinquency is allowed (duplicate blocked)
- If submitted after `responseDeadline`, `isLateResponse = true`
- If admin already decided, admin receives a push notification for re-review (`POST_DECISION_USER_RESPONSE`)

**Error Responses:**

| Status | Message |
|---|---|
| 404 | `"Delinquency not found"` |
| 400 | `"A response already exists for this delinquency. You cannot submit more than one."` |

---

## Step 4 — Admin Issues a Decision

**Endpoint:** `POST {{url}}/api/admin/userDelinquencyDecisions/` (mounted at `/api/admin/userDelinquencyDecisions`)

**Auth:** Bearer token (Admin / Super Admin only)

**Request Body:**
```json
{
  "userDelinquencyUniqueId": "delinquency-uuid",
  "userDelinquencyResponseUniqueId": "response-uuid",
  "decisionOutcome": "EXONERATED",
  "adminDecisionText": "After reviewing the driver's defense and the traffic accident evidence, the delay is justified.",
  "delinquencyPointsAfter": null
}
```

| Field | Required | Notes |
|---|---|---|
| `userDelinquencyUniqueId` | Yes | The delinquency being ruled on |
| `userDelinquencyResponseUniqueId` | No | The specific response being considered |
| `decisionOutcome` | Yes | `EXONERATED`, `UPHELD`, `REDUCED`, or `DISMISSED` |
| `adminDecisionText` | Yes | Admin's justification (min length enforced) |
| `delinquencyPointsAfter` | Conditional | **Required** when outcome is `REDUCED` |

**Success Response (201):**
```json
{
  "message": "Admin decision recorded: EXONERATED",
  "data": null,
  "adminDecisionOnUserDelinquencyUniqueId": "decision-uuid",
  "decisionOutcome": "EXONERATED"
}
```

---

### Decision Outcomes

| Outcome | Side Effect |
|---|---|
| **`EXONERATED`** | Delinquency is soft-deleted (`delinquencyDeletedAt` set). Driver is cleared. |
| **`UPHELD`** | Points remain. Automatic ban check runs — if cumulative points ≥ threshold, driver is banned. |
| **`REDUCED`** | Points are lowered to `delinquencyPointsAfter`. Auto-ban check runs with new total. |
| **`DISMISSED`** | No action taken. Delinquency remains on record but nothing changes. |

**Post-Decision Push Notification (sent to driver):**

| Outcome | Notification Title | Notification Body |
|---|---|---|
| `EXONERATED` | `Delinquency Decision: EXONERATED` | "You have been cleared. The delinquency accusation has been dismissed." |
| `UPHELD` | `Delinquency Decision: UPHELD` | "The accusation has been upheld. A graduated review has been applied." |
| `REDUCED` | `Delinquency Decision: REDUCED` | "Your delinquency points have been reduced after admin review." |
| `DISMISSED` | `Delinquency Decision: DISMISSED` | "The delinquency case has been closed with no further action." |

**Error Responses:**

| Status | Message |
|---|---|
| 404 | `"Delinquency not found"` |
| 400 | `"An admin decision already exists for this delinquency"` |
| 400 | `"delinquencyPointsAfter is required when decisionOutcome is REDUCED"` |

---

## Read Endpoints (Reference)

### Get All Delinquencies (Admin)
```
GET {{url}}/api/admin/userDelinquency/?page=1&limit=10&delinquencySeverity=HIGH
```

### Get Delinquency Summary (per driver)
```
GET {{url}}/api/admin/userDelinquency/?userUniqueId=driver-uuid&roleId=2&summary=true
```

**Response:**
```json
{
  "message": "User delinquencies list fetched",
  "data": {
    "summary": {
      "userUniqueId": "driver-uuid",
      "roleId": 2,
      "userName": "John Driver",
      "roleName": "driver",
      "totalDelinquencies": 3,
      "totalPoints": 7,
      "latestDelinquency": "2026-09-15T10:30:00.000Z"
    },
    "recentDelinquencies": [],
    "isBanned": false,
    "banInfo": null
  }
}
```

### Get Driver's Response
```
GET {{url}}/api/user/delinquencyResponse/response?userDelinquencyUniqueId=delinquency-uuid
```

### Get Admin Decisions
```
GET {{url}}/api/admin/userDelinquencyDecisions/?userDelinquencyUniqueId=delinquency-uuid
```

### Check Automatic Ban Status
```
GET {{url}}/api/admin/userDelinquency/check-automatic-ban/:userUniqueId/:roleId
```

---

## State Diagram

```
                    ┌─────────────────┐
                    │  DELINQUENCY     │
                    │  CREATED         │
                    └────────┬────────┘
                             │
                  ┌──────────▼──────────┐
                  │  AWAITING_RESPONSE   │
                  │  (responseDeadline   │
                  │   set by severity)   │
                  └──────────┬──────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     Driver responds   Deadline passes  Admin decides
     (on time or late)  (no response)   without response
              │              │              │
              ▼              ▼              ▼
    ┌─────────────┐   ┌──────────┐   ┌──────────┐
    │  RESPONDED   │   │  OVERDUE │   │ DECIDED  │
    └──────┬──────┘   └────┬─────┘   └────┬─────┘
           │               │              │
           └───────┬───────┘              │
                   │                      │
                   ▼                      │
          ┌────────────────┐              │
          │  ADMIN DECIDES │◄─────────────┘
          └───────┬────────┘
                  │
    ┌─────────┬───┴────┬──────────┐
    │         │        │          │
    ▼         ▼        ▼          ▼
EXONERATED  UPHELD  REDUCED   DISMISSED
(soft-      (auto-  (lower    (no
 delete)     ban     points)   action)
             check)
```

---

## Post-Decision Response Flow

After an admin has already decided, the driver can still submit a **post-decision defense**:

```
Admin issues decision (Step 4)
         │
         ▼
Driver submits post-decision response (Step 3 again)
         │
         ▼
Admin receives push notification: "POST_DECISION_USER_RESPONSE"
         │
         ▼
Admin re-reviews and may issue a new decision
```

- `isPostDecisionResponse: true` in the response indicates this path
- Admin is notified via FCM push to re-review

---

## Validation Rules Summary

| Rule | Details |
|---|---|
| One response per delinquency | Duplicate responses blocked |
| Edit blocked after decision | Cannot modify response once admin rules |
| One decision per delinquency | Duplicate decisions blocked |
| REDUCED requires points | `delinquencyPointsAfter` mandatory for REDUCED |
| Late flag | Auto-set if `responseDeadline < NOW()` at submission time |
| Duplicate delinquency check | 24h window (configurable per DelinquencyType) |
