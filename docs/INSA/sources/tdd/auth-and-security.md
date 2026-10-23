# Authentication & Security (TDD / LLD)

Transport Management System API v1.0.0.

## 1. Authentication flow

```
register ──> verify email/phone ──> login (password) ──> OTP verification ──> UserSessions row ──> JWT (24h, carries sid)
   │                                                                                          │
   └────────────────────  POST /api/user/createUser                                           │
         GET/POST /api/user/verify-email, /verify-phone                                       │
         POST /api/user/loginUser  ── returns OTP by SMS/email                                │
         POST /api/user/verifyUserByOTP ── creates the session and returns token  <───────────┘
```

1. **Registration** — `POST /api/user/createUser` creates the `Users` row and a
   `usersCredential` row (hashed password) plus the `UserRole` mapping
   (role from `roleList`: shipper, driver, …).
2. **Identity verification** — `verify-email` / `verify-phone` (also
   `report-wrong-email`) confirm contact details via OTP codes delivered by
   e-mail (nodemailer) or SMS (`SMSSender` routes).
3. **Login** — `POST /api/user/loginUser` verifies the bcrypt/argon password
   hash and dispatches an OTP (test mode returns `101010`).
4. **OTP verification** — `POST /api/user/verifyUserByOTP` validates the OTP,
   inserts one `UserSessions` row for the device (platform, app version, locale,
   IP, first/last-seen timestamps) and issues a JWT whose `sid` claim is that
   row's `sessionUniqueId`. The same happens on the phone/email verification and
   self-update login paths.
5. **Logout** — `POST /api/user/logout` revokes the `UserSessions` row named by
   the token's `sid` and clears the auth cookie. Logout is idempotent: an
   already-revoked or malformed token still clears the cookie and returns `200`.
6. **Forced logout** — a phone-number change revokes every session of that user
   and emits the typed notification `force_logout_phone_change`. Administrators
   can revoke all sessions of a user with
   `DELETE /api/admin/users/:userUniqueId/sessions`.

## 2. JWT

- Signed bearer token, lifetime **24 hours**.
- Payload (decoded):

```json
{
  "userUniqueId": "<uuid>",
  "fullName": "…",
  "phoneNumber": "+251…",
  "roleId": 1,
  "sid": "<UserSessions.sessionUniqueId>",
  "iat": 1640995200,
  "exp": 1641081600
}
```

- Sent as `Authorization: Bearer <token>` on every protected call.
- Verification: `Middleware/VerifyToken.js` (`verifyTokenOfAxios`, plus
  `jwtOrApiKey` variants that also accept an `x-api-key` for E2E bootstrapping).
  Every verified token must also resolve to a **live** `UserSessions` row:
  a token without `sid`, or whose session is revoked/expired, is rejected.
  Last-seen timestamps are refreshed at most once per hour per session.
- Failure modes: missing/invalid/revoked token →
  `401 { "status":"fail", "message":"Invalid token", … }`; expired token →
  `401` with an expiry message.

## 3. Authorization / roles

Roles are seeded in `Roles` and mapped per user in `UserRole`
(`Utils/ListOfSeedData.js` → `usersRoles`, 12 roles):

| id | Role | id | Role |
|---:|---|---:|---|
| 1 | shipper | 7 | company admin |
| 2 | driver | 8 | company (entity role) |
| 3 | admin | 9 | vehicle (entity role) |
| 4 | vehicle owner | 10 | dispatcher (company) |
| 5 | system | 11 | queue organization admin |
| 6 | super admin | 12 | queue dispatcher |

Additional access layers:

- **Company scoping** — company users only see their company's
  memberships/fleet/bids/assignments (`/api/company/*`).
- **Ownership checks** — services verify the resource belongs to the caller
  (e.g. `ResolveDocumentOwner`, `AuthorizeDocumentAccess`).
- **Role status machine** — `UserRoleStatusCurrent` / `UserRoleStatusHistory`
  track active/suspended state per role assignment.

## 4. Public surface (no token)

17 of 289 operations are public (probe-verified, see `endpoints.md` [P] rows):
registration/verification/login/OTP/logout, `GET /api/health`,
`GET /api/health/database`, the SantimPay webhook
(`POST /api/finance/userDeposit/santimPay/webhook`), and a small set of
maintenance endpoints (`/api/admin/database/stats`, `/api/utils/clear-cache`,
`POST /api/admin/createTable`, `DELETE /api/admin/dropTables` — auth is
commented out in source and must be network-restricted, `POST /api/admin/userRoleStatus/`).

## 5. Request pipeline (order matters)

`Config/Express.config.js`:

