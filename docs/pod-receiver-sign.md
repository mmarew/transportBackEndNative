# PUT /api/deliveryConfirmations/:id — Driver confirms with receiver OTP (Tier A)

Allows the assigned journey driver to settle a PENDING delivery confirmation
after the receiver shares the one-time OTP sent to their phone.

## Request

**Method:** PUT
**Auth:** Bearer token (required) — `Authorization: Bearer <token>`
**Content-Type:** `multipart/form-data` (or `application/json` — the same fields work either way). In multipart requests, `shipperSignature` may be a PNG/JPEG image file or a base64 data-URL text field.

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
2. **The driver confirms delivery** here using the receiver's code:
   ```
   status=CONFIRMED
   otpCode=101010
   shipperSignature=<PNG/JPEG file or base64 data URL>
   ```
   The driver must also provide the required shipper signature and any missing
   settle evidence. A valid receiver OTP is required for a driver to confirm.

## Body fields (for this step)

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | yes | Must be `CONFIRMED` when the assigned driver settles. |
| `otpCode` | string | yes for driver | 6 digits; must match the code sent to the receiver. |
| `shipperSignature` | image file or string | yes for settle | Upload a PNG/JPEG file using the `shipperSignature` field, or send a base64 data URL (max ~2 MB). Do not send both. |
| *(optional)* `notes`, `deliveredQuantity`, `quantityUnit`, `condition`, `latitude`, `longitude`, `photo(s)`, `statement` | – | no | Additional settle evidence. |

Only specify what you're changing; the update is partial.

## Sample — success (`200 OK`)

```
status=CONFIRMED
otpCode=101010
shipperSignature=data:image/png;base64,iVBORw0KG…
```

With multipart form data, add `shipperSignature` as a PNG or JPEG file instead
of entering the data URL as text.

```json
{
  "message": "Delivery confirmation updated successfully",
  "data": {
    "deliveryConfirmationUniqueId": "5d3f-…",
    "status": "CONFIRMED",
    "otpCode": "101010",
    "shipperSignature": "data:image/png;base64,iVBORw0KG…"
  }
}
```

After this, `GET /api/deliveryConfirmations?journeyUniqueId=…` shows the
confirmation as `CONFIRMED`.

## Errors

| Code | Meaning |
|---|---|
| `400` | OTP never requested in production, invalid code (attempt counter increments and caps at N tries), or the confirmation isn't PENDING. |
| `410` | OTP expired (time-limited). Request a new one. |
| `429` | Already an active code, or the per-phone hourly request cap is reached. |

Security: the OTP is bcrypt-hashed, time-limited, and capped on attempts.
`101010` is only accepted outside production.