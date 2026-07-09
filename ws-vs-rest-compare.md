# WebSocket vs REST API Payload Comparison

## Legend

| Symbol | Meaning |
|---|---|
| ✅ **Match** | WS `data` field has the same structure as the REST API GET response for the same resource |
| ⚠️ **Partial** | WS `data` has extra fields, missing fields, or different nesting than the REST API |
| ❌ **Mismatch** | WS `data` is fundamentally different (flat key-value instead of nested resource) |
| ➖ **N/A** | No REST API exists for this state (terminal/cancelled — no GET returns these) |

---

## Flow 1 — Individual (Shipper ↔ Driver)

### 1.1 Shipper Creates Request → Driver Notified

**REST API (GET equivalent):** `GET /api/user/getShipperRequest4allOrSingleUser?shipperRequestUniqueId={id}`

**REST response shape:**
```
formattedData[0]:
  shipperRequest: { ShipperRequest.*, fullName, email, phoneNumber, vehicleTypeName }
  driverRequests: []      (empty — no driver yet)
  decisions:      []      (empty)
  journey:        {}      (empty)
```

**WS payload** (`handleWaitingRequest` in `statusVerification.service.js:307`):
```
messageTypes: driver_found_shipper_request
status:       2 (requested)
shipper:      shipperRequest row
driver:       { driver: { DriverRequest.*, fullName, phoneNumber, driverProfilePhoto },
                vehicle: { vehicleUniqueId, licensePlate, color, vehicleTypeName } }
journey:      null
decisions:    journeyDecisionPayload
```

| WS field | REST equivalent | Match? |
|---|---|---|
| `shipper` | `formattedData[0].shipperRequest` | ⚠️ WS sends raw row; REST joins Users + VehicleTypes |
| `driver` | `formattedData[0].driverRequests[0]` with `vehicleOfDriver` | ⚠️ Different nesting — WS `{ driver, vehicle }`, REST `driverRequests[]` with nested `vehicleOfDriver` |
| `decisions` | `formattedData[0].decisions[0]` | ✅ Same JourneyDecision row |
| `journey` | `formattedData[0].journey` | ✅ Both null/{} for this status |
| N/A | `formattedData[0].shipperRequest.fullName/email/phoneNumber/vehicleTypeName` | ⚠️ WS includes driver info instead of enriching shipper |

> **Note:** The WS shapes the payload for the *driver recipient* (driver info at top level), while the REST API shapes it for the *shipper's perspective*. They're not directly comparable — the WS sends what the driver needs to see immediately.

---

### 1.2 Driver Accepts Request → Shipper Notified

**REST API (GET equivalent):** `GET /api/user/getShipperRequest4allOrSingleUser?shipperRequestUniqueId={id}`

**REST response shape:**
```
formattedData[0]:
  shipperRequest: { ShipperRequest.*, fullName, email, phoneNumber, vehicleTypeName }
  driverRequests: [{ DriverRequest.*, fullName, phoneNumber, vehicleOfDriver: { Vehicle.*, VehicleTypes.* }, driverProfilePhoto }]
  decisions:      [{ JourneyDecision.* }]
  journey:        {}  (or Journey row if started)
```

**WS payload** (`sendShipperNotification` in `statusVerification.service.js:569`):
```
messageTypes: driver_accepted_shipper_request
status:       3 (bidding)
formattedData: [{
  shipperRequest: { ShipperRequest row },
  driverRequests: [{ DriverRequest.*, vehicleOfDriver: { Vehicle.*, VehicleTypes.* }, driverProfilePhoto }],
  decisions:      [JourneyDecision row],
  journey:        {} or Journey row
}]
```

| Field | Match? |
|---|---|
| `formattedData[0].shipperRequest` | ✅ Same structure |
| `formattedData[0].driverRequests` | ✅ Same structure (DriverRequest + vehicleOfDriver + driverProfilePhoto) |
| `formattedData[0].decisions` | ✅ Same |
| `formattedData[0].journey` | ✅ Same |

> **✅ MATCH** — The WS payload reuses `formattedData` from `getDetailedJourneyData`, which is the same function used by the REST API.

---

### 1.3 Shipper Accepts Driver → Driver Notified

**REST API (GET equivalent):** Driver-side: driver's own request status endpoint. Check what driver sees.

**REST response shape (driver perspective):**
Driver uses `GET /api/driverRequest/getDriverRequest4allOrSingleUser` or the driver status verification endpoint.

**WS payload** (`actionAccept.service.js:147`):
```
messageTypes: shipper_accepted_driver_request
...driverStatus  (whatever verifyDriverJourneyStatus returns)
```

> **Needs investigation** — verify what `driverStatus` contains and what the driver's REST API returns. Likely comparable to how the shipper REST API works but scoped to the driver's active request.

---

### 1.4–1.8 Cancellations, Rejections, Journey Events

**REST API (GET equivalent):** Terminal states (cancelledByShipper=7, cancelledByDriver=9, rejectedByShipper=8) are **excluded** from the active endpoint `GET /api/user/getShipperRequest4allOrSingleUser`. They only appear if you call it with `journeyStatusId` explicitly set.

For journey events (started/completed):
- ✅ `driver_started_journey` → WS uses same `sendShipperNotification` with `formattedData` → **MATCH**
- ✅ `driver_completed_journey` → WS uses same `sendShipperNotification` with `formattedData` → **MATCH**

For cancellations:
- ❌ WS payload is hand-built (not using `getDetailedJourneyData`) — may not match REST shape

---

## Flow 2 — Company: Batch & Bid (Shipper ↔ Company)

### 2.1 Shipper Creates Batch → Company Notified

**REST API (GET equivalent):** `GET /api/company/bids?target=available`

**REST response shape:**
```
data[0]:
  batchUniqueId, shipperRequestBatchId, batchId, originPlace, destinationPlace,
  shippableItemName, shippableItemQtyInQuintal, totalVehicles, shippingCost,
  shippingDate, deliveryDate, journeyStatusId, journeyStatusName,
  vehicleTypeName, shipperName, shipperPhone,
  ...all other b.* (ShipperRequestBatch) columns...
```

**WS payload** (`batchCreate.service.js:129`):
```
messageTypes: company_batch_available
data: batch || null
```

Where `batch` is from the CREATE response (line 110–120):
```sql
SELECT b.*, ... as shipperName, ... as vehicleTypeName, ... as journeyStatusName
FROM ShipperRequestBatch b
```

| REST field | WS `data` field | Match? |
|---|---|---|
| `batchUniqueId` | `batch.batchUniqueId` | ✅ Same query result |
| `shipperName` | `batch.shipperName` | ✅ Same alias |
| `vehicleTypeName` | `batch.vehicleTypeName` | ✅ Same alias |
| `journeyStatusName` | `batch.journeyStatusName` | ✅ Same alias |
| `shipperPhone` | `batch.shipperPhone` | ✅ Added in the recent fix |
| N/A | `messageTypes`, `notification`, `message` | WS envelope fields (not in REST) |

> **✅ MATCH** — The WS `data` IS the same batch row returned by the REST API (same query, same aliases).

---

### 2.2 Company Submits Bid → Shipper Notified

**REST API (GET equivalent):** `GET /api/company/bids?bidStatus=submitted` (filter for this batch)

**REST response shape:**
```
data[0]:
  batchUniqueId, shipperRequestBatchId, ..., shipperName, ..., offerCount,
  offers: [{
    companyBidRequestUniqueId, bidStatus, companyName, proposedTotalCost,
    numberOfVehiclesOffered, ..., submittedByName, companyFleetSize, ...
  }]
```

**WS payload** (`bidCreate.service.js:321`):
```
messageTypes: company_bid_submitted
data: {
  ...batchRecord (shipperName, vehicleTypeName, journeyStatusName, all batch fields...),
  offerCount: 1,
  offers: [{ full offer record with companyName, proposedTotalCost, submittedByName, ... }]
}
```

The WS fetches the batch via aliased query + the offer via join query, then wraps as `{ ...batchRecord, offerCount: 1, offers: [offerRecord] }` — exactly matching the REST grouped view.

