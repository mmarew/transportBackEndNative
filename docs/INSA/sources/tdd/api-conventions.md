# API Conventions (TDD / LLD)

Transport Management System API v1.0.0 — cross-cutting technical conventions.

## 1. Transport

- Protocol: HTTP/1.1 over TLS (production: `https://app.dynamicsroute.tech`,
  staging: `https://dev.dynamicsroute.tech`).
- Base path: every business route is rooted at `/api/<segment>`
  (e.g. `/api/user`, `/api/company`, `/api/finance`, `/api/queue`,
  `/api/vehicle`). A small number of utility routes are mounted at `/`
  (root health, SMS sender, vehicle status types).
- Content type: `application/json; charset=utf-8` for request and response bodies.
  File upload endpoints accept `multipart/form-data`.
- Server runtime: Node.js >= 20, Express 5, PM2 process manager.
- Full route table: [`endpoints.md`](endpoints.md) (204 routes / 285 operations).

## 2. Success envelope

Handlers return through `ServerResponder` (`Utils/ServerResponder.js`):

```json
{
  "message": "User logged in successfully",
  "token": "<JWT>",
  "user": { "userUniqueId": "...", "roleId": 1 }
}
```

Minimum contract: a `message` field; remaining fields are resource-specific and
spread at the top level (or under a named key such as `data`, `user`,
`shipperRequests`). If a `status` field is present it is `"success"`.

## 3. Error envelope

All thrown errors flow to `Middleware/GlobalErrorHandler.js` and are rendered as:

```json
{
  "status": "fail",
  "message": "Validation failed",
  "error": {
    "statusCode": 400,
    "status": "fail",
    "isOperational": true
  },
  "stack": "Error: ...\n    at ..."
}
```

- `stack` is sent **only in development**. In production, `5xx` responses are
  masked to a generic message (details are logged server-side only); `4xx`
  messages are preserved because they are actionable for clients.
- Status codes follow `Utils/Constants.js` `HTTP_STATUS`:
  `400` validation / bad request, `401` missing or invalid token,
  `403` forbidden, `404` not found, `409` conflict, `429` rate limited, `5xx` server.
- `AppError` (`Utils/AppError.js`) is the canonical error type; services raise it
  with an HTTP status constant, the global handler serializes it.

## 4. Request validation

- Validation middleware: `Middleware/Validator.js` — Joi schemas, per route,
  applied to `body` (default), `query`, or `params`.
- `abortEarly: false` (all violations reported), `allowUnknown: true`,
  `stripUnknown: true` (unknown fields are dropped, not rejected).
- Empty JSON body on `POST` is rejected with
  `400 Request body cannot be empty for POST requests to <path>`.
- Validation failures return `400` with an optional structured payload:
  `{ message, code: "VALIDATION_ERROR", details: [{ field, message }] }`.

## 5. Pagination and sorting

List endpoints share one query-builder contract (see
`Services/ShipperRequest/read/simple.service.js` for the reference
implementation):

| Query parameter | Meaning | Default |
|---|---|---|
| `page` | 1-based page number | `1` |
| `limit` | page size | server default |
| `sortBy` | column to sort by | endpoint-specific |
| `sortOrder` / `order` | `ASC` / `DESC` | `DESC` |

Shipper-request listing defaults to a **connected-first ordering**: rows that have
a supporting `JourneyDecision` (driver already connected) sort before unconnected
rows, then by `shipperRequestId DESC`. Explicit `sortBy` always overrides the
default.

List responses report at minimum the row set plus total counts so clients can
render page controls.

## 6. Identifiers

- Business keys are UUID strings
  (`userUniqueId`, `shipperRequestUniqueId`, `vehicleUniqueId`, …).
- Legacy/monotonic numeric ids also exist (`userId`, `journeyStatusId`,
  `roleId`); numeric ids are used inside the status maps, UUIDs in routes and
  payloads. Routes accept the identifier shown in `endpoints.md` (`:param`).
- Timestamps are local-time strings formatted by `Utils/CurrentDate.js`.

## 7. Correlation, logging, limits

- Every request gets a request id (`Middleware/RequestId.js`) which is logged
  with method, path, status and duration (`Middleware/RequestLogger.js`).
- Global rate limiter on all routes plus a stricter limiter on
  `/api/user` auth routes (login/OTP) — `429` when exceeded.
- Body size limit: 1 MB (`express.json` / `urlencoded`), tuned for base64
  signature images from React Native.
- Security headers via `helmet`; CORS via an explicit origin allow-list
  (`Config/AllowedOrigins.js`); bot/scanner UA blocking
  (`Middleware/ScannerBlock.js`).

## 8. Real-time channel

WebSocket traffic (Socket.IO, path `/socket.io`) follows a separate contract —
see [`socket-events.md`](socket-events.md).

## 9. Idempotency and side effects

- Payment completion is webhook-driven (`POST /api/finance/userDeposit/santimPay/webhook`)
  and must be treated as idempotent by clients (the provider retries).
- Status transitions of a shipper request are executed server-side inside DB
  transactions (`Utils/DatabaseTransaction.js`); clients never write
  `journeyStatusId` directly — they call action endpoints (accept, reject,
  cancel, confirm-delivery, loading stage) and the service derives the new state
  (see [`journey-status-machine.md`](journey-status-machine.md)).
