# GET /api/journey/pod-status — Deliveries with Proof-Of-Delivery status

Returns the deliveries (journeys) the caller can see, each with its **single**
proof-of-delivery (POD) status. Because the journey keeps at most one delivery
confirmation, the response never contains duplicate deliveries — **one POD per
journey**.

The main use case: **"which deliveries are not proofed yet?"** → filter
`podStatus=NONE`.

## Request

**Method:** GET
**Auth:** Bearer token (required) — `Authorization: Bearer <token>`

```http
{{url}}/api/journey/pod-status?userUniqueId=self&podStatus=NONE&page=1&limit=20
```

## Query parameters

| Param | Type | Required | Values / behavior |
|---|---|---|---|
| `userUniqueId` | string | No | `self` (or omitted) → the **caller's own** deliveries. A valid UUID is only meaningful for admins; drivers/shippers are always locked to themselves. |
| `podStatus` | string | No | `NONE` \| `PENDING` \| `CONFIRMED` \| `DISPUTED`. **`NONE` = no POD submitted yet (not proofed).** Omit the param to return every status. |
| `journeyStatusId` | int | No | Journey status to filter on (e.g. 9 = completed). |
| `ownerUserUniqueId` | string | No | Admin only. Narrow the view to one driver or shipper. |
| `fromDate` | date | No | Only journeys that started on/after this date. |
| `toDate` | date | No | Only journeys that ended on/before this date. |
| `page` | int | No | Page number. Default `1`. |
| `limit` | int | No | Page size. Default `10`, max `100`. |

## Who sees what (automatic, server-side)

| Role | Scope |
|---|---|
| Driver | Deliveries where they are the driver (`userUniqueId=self`) |
| Shipper | Deliveries where they are the shipper |
| Company admin / dispatcher | Deliveries assigned to their company (`targetCompanyUniqueId`) |
| Admin / Super admin | All deliveries; optionally narrowed with `ownerUserUniqueId` |

## Sample response — `200 OK`

```json
{
  "message": "Deliveries fetched successfully",
  "data": [
    {
      "journey": {
        "journeyUniqueId": "7c930967-e889-4e05-a307-7469bb934ddc",
        "journeyStatusId": 9,
        "journeyStatusName": "Journey Completed",
        "startTime": "2026-08-14T09:00:00.000Z",
        "endTime": "2026-08-14T11:00:00.000Z",
        "fare": "3500.00"
      },
      "shipper": {
        "userUniqueId": "1f2b-…",
        "fullName": "Marta Bekele",
        "phoneNumber": "+251911111111",
        "shippableItemName": "Fertilizer",
        "shippableItemQtyInQuintal": "25.000",
        "originPlace": "Addis Ababa",
        "destinationPlace": "Bahir Dar",
        "shippingDate": null,
        "deliveryDate": "2026-08-15T10:00:00.000Z"
      },
      "driver": {
        "userUniqueId": "8a4c-…",
        "fullName": "Tadesse Alemu",
        "phoneNumber": "+251922222222"
      },
      "deliveryConfirmation": null,
      "podStatus": "NONE",
      "hasPod": false
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalItems": 21,
    "limit": 20
  }
}
```

- `deliveryConfirmation` = `null` when there is no POD (`hasPod: false`,
  `podStatus: "NONE"`). When present it carries `deliveryConfirmationUniqueId`,
  `deliveryConfirmationStatus`, `confirmedByUserUniqueId`, `confirmedAt`.

## Use-case quick reference

| Want… | Call |
|---|---|
| My un-proofed deliveries (driver) | `?userUniqueId=self&podStatus=NONE` |
| My deliveries by status (shipper) | `?userUniqueId=self&podStatus=PENDING` |
| Everything (admin) | `?page=1&limit=100` |
| One driver's proofed deliveries (admin) | `?ownerUserUniqueId=<uuid>&podStatus=CONFIRMED` |
| Company's outstanding deliveries | same endpoint — scoped automatically |

## Errors

| Code | Meaning |
|---|---|
| `400` | `podStatus` not one of `NONE/PENDING/CONFIRMED/DISPUTED`, or a listed UUID isn't a GUID. |
| `401` | Missing/invalid token. |
| `403` | Wrong role for the requested scope. |