| REST field | WS `data` field | Match? |
|---|---|---|
| `batchUniqueId`, `shipperName`, `vehicleTypeName`, etc. | `batchUniqueId`, `shipperName`, `vehicleTypeName`, etc. (at top level) | ✅ Same fields, same level |
| `offerCount` | `offerCount` | ✅ |
| `offers[0]` (full offer) | `offers[0]` (full offer) | ✅ Same query |
| `offers[0].companyName` | `offers[0].companyName` | ✅ |
| N/A | `messageTypes`, `notification`, `message` | WS envelope (not in REST) |

> **✅ MATCH** — The WS wraps as `{ ...batchRecord, offerCount: 1, offers: [offerRecord] }` which mirrors `GET /api/company/bids?bidStatus=submitted`.

---

### 2.3 Shipper Accepts/Rejects Bid → Company Notified

**REST API (GET equivalent):** `GET /api/company/bids?bidStatus=accepted_by_shipper` (or `submitted` for rejected/cancelled)

**REST response shape** (accepted):
```
data[0]:
  batchUniqueId, ..., shipperName, ..., offerCount,
  offers: [{
    companyBidRequestUniqueId, bidStatus: "accepted_by_shipper", ...
  }]
```

**WS payload** (`bidUpdate.service.js:409`):
```
messageTypes: company_bid_accepted / company_bid_rejected / company_bid_cancelled
notification: { title, body }
data: companyBidPayload || fullBid || { bidStatus, companyBidRequestUniqueId, shipperRequestBatchId }
```

Where `companyBidPayload` = `{ ...batchRow, offerCount: 1, offers: [fullBid] }` (line 354). The batch is fetched with the same aliased query used in the REST API (`shipperName`, `vehicleTypeName`, `journeyStatusName`), and the offer is fetched with the same join query (`companyName`, `submittedByName`, `companyFleetSize`, etc.).

| REST `data[0]` | WS `data` (when companyBidPayload is set) | Match? |
|---|---|---|
| `batchUniqueId`, `shipperName`, `batchShippingCost`, etc. | Same batch fields at top level | ✅ |
| `offers[0]` (full offer) | `offers[0]` (full offer) | ✅ |
| `offerCount` | `offerCount` | ✅ |

> **✅ MATCH** — WS wraps as `{ ...batchRow, offerCount: 1, offers: [fullBid] }`, same as the REST grouped view. Fallback `fullBid` is only used if batch fetch fails.

---

### 2.4 Company Cancels Batch → Shipper, Driver, Company Notified

**REST API (GET equivalent):** No active GET — cancelled items are terminal.

**WS payload** (`sendNotifications.service.js:90`):
```
data: fullBatch || { batchUniqueId, cancelStatusId }
```

> ➖ N/A — No REST GET returns cancelled batches in active views.

---

## Flow 3 — Company: Assignment (Company ↔ Driver ↔ Shipper)

### 3.1 Company Assigns Driver → Driver Notified

**REST API (GET equivalent):** `GET /api/company/assignments?assignmentUniqueId={id}`

**REST response shape:**
```
data[0]:
  assignmentUniqueId, assignmentStatus, driverUserUniqueId, driverRequestUniqueId,
  shipperRequestUniqueId, vehicleUniqueId, ...
  driverName, driverPhone, licensePlate, vehicleTypeName, journeyStatusId
```

**WS payload** (`assignmentHelper.js:211` — `notifyAssignedDriver`):
```
messageTypes: company_driver_assignment
...statusResult (from verifyDriverJourneyStatus)
```

The `statusResult` comes from `verifyDriverJourneyStatus({ userUniqueId })` which returns the driver's full status payload (includes `status`, `driver`, `shipper`, `decision`, `journey`, `companyAssignment`).