1. `helmet()` — security headers.
2. `cors(corsOptions)` — explicit origin allow-list (`Config/AllowedOrigins.js`).
3. `cookieParser` → `csrfOriginCheck` — Origin/Referer allow-list **only for
   cookie-authenticated** state-changing requests; Bearer clients pass through.
4. `limiter` — global rate limit; stricter `authLimiter` on `/api/user`.
5. request id + request logger.
6. `express.json` / `urlencoded` (1 MB limit).
7. `scannerBlock` — blocks known bot/scanner user agents.
8. static file serving under `/uploads` and `/Assets`.
9. routes (`app.use("/", Routes)`) → `globalErrorHandler`.

## 6. Cryptography & secrets

- Passwords: bcrypt (cost-factored) — never stored or logged in clear.
- OTP codes: short-lived, single-use; SMS delivery via `SMSSender` /
  provider integration.
- JWT secret, DB credentials, payment keys: environment variables (`.env`),
  never committed; the app fails fast when required production secrets are
  missing (fail-closed checks in `App.js`).
- Payment webhook authenticity: SantimPay webhook signature/verification in the
  finance service before crediting `UserDeposit`.

## 7. Platform hardening

- **Rate limiting** — global + auth-specific; `429` responses.
- **CORS allow-list** — no wildcard in production.
- **CSRF (defense in depth)** — cookie sessions additionally require a known
  Origin; state-changing cross-site requests with cookies are rejected `403`.
- **Production safety checks (fail-closed)** — in `NODE_ENV=production` the
  server refuses to boot with development-only configuration (e.g. default
  secrets, debug routes) rather than starting insecurely.
- **Stack masking** — production `5xx` responses never include stack traces;
  everything is logged server-side with request ids for correlation.
- **Helmet**, **bot blocking**, **1 MB body limit**, **parameterized SQL**
  everywhere (`mysql2` prepared statements), **transactions** for multi-step
  writes (`Utils/DatabaseTransaction.js`).
- **File upload hygiene** — Multer limits + Sharp re-encoding of images,
  document type checks (`CheckDocumentTypeExists`, `CheckDuplicateDocuments`).

## 8. Session registry and device management

`UserSessions` is the server-side source of truth for "who is still signed in".

| Column | Purpose |
|---|---|
| `sessionUniqueId` | UUID placed in the JWT as `sid`; the revocation handle |
| `userUniqueId` | Owner (`ON DELETE CASCADE` from `Users`) |
| `platform`, `deviceName`, `deviceModel`, `appVersion`, `locale` | Device label shown in the UI, filled from `X-Client-*` headers |
| `ipAddress`, `userAgent` | Audit metadata captured at creation |
| `sessionCreatedAt`, `lastSeenAt`, `sessionUpdatedAt` | First login, throttled activity touch, row update time |
| `expiresAt`, `revokedAt`, `revokeReason` | Expiry and explicit revocation audit trail |

Rules:

- One row per successful login (SMS verification-link tokens are deliberately
  **not** given a session: they are single-purpose links, not logins).
- A token is valid only while its row is unrevoked and unexpired. This makes
  logout and remote device revocation take effect immediately, without waiting
  for the JWT's 24-hour expiry. Revoking a row also disconnects any live
  WebSocket bound to it (`session:<sessionUniqueId>` room), and a revoked token
  is rejected at the next socket handshake.
- Self-service endpoints (JWT required):
  - `GET /api/user/sessions` — active devices; each item has `current: true`
    for the caller's own session.
  - `DELETE /api/user/sessions/:sessionUniqueId` — revoke one device. Revoking
    the current session also clears the cookie (it is a logout).
  - `DELETE /api/user/sessions?keepCurrent=true` — revoke every other device;
    `keepCurrent=false` signs this device out too.
- A retention job (`Services/Session/cleanup.service.js`) deletes expired and
  revoked rows older than the retention window, so the table does not grow
  without bound.
- Rollout note: tokens minted before the registry existed have no `sid` and are
  rejected. Existing users therefore sign in once after deployment; this is
  intentional and is what guarantees old tokens can no longer be replayed.

## 9. Client storage guidance

- Web (`queadmin`, `transportAdmin`, `transportCompany`): the JWT is kept in an
  **httpOnly cookie**; `withCredentials` is enabled and JavaScript never reads
  the token. Active devices are managed from Settings.
- React Native (driver, shipper): JWT in the platform Keychain/Keystore via the
  secure-storage wrapper, sent as `Authorization: Bearer`. Device metadata
  travels in `X-Client-Platform`, `X-Client-Version` and `X-Client-Locale`.
- Refresh: re-login (no refresh-token endpoint in v1.0.0; token lifetime 24h).
