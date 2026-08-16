# PUT /api/deliveryConfirmations/:id — Receiver signs on the driver's device (Tier A)

Binds the **on-road receiver signature** to a PENDING delivery confirmation
using a one-time OTP sent to the receiver's phone. This is the driver-app step
right after creating the POD: the receiver has received the goods and signs on
the driver's device.

## Request

**Method:** PUT
**Auth:** Bearer token (required) — `Authorization: Bearer <token>`
**Content-Type:** `multipart/form-data` (or `application/json` — the same fields work either way)

```http
PUT {{url}}/api/deliveryConfirmations/<deliveryConfirmationUniqueId>
Authorization: Bearer <token>
```

## Step by step

1. **Request the code** (normally first — one active code at a time):
   `POST /api/deliveryConfirmations/<id>/request-sign-otp`
   → the receiver's phone gets a 6-digit code (OTP). *(Dev/test: no SMS is sent;
   URL-code step 2 below also accepts the fixed code `101010` even if you skip
   this request entirely. Production always requires it.)*
2. **Send the signature + code** here:
   ```
   otpCode=101010
   receiverSignature=<png base64 data URI>
   ```
   → the receiver signature is stored and timestamped
   (`deliveryConfirmationReceiverSignedAt`) — **once set, it is never
   overwritten**.
3. **Shipper finishes it**: `PUT /api/deliveryConfirmations/<id>`
   `{ status: "CONFIRMED", shipperSignature }` — settles the POD.

## Body fields (for this step)

| Field | Type | Required | Notes |
|---|---|---|---|
| `otpCode` | string | yes for Tier A | 6 digits (`^\d{6}$`). Must match the requested code. |
| `receiverSignature` | string | yes | PNG base64 data URI (max ~2 MB). |
| *(optional)* `notes`, `deliveredQuantity`, `quantityUnit`, `condition`, `latitude`, `longitude`, `photo(s)` | – | no | Can be padded here instead of at create. |
| *(optional)* `status`, `shipperSignature`, `statement` | – | no | Settle/review fields — shipper/admin only. |

Only specify what you're changing; the update is partial.

## Sample — success (`200 OK`)

```
otpCode=101010
receiverSignature=data:image/png;base64,iVBORw0KG…
```

```json
{
  "message": "Delivery confirmation updated successfully",
  "data": {
    "deliveryConfirmationUniqueId": "5d3f-…",
    "otpCode": "101010",
    "receiverSignature": "data:image/png;base64,iVBORw0KG…"
  }
}
```

After this, `GET /api/deliveryConfirmations?journeyUniqueId=…` shows
`deliveryConfirmationReceiverSignature` + a non-null
`deliveryConfirmationReceiverSignedAt`.

## Errors

| Code | Meaning |
|---|---|
| `400` | OTP never requested, invalid code (attempt counter increments and caps at N tries), already verified, or the confirmation isn't PENDING. |
| `410` | OTP expired (time-limited). Request a new one. |
| `429` | Already an active code, or the per-phone hourly request cap is reached. |

Security: the OTP is bcrypt-hashed, time-limited, capped on attempts; the
receiver signature is stored with an immutable timestamp so it can't be
re-signed later. `101010` is only accepted outside production.