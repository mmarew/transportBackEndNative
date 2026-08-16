# Delivery Confirmation — Flow Runbook (who signs, where, when)

> Focussed companion to `proof-of-delivery-pod.md`. It answers: _who creates the
> OTP? who signs on which device? when is it CONFIRMED? who is recorded as the
> confirmer?_ Status mirrors `Services/DeliveryConfirmation.service.js`.

## Actors

| Actor        | Device                 | What they do                                                                                  |
| ------------ | ---------------------- | --------------------------------------------------------------------------------------------- |
| **Driver**   | driver app             | Submits the proof (evidence + photo + GPS), triggers OTP, may capture a signature on the road |
| **Receiver** | physically at drop-off | Signs**on the driver's device** (Tier A) after entering the OTP from their phone              |
| **Shipper**  | own phone              | Reviews the record and settles (**Tier B**) — or submits a POD directly                       |

Key separation enforced in the code:

- **OTP is created by the system, not the driver.** The driver only _requests_ it:
  `POST /:id/request-sign-otp` → random 6-digit code → bcrypt hash stored on the
  record → SMS to the receiver's phone. The driver never sees the real code.
  _(Dev/test: SMS is stubbed, the code is the fixed `101010` — accepted even if
  no request was made, so Postman flows skip `request-sign-otp`.)_
- **Signing identity ≠ settling identity.** The signature column
  (`receiverSignature` / `shipperSignature`) is _evidence of who was present_.
  `confirmedByUserUniqueId` is simply _the account that issued the PUT that set
  `status=CONFIRMED`_. They need not be the same person.

## The states

```
PENDING ──► CONFIRMED      (settle: signature + completed journey + hash; photo + GPS required at submit)
   │   └──► DISPUTED       (notes = reason)
   └──────────► CONFIRMED  (admin only, from DISPUTED — new hash, old preserved)
```

Settle rules (`updateDeliveryConfirmation`): one of `receiverSignature` or
`shipperSignature` must exist (line 827), and the journey must be completed
(line 859). SHA-256 hash is written once at settle; signed fields are immutable
afterwards (admin amendments write a new hash, previous hash preserved).

