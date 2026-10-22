# INSA "Add Asset" — Form Values

Copy-paste values for the Add Asset form.

## General Asset Information

| Field             | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| **Name**          | `transport`                                                  |
| **Asset Type**    | `API`                                                        |
| **Asset Code**    | `TRANSPORT-API-001`                                          |
| **Asset Version** | `1.0.0`                                                      |
| **CPE**           | _(optional — leave empty; this asset is not a national CPE)_ |
| **Asset Detail**  | see below                                                    |

## Asset Detail (paste into the description field)

```
Transport Management System Backend API — a RESTful + WebSocket backend that powers a
freight/transport management platform (shipper requests, driver dispatch, company fleet
operations, and payments) for web and mobile clients.

Scope and functions:
- User management: registration, phone/email OTP verification, JWT login (24h token),
  roles and permissions (12 platform roles), profile and account management.
- Shipper request lifecycle: shippers create transport requests; requests progress
  through a 20-step journey status machine (created -> assigned -> driver arriving ->
  pickup -> in-transit -> delivered / cancelled) with server-side transition validation.
- Dispatch modes: individual driver assignment and company-target bidding (companies
  bid, shippers award, assignments can be replaced/confirmed/cancelled).
- Real-time layer: Socket.IO with Redis adapter — live driver location updates,
  queue presence, and in-app messaging.
- Company operations: company registration/approval, memberships and company roles,
  fleet (vehicles) management, bids and assignments.
- Driver queue: opt-in/opt-out queueing, FIFO dispatch, entry/exit management.
- Finance: deposit flows, SantimPay payment webhook, transaction records.
- Document and media handling: upload/verification of transport documents, images
  (Multer + Sharp), secure static file serving.
- Platform ops: health/database checks, admin table maintenance, caching, logging
  (Winston), rate limiting, helmet security headers, structured error responses.

Technical profile:
- Architecture: Node.js 20+ / Express 5 REST API with MySQL (mysql2) persistence
  (103 tables), Redis for caching and Socket.IO scaling, Firebase Cloud Messaging
  for push notifications.
- Security: bcrypt/argon password hashing, JWT bearer auth with fail-closed
  production safety checks, OTP flows, CORS allow-list, CSRF origin checks for
  cookie sessions, request rate limiting (global + per-auth-route), scanner-bot
  blocking, request validation (Joi), stack traces masked in production.
- API surface: 204 distinct routes / 285 operations; 17 public endpoints
  (registration, login, OTP, health, payment webhook), all others JWT-protected.
- Environments: production https://app.dynamicsroute.tech, staging
  https://dev.dynamicsroute.tech; deployed under PM2 behind Nginx with HTTPS.
- Observability: request IDs, request logging, structured logs, health probes.
```

## Document uploads

| Upload field                                          | File to attach                             | Location after build                                 |
| ----------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| Request/Response File (ZIP)                           | `RequestResponse.zip`                      | `docs/INSA/RequestResponse.zip`                      |
| API Requirements Documentation (SRS) (PDF)            | `SRS.pdf`                                  | `docs/INSA/SRS.pdf`                                  |
| API System & Architecture Design Document (SDD) (PDF) | `SDD.pdf`                                  | `docs/INSA/SDD.pdf`                                  |
| API Technical Specifications (TDD / LLD) (ZIP)        | `API-Technical-Specifications-TDD-LLD.zip` | `docs/INSA/API-Technical-Specifications-TDD-LLD.zip` |

Submit with the **Add Asset** button (bottom right).