| REST `data[0]` | WS `statusResult.companyAssignment` | Match? |
|---|---|---|
| `assignmentUniqueId` | `assignmentUniqueId` | ✅ |
| `driverName` | (in `statusResult.driver.fullName`) | ⚠️ Different location — REST flattens, WS nests under driver |
| `driverPhone` | (in `statusResult.driver.phoneNumber`) | ⚠️ Same |
| `licensePlate` | (in `statusResult.driver.vehicleOfDriver.licensePlate`) | ⚠️ Nested deeper |
| `vehicleTypeName` | (in `statusResult.driver.vehicleOfDriver.vehicleTypeName`) | ⚠️ Nested deeper |

> **⚠️ PARTIAL** — The WS sends the full `verifyDriverJourneyStatus` payload which is the driver's main status response (much richer than just the assignment record). The REST `/api/company/assignments` is a flat assignment view. They serve different purposes — WS gives the driver their full context, REST gives the company a database-like view.

---

### 3.2 Company Assigns Driver → Shipper Notified

**REST API (GET equivalent):** `GET /api/company/assignments?assignmentUniqueId={id}`

**REST response shape:**
```
data[0]:
  assignmentUniqueId, assignmentStatus, driverUserUniqueId, driverRequestUniqueId,
  shipperRequestUniqueId, vehicleUniqueId, ...
  driverName, driverPhone, licensePlate, vehicleTypeName, journeyStatusId
```

**WS payload** (`assignmentCreate.service.js` / `assignmentAuto.service.js`):
```
messageTypes: company_driver_assignment
notification: { title, body }
data: {
  type: "company_assignment_created",
  companyBidRequestUniqueId,
  assignments: [{
    assignmentUniqueId, assignmentStatus, driverUserUniqueId, driverRequestUniqueId,
    shipperRequestUniqueId, vehicleUniqueId, ...,
    driverName, driverPhone, licensePlate, vehicleTypeName, journeyStatusId
  }, ...]
}
```

The WS fetches full assignment records via `getAssignmentsData()` which runs the same LEFT JOIN query used by `GET /api/company/assignments` — joining `Users`, `Vehicle`, `VehicleTypes`, and `DriverRequest`.

| REST `data[0]` | WS `data.assignments[0]` | Match? |
|---|---|---|
| `assignmentUniqueId` | `assignmentUniqueId` | ✅ |
| `assignmentStatus` | `assignmentStatus` | ✅ |
| `driverName` | `driverName` | ✅ |
| `driverPhone` | `driverPhone` | ✅ |
| `licensePlate` | `licensePlate` | ✅ |
| `vehicleTypeName` | `vehicleTypeName` | ✅ |
| `journeyStatusId` | `journeyStatusId` | ✅ |
| All `cba.*` columns | All `cba.*` columns | ✅ |

> **✅ MATCH** — WS now sends the same full assignment record array that `GET /api/company/assignments` returns. FCM stays flat (UUIDs only) due to platform limits.

---

### 3.3 Driver Confirms Assignment → Company + Shipper Notified

**REST API (GET equivalent):** `GET /api/company/assignments?assignmentUniqueId={id}`

**REST response shape:**
```
data[0]:
  assignmentUniqueId, assignmentStatus: "confirmed_by_driver",
  driverUserUniqueId, driverRequestUniqueId, shipperRequestUniqueId, ...
  driverName, driverPhone, licensePlate, vehicleTypeName, journeyStatusId
```

**WS payload** (`assignmentUpdate.service.js:605` to company):
```
messageTypes: company_driver_confirmed
notification: { title: "Driver Confirmed", body: "Driver X confirmed..." }
data: fullAssignment || {
  type: "company_driver_confirmed",
  assignmentStatus: "confirmed_by_driver",
  assignmentUniqueId,
  journeyDecisionUniqueId,
  shipperRequestUniqueId,
  companyBidRequestUniqueId
}
```

Where `fullAssignment` is from `getFullAssignmentData()`:
```
assignmentUniqueId, assignmentStatus, driverName, driverPhone, licensePlate,
vehicleTypeName, journeyStatusId, 
...all other cba.* columns...
```