**Photo + GPS are validated at SUBMIT only.** A driver-initiated (PENDING) create
returns `400` without ≥1 proof photo ("At least one proof photo is required to
submit a delivery confirmation") and without GPS ("GPS coordinates are required
to submit a delivery confirmation"). The settle step (`PUT status=CONFIRMED`)
does **not** re-check photos or GPS — the record already carries them — so the
shipper is **never asked to submit GPS**; a photo-less/GPS-less legacy row still
settles. Shipper-direct (CONFIRMED create) remains photo/GPS-optional — the
shipper may be off-site.

## Flow 1 — Standard: driver submits, receiver signs on driver device, shipper settles (recommended)

```
Driver                          Backend                        Shipper
  │ POST /deliveryConfirmations  │
  │  (photos REQUIRED, qty, condition, GPS) ─► 200 PENDING
  │                                │
  │ POST /:id/request-sign-otp   ──► system creates OTP → SMS to receiver's phone
  │                                │        (bcrypt hash stored; never shown to driver)
  │ PUT /:id otpCode + receiverSignature ─► stamps receiverSignature + receiverSignedAt
  │                                 │          (immutable once set, still PENDING)
  │                                 │
  │                                 │◄── GET /deliveryConfirmations?journeyUniqueId=…
  │                                 │──► review evidence (photos, qty, GPS, statement)
  │                                 │◄── PUT /:id { status:"CONFIRMED", shipperSignature }
  │                                 │──► validate → hash → CONFIRMED · confirmedBy=shipper
  │◄── socket "POD confirmed." ──── │      → driver's POD gate clears
```

Notes:

- The signature on the driver's device (`receiverSignature`, Tier A) does **not**
  settle anything by itself — it only binds receiver acceptance with a timestamps.
- The shipper finishing on their own device is the _designed_ audit path: the
  record names the shipper's account as the confirmer (`confirmedByUserUniqueId`).
- If the driver never captures a receiver signature, the shipper's own
  `shipperSignature` at settle satisfies the signature requirement alone.

## Flow 2 — Shipper-direct: shipper submits the POD from their own device

```
Shipper (their own phone, on-site at the drop-off)
  │ POST /deliveryConfirmations  { journeyUniqueId, status:"CONFIRMED", shipperSignature, … }
  │      (photos optional, GPS optional — shipper may not be at the exact geo point)
  │──► verified: caller == journey's shipper (403 else) · journey completed (400)
  │──► inserted already CONFIRMED with hash · receiver defaults to the shipper
  │──► driver notified via socket/FCM ("POD confirmed.")
```

Idempotent + fast-forward rule: if the **driver already created** a PENDING record
for this journey, the shipper's self-confirm POST **settles that existing record**
in the same call (signature/hash/confirmedBy written) instead of creating a second
one — "if the driver created it, let the shipper update it". Already-CONFIRMED or
DISPUTED records are returned as-is (`isExisting: true`) untouched.

Triggered from the shipper app's "Submit proof of delivery" panel. No OTP, no
second step — the shipper's authenticated session is the identity binding, and
`confirmedByUserUniqueId` = the shipper.

## Flow 3 — Shipper signs on the driver's device (edge case)

The shipper is physically present with the driver at drop-off and signs the pad.

```
Two legal options (backend enforces neither — both are allowed):
  a) Driver PUT /:id { shipperSignature }            → evidence bound, stays PENDING
     then shipper PUT /:id { status:"CONFIRMED" }    → settled by the shipper's account
  b) Driver PUT /:id { status:"CONFIRMED", shipperSignature }  → settled immediately,
     but confirmedBy = the DRIVER's account (the account that issued the settling PUT)
```

- Option (a) keeps the audit trail "confirmed by the shipper" — recommended if
  the shipper account should name the confirmer.
- Option (b) is allowed by the backend today (no role check blocks a driver from
  settling), but `confirmedByUserUniqueId` will name the driver.
- If we want (b) blocked (or (a) required) for roles, that's a one-line policy
  guard we have _not_ added yet — say the word.

## Querying: which deliveries have / lack a POD

`GET /api/journey/pod-status` (mandatory static route registered before
`/api/journey/:journeyUniqueId`) — deliveries with their POD state:

| Filter                | Meaning                                      |
| --------------------- | -------------------------------------------- |
| `podStatus=NONE`      | journey has**no** confirmation (not proofed) |
| `podStatus=PENDING`   | proofed, awaiting settle                     |
| `podStatus=CONFIRMED` | settled                                      |
| `podStatus=DISPUTED`  | disputed                                     |
| `ownerUserUniqueId`   | admin scope-down to one shipper              |
| `fromDate` / `toDate` | journey-date range                           |
| `page` / `limit`      | pagination (limit max 100)                   |

Scoping is server-side: admin(3/6) sees all, driver saw own, shipper/sub (1) own,
company admin(7)/dispatcher(10) own company's shipments; any other role → empty.
Response rows carry `{ journey, shipper, driver, deliveryConfirmation, podStatus, hasPod }`.

## Signature columns at a glance

| Column                                                       | Set by                                                            | When                   | Who signs                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------- | ------------------------------- |
| `deliveryConfirmationReceiverSignature` + `ReceiverSignedAt` | driver-device PUT with`receiverSignature` (Tier A)                | on-road, pre-settle    | receiver (verified by OTP)      |
| `deliveryConfirmationShipperSignature` + `ShipperSignedAt`   | shipper app PUT (Tier B) or shipper-direct POST                   | settle / direct submit | shipper (authenticated session) |
| `confirmedByUserUniqueId` + `ConfirmedAt`                    | whatever account issues the PUT/POST that lands`status=CONFIRMED` | settle                 | audit, not a signature          |

## OTP lifecycle

```
request-sign-otp → random 6-digit → bcrypt `deliveryConfirmationOtpHash`
  · one active code at a time (resend → 429)
  · expiry → 410 GONE
  · 5 bad attempts → invalidated (400)
  · per-phone hourly cap (5/h)
PU T with otpCode:
  · bcrypt compare (or dev `101010`, which even skips the request step in dev)
  · success stamps `deliveryConfirmationOtpVerifiedAt`
```
