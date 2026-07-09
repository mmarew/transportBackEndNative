# Shipper Status Detail APIs

Maps each status category from `verifyShipperStatus` `totalRecords` to the existing API that returns the actual records.

---

## Individual (non-company)

| Category | Status | API |
|---|---|---|
| `waiting` | 1 | `GET /api/user/getShipperRequest4allOrSingleUser?journeyStatusId=1&excludeRequestMode=company_target` |
| `requested` | 2 | `GET /api/user/getShipperRequest4allOrSingleUser?journeyStatusId=2&excludeRequestMode=company_target` |
| `bidding` | 3 | `GET /api/user/getShipperRequest4allOrSingleUser?journeyStatusId=3&excludeRequestMode=company_target` |
| `acceptedByShipper` | 4 | `GET /api/user/getShipperRequest4allOrSingleUser?journeyStatusId=4&excludeRequestMode=company_target` |
| `journeyStarted` | 5 | `GET /api/user/getShipperRequest4allOrSingleUser?journeyStatusId=5&excludeRequestMode=company_target` |
| `notSeenCompleted` | 6 + `isCompletionSeen=false` | `GET /api/user/getShipperRequest4allOrSingleUser?journeyStatusId=6&isCompletionSeen=false&excludeRequestMode=company_target` |
| `notSeenCancelledByDriver` | 9 via JourneyDecisions, unseen | `GET /api/shipperRequest/getCancellationNotifications` |

---

## Company — Batches

| Category | Condition | API |
|---|---|---|
| `waiting` (no bids) | batch status 1/2, no submitted/accepted bids | `GET /api/company/bids?target=available` |
| `bidding` (auction) | has `submitted` bids, not yet accepted | `GET /api/company/bids?bidStatus=submitted` |
| `acceptedByShipper` (ongoing) | bid `accepted_by_shipper` | `GET /api/company/bids?bidStatus=accepted_by_shipper` |

---

## Company — Slots (under `acceptedByShipper.company`)

| Sub-category | Condition | API |
|---|---|---|
| All slots | `requestMode=company_target` | `GET /api/user/getShipperRequest4allOrSingleUser?requestMode=company_target` |
| Per batch | filter by batch | `GET /api/user/getShipperRequest4allOrSingleUser?shipperRequestBatchId={batchUniqueId}` |
| With assignment detail | per won batch | `GET /api/company/assignments?shipperRequestBatchId={batchUniqueId}` |
