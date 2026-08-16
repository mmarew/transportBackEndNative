# POST /api/deliveryConfirmations — Create a Proof of Delivery (POD)

The **driver submits proof of delivery** for a completed journey: goods
quantity/condition, **at least one proof photo (required)**, GPS, receiver
identity, and optionally the receiver's on-road signature. The record is created
as **PENDING**, so the shipper can review and sign it. **One POD per journey** —
idempotent: a second create for the same journey returns the existing record
(`message: "A delivery confirmation already exists…"`, `isExisting: true`)
instead of an error.

## Request

**Method:** POST
**Auth:** Bearer token (required) — `Authorization: Bearer <token>`
**Content-Type:** `multipart/form-data` (text fields arrive as strings; photos
are optional file uploads)

```http
POST {{url}}/api/deliveryConfirmations
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

## How the driver creates a POD (step by step)

1. The journey is **completed** (journey status).
2. Driver calls this endpoint with the journey id + evidence → gets a
   **PENDING** confirmation; if one already exists the response returns the
   existing record with `isExisting: true` (idempotent — no error).
3. Shippers are notified automatically (`"POD submitted."` push + FCM).
4. Driver (Tier A, optional): `POST /api/deliveryConfirmations/<id>/request-sign-otp`
   → OTP goes to the receiver's phone → driver sends the receiver signature +
   OTP via `PUT /api/deliveryConfirmations/<id>`.
5. Shipper reviews and signs (`PUT … status: CONFIRMED`).

*(Alternative — **shipper-direct POD**: the shipper submits
`status: CONFIRMED` + `shipperSignature` themselves. Skip steps 2–5; only the
journey's shipper is allowed.)*

## Form-data fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `journeyUniqueId` | string | yes | GUID of the completed journey. |
| `receiverUserUniqueId` | string | pick one | Reuse an existing receiver user. Conflicts with `receiverPhoneNumber`. |
| `receiverPhoneNumber` | string | pick one | 10–20 digits (`+`, spaces, `-` ok). A new receiver user is auto-created. |
| `receiverFullName` | string | with phone | Required together with `receiverPhoneNumber`. |
| `receiverEmail` | string | no | Optional, for a new receiver. |
| `deliveredQuantity` | number | no | Actual delivered amount, min 0. |
| `quantityUnit` | string | no | `quintal`, `kg`, or `piece`. |
| `condition` | string | no | `GOOD` (default), `DAMAGED`, or `PARTIAL`. |
| `receiverSignature` | string | no | PNG base64 (data URI) of the receiver's on-road signature (Tier A). |
| `shipperSignature` | string | no | For **shipper-direct** only (with `status: CONFIRMED`). |
| `status` | string | no | `CONFIRMED` = shipper self-confirmation. Ignored for non-shippers. |
| `notes` | string | no | Free text. |
| `latitude` / `longitude` | number | no | GPS when captured (driver submit). |
| `photos` | file array | no | Up to 10 evidence photos (`photos` field). Legacy single `photo` still accepted. |
| `photo` | file | no | Legacy single photo field. |

## Sample (driver creating a PENDING POD — no photos)

```
journeyUniqueId=7c930967-e889-4e05-a307-7469bb934ddc
receiverPhoneNumber=+251911234567
receiverFullName=Abebe Kebede
deliveredQuantity=25
quantityUnit=quintal
condition=GOOD
latitude=9.0108
longitude=38.7612
```

`200 OK`

```json
{
  "message": "Delivery confirmation created successfully",
  "data": {
    "deliveryConfirmationUniqueId": "5d3f-…",
    "journeyUniqueId": "7c930967-e889-4e05-a307-7469bb934ddc",
    "receiverUserUniqueId": "b2e4-…",
    "deliveryConfirmationStatus": "PENDING",
    "deliveryConfirmationPhotoUrl": null,
    "deliveryConfirmationPhotos": [],
    "deliveryConfirmationSubmittedAt": "2026-08-15T14:00:00.000Z"
  }
}
```

## Shipper-direct (shipper submits & self-confirms in one call)

Same endpoint, with

```
status=CONFIRMED
shipperSignature=<png base64>
```

The shipper becomes the receiver of record. No photo/GPS required. The journey's
driver is notified (`"POD confirmed."`) so their POD gate clears.

## Errors

| Code | Meaning |
|---|---|
| `400` | Missing/unknown receiver combo, bad GUID, invalid unit/condition, or shipper-direct on a journey that isn't completed / without a shipper signature. |
| `401` | Missing/invalid token. |
| `403` | Non-shipper tried `status: CONFIRMED` (shipper-direct). |
| `404` | Journey not found. |
| `200` with `isExisting: true` | A POD already exists for this journey — the existing record was returned as-is (idempotent); if PENDING, review/sign it via `PUT /api/deliveryConfirmations/<id>`. |