| REST `data[0]` | WS `data` (when fullAssignment available) | Match? |
|---|---|---|
| `assignmentUniqueId` | `assignmentUniqueId` | ✅ |
| `assignmentStatus` | `assignmentStatus` | ✅ |
| `driverName` | `driverName` | ✅ |
| `driverPhone` | `driverPhone` | ✅ |
| `licensePlate` | `licensePlate` | ✅ |
| `vehicleTypeName` | `vehicleTypeName` | ✅ |
| `journeyStatusId` | `journeyStatusId` | ✅ |

> **✅ MATCH** — When `fullAssignment` is available (which it is, fetched at line 272), the WS `data` is identical to what `GET /api/company/assignments` returns. The fallback is only used if the fetch fails.

---

### 3.4–3.6 Driver Progress Events (going_to_loading → journey_started → completed)

**REST API (GET equivalent):** `GET /api/company/assignments?assignmentUniqueId={id}`

**WS payload** (`assignmentUpdate.service.js:772` to company):
```
messageTypes: company_driver_going_to_loading / company_driver_journey_started / company_driver_completed
data: fullAssignment || { type: "company_assignment_progress", ... }
```

> **✅ MATCH** — Same pattern as 3.3. Uses `fullAssignment` from `getFullAssignmentData()` which matches the REST API shape.

---

### 3.7 Driver Rejects/Cancels Assignment → Company + Shipper Notified

**REST API (GET equivalent):** `GET /api/company/assignments?assignmentStatus=rejected_by_driver` (terminal — only for audit)

**WS payload** (`assignmentUpdate.service.js:342` to company):
```
messageTypes: company_driver_rejected / company_driver_cancelled
data: fullAssignment || { type: "assignment_rejected", assignmentUniqueId, ... }
```

> **✅ MATCH** — When `fullAssignment` is available, same as REST shape.

---

## Summary by Recipient

### Company receives

| Event | WS `data` vs REST | Status |
|---|---|---|
| Batch available (new freight) | Same batch row, same aliases | ✅ **Match** |
| Bid accepted/rejected | `{ ...batchRecord, offerCount: 1, offers: [fullOffer] }` — same grouped view | ✅ **Match** |
| Assignment confirmed | Full assignment record via `getFullAssignmentData` | ✅ **Match** |
| Assignment progress (loading/started/completed) | Full assignment record | ✅ **Match** |
| Driver rejected/cancelled | Full assignment record (when available) | ✅ **Match** |

### Shipper receives

| Event | WS `data` vs REST | Status |
|---|---|---|
| Driver accepted (individual) | Same `formattedData` from `getDetailedJourneyData` | ✅ **Match** |
| Driver started journey (individual) | Same `formattedData` | ✅ **Match** |
| Driver completed (individual) | Same `formattedData` | ✅ **Match** |
| Company bid submitted | `{ ...batchRecord, offerCount: 1, offers: [offerRecord] }` — same grouped view | ✅ **Match** |
| Company assignment created | Full assignment records via `getAssignmentsData` (same query as REST) | ✅ **Match** |
| Company driver confirmed | Full assignment records via `getFullAssignmentData` | ✅ **Match** |

### Driver receives

| Event | WS `data` vs REST | Status |
|---|---|---|
| New request available | Driver-centric shape (driver+vehicle at top), not REST's shipper-centric `formattedData` | ⚠️ Partial (by design) |
| Shipper accepted/rejected | Depends on `driverStatus` from `verifyDriverJourneyStatus` | ❓ Needs verification |
| Company assignment | Full `verifyDriverJourneyStatus` payload | ⚠️ Richer than the flat assignment REST |

---

## Key Gaps (remaining)

1. **Individual cancellations** (1.4+): WS payloads are hand-built in each service file rather than using `getDetailedJourneyData`, so they may drift from the REST shape.

2. **Driver notification for shipper actions**: WS sends `verifyDriverJourneyStatus` payload which differs from the flat `/api/company/assignments` REST shape. This is intentional — the driver needs their full status context, not just the assignment row.

3. **FCM data always stays flat** (key-value only, no nesting) due to platform limits. This is by design and not a gap — FCM and WS serve different purposes (background wake vs. live UI update).
