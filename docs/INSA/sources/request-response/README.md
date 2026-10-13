# Request / Response Package

API request/response documentation for the **Transport Management System API v1.0.0**
(Node.js 20+ / Express 5 / MySQL / Socket.IO).

## Contents

| File | Description |
|---|---|
| [`endpoints.md`](endpoints.md) | Complete route inventory — **204 routes / 285 operations**, grouped by API segment, with an auth column per route |
| [`examples/01-login-request-and-response.json`](examples/01-login-request-and-response.json) | `POST /api/user/loginUser` — successful login (request + response) |
| [`examples/02-verify-otp-request-and-response.json`](examples/02-verify-otp-request-and-response.json) | `POST /api/user/verifyUserByOTP` — OTP verification issuing a JWT |
| [`examples/03-list-shipper-requests-response.json`](examples/03-list-shipper-requests-response.json) | `GET /api/user/getShipperRequest4allOrSingleUser` — authenticated list response (first page) |
| [`examples/04-error-401-missing-token.json`](examples/04-error-401-missing-token.json) | `401` — protected route called without / with an invalid bearer token |
| [`examples/05-error-400-empty-body.json`](examples/05-error-400-empty-body.json) | `400` — request validation failure (empty body on a POST) |
| [`examples/06-error-404-unknown-route.json`](examples/06-error-404-unknown-route.json) | `404` — unknown route |

## How the captures were produced

Captured live against a running instance of this API with `curl`-equivalent HTTP
clients. Identifiers, tokens and phone numbers are redacted as `<REDACTED>`; every
status code, header and payload shape is exactly as received. The login/OTP
examples use a seeded test account; the list example is a real first page of data.

## Authentication model

- Public endpoints (17 of 285 — registration, login, OTP verification, health
  checks, payment webhook, maintenance) accept requests without a token.
- All other endpoints require `Authorization: Bearer <JWT>` and answer
  `401 { "status": "fail", "message": "Invalid token" }` otherwise.
- The JWT is returned by `POST /api/user/loginUser` (first factor) and completed by
  `POST /api/user/verifyUserByOTP` (OTP). Lifetime: 24 hours.

## Response conventions (summary)

- **Success:** HTTP `2xx` with a JSON body containing at minimum a `message`
  field, plus resource data (e.g. `{ "message": "...", "data": ... }`).
- **Client/server errors:** HTTP `4xx/5xx` with
  `{ "status": "fail", "message": "...", "error": { "statusCode": ..., "status": "fail", "isOperational": true } }`.
  Stack traces are included in development only; production responses never expose
  internals for `5xx`.
- Requests and responses are JSON (`Content-Type: application/json`) except
  multipart uploads.
- List endpoints support paging (`page`, `limit`) and sorting (`sortBy`); the list
  example shows the envelope of a first page.

Full conventions: `../tdd/api-conventions.md` (in the TDD/LLD package).

## Validation of this inventory

Every route in `endpoints.md` was extracted from the source routers **and then
confirmed by a live preflight probe** against a running server: the route was
called with its real HTTP method (and a deliberately invalid bearer token); only
routes that answered something other than `404` are listed. Routes that answer
`401` are marked **[A]** (authentication required); the remainder are marked
**[P]** (public).
