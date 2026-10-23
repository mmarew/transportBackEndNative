# API Technical Specifications — TDD / LLD

Low-level technical design documentation for the **Transport Management System
API v1.0.0** (Node.js 20+ / Express 5 / MySQL / Redis / Socket.IO).

## Documents

| Document | Contents |
|---|---|
| [`endpoints.md`](endpoints.md) | Complete route inventory — **208 routes / 289 operations**, probe-validated, auth column per route |
| [`api-conventions.md`](api-conventions.md) | Transport, success/error envelopes, validation (Joi), pagination & sorting, identifiers, rate limits, idempotency |
| [`auth-and-security.md`](auth-and-security.md) | Registration → OTP → JWT flow, 12 roles, public surface, request pipeline, hardening (helmet/CORS/CSRF/limits/fail-closed checks) |
| [`data-model.md`](data-model.md) | **104 MySQL tables** grouped by domain, key relations, naming/audit conventions |
| [`journey-status-machine.md`](journey-status-machine.md) | The 20 journey statuses, status classes, individual/company flows, reconciliation rules |
| [`socket-events.md`](socket-events.md) | Socket.IO protocol: handshake auth, queue rooms, location + notification events |
| [`examples/`](examples/) | Six live-captured request/response examples (redacted) |

## Quick facts

- Base URLs: production `https://app.dynamicsroute.tech`, staging
  `https://dev.dynamicsroute.tech`.
- Auth: `Authorization: Bearer <JWT>` (24h lifetime) on all but 17 public
  endpoints.
- Envelope: success `{ message, ... }`; error
  `{ status: "fail", message, error: { statusCode, status, isOperational } }`
  with `stack` only in development.
- Core domain: shipper requests moving through a 20-step journey status machine,
  individual driver bidding and company-target batch dispatch, driver dispatch
  queue, fleet/company management, SantimPay deposits and commissions.
- All status transitions and money movements are executed server-side inside DB
  transactions with history/audit tables for every mutation.
