# Frontend Payload Updates — Journey Starting Location

The backend now records where a journey actually starts. New Journey columns:

- `journeyStartingLat DECIMAL(10,8)`
- `journeyStartingLng DECIMAL(11,8)`

Both are returned inside the `journey` object of relevant responses (may be `null` for
legacy journeys created before this change).

## 1. PUT /api/driver/startJourney

Already-required request fields now persist the pickup point:

```json
{
  "driverRequestUniqueId": "...",
  "shipperRequestUniqueId": "...",
  "journeyDecisionUniqueId": "...",
  "latitude": 9.0205,
  "longitude": 38.8025
}
```

- `latitude` / `longitude` were already mandatory (400 "Latitude and longitude are
  required" otherwise). Send the driver's real GPS at start; it is stored as
  `journeyStartingLat` / `journeyStartingLng`.

## 2. POST /api/driver/takeFromStreet

Add `currentLocation` so the street-pickup journey records the real pickup point:

```json
{
  "phoneNumber": "+2519...",
  "currentLocation": { "latitude": 9.0042278, "longitude": 38.8661227, "description": "Addis Ababa" },
  "originLocation": { "latitude": 9.0042278, "longitude": 38.8661227, "description": "Addis Ababa" },
  "destination": { "latitude": 9.8, "longitude": 38.9, "description": "Addis Ababa" },
  "vehicle": { "vehicleTypeUniqueId": "..." },
  "shippableItemName": "cement",
  "shippableItemQtyInQuintal": 450,
  "shippingDate": "...",
  "deliveryDate": "...",
  "shippingCost": 40000
}
```

- `currentLocation` is preferred; if omitted the backend falls back to `originLocation`,
  then `null`.
- `shipperRequestBatchUniqueId` is now optional — the server generates one when absent.

## 3. Response shape

Journey objects now include:

```json
{
  "journey": {
    "journeyUniqueId": "...",
    "journeyStartingLat": "9.02050000",
    "journeyStartingLng": "38.80250000"
  }
}
```

Note: DECIMAL values come back as strings. Affected reads:
`getCompletedJourneys` / `searchCompletedJourney`, `getAllCompletedJourneys`,
`getJourneys`, `getOngoingJourney`, and driver status responses.

## 4. Batch ID (`batchId`) on shipper request records

Every payload that carries a `shipper` / `shipperRequest` object now includes the
numeric `batchId` (`ShipperRequestBatch.batchId`, an INT) so the app can render
`formatOrderId` → `batchId/534`. The `batchUniqueId` (UUID) stays as-is.

Sources updated (all return `batchId` inside the shipper record):

| # | Endpoint / Event | Field |
|---|---|---|
| 1 | `GET /api/driver/verifyDriverJourneyStatus` | `response.shipper.batchId` |
| 2 | `GET /api/shippingRequest/getAllActiveRequests` | `data[].shipperRequest.batchId` |
| 3 | `GET /api/user/getShipperRequest4allOrSingleUser?journeyStatusId=6` (History) | `data[].shipperRequest.batchId` |
| 4 | `GET /api/user/getShipperRequest4allOrSingleUser?journeyStatusId=6` (Recent Completed) | `data[].shipperRequest.batchId` |
| 5 | `POST /api/driver/createAndAcceptNewRequest` | `response.shipper.batchId` |
| 6 | `PUT /api/driver/acceptShipperRequest` | `response.shipper.batchId` |
| 7 | `POST /api/driver/takeFromStreet` | `response.shipper.batchId` |
| 8 | `PATCH /api/company/assignments/:assignmentUniqueId/status` | `data.shipperRequest.batchId` (company) |
| 9 | WebSocket `messages` | `message.shipper.batchId` |

```json
{
  "shipper": {
    "shipperRequestUniqueId": "...",
    "shipperRequestId": 534,
    "batchId": 131,
    "shipperRequestBatchUniqueId": "e17d7f10-..."
  }
}
```

Notes:
- `batchId` is resolved from `ShipperRequestBatch.batchId` via
  `shipperRequestBatchUniqueId`; it is `null`/absent only if the batch row is missing.
- Company assignment payloads (`getFullAssignmentData` / `assignmentHelper.js`) already
  carried `batchId`; the driver/shipper sources were the gap.

