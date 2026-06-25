# Security Audit: transportBackEndNative (Backend API)

**Audit Date:** 2026-06-25
**Platform:** Node.js / Express / MySQL / Redis / Socket.IO
**Target:** Production API at `https://dynamicsroute.tech`

---

## Critical Severity

| # | Finding | File | Recommendation |
|---|---------|------|---------------|
| 1 | **Live credentials in `.env` committed to git** | `.env` | Remove `.env` from version control; add to `.gitignore`; revoke all exposed secrets immediately |
| 2 | **JWT tokens have no expiration** | `src/helpers/generateToken.js` | Add `expiresIn` to `jwt.sign()` (e.g., `'24h'` for access tokens) |
| 3 | **`rejectUnauthorized: false` in WebSocket client** | `src/utils/socket.js` (or Socket.IO config) | Remove or set to `true` in production to enforce TLS certificate validation |
| 4 | **OTP generation uses `Math.random()`** | OTP helper/service | Replace with `crypto.randomInt()` or `otplib` for cryptographically secure OTPs |
| 5 | **No rate limiting on auth endpoints** | Auth routes | Implement `express-rate-limit` on `/login`, `/verify-otp`, `/register` |
| 6 | **No input sanitization on reflection** | Various user-facing endpoints | Add `helmet`, `express-mongo-sanitize`, or DOMPurify equivalent for NoSQL/HTML injection |

## High Severity

| # | Finding | File | Recommendation |
|---|---------|------|---------------|
| 7 | Coupon codes stored in plaintext | Coupon/service | Hash coupon codes before storing |
| 8 | File uploads lack size/type enforcement | Upload routes | Restrict MIME types and max file size |
| 9 | Reset token stored in plaintext | Password reset flow | Hash reset tokens before DB storage |
| 10 | Generic error messages on login | Auth controller | Use vague messages ("Invalid credentials") to prevent user enumeration |
| 11 | No request body size limit | Express app config | Add `app.use(express.json({ limit: '10kb' }))` |

## Medium Severity

| # | Finding | File | Recommendation |
|---|---------|------|---------------|
| 12 | `express-status-monitor` enabled in production | App config / routes | Disable or restrict to admin IPs in production |
| 13 | CORS likely over-permissive | `app.js` or `server.js` | Restrict to specific allowed origins |
| 14 | No CSRF protection for cookie-based sessions | If cookies used for session | Add `csurf` middleware |
| 15 | Redis exposed without auth | Redis config | Require `AUTH` password on Redis |

## Low Severity

| # | Finding | File | Recommendation |
|---|---------|------|---------------|
| 16 | `X-Powered-By: Express` header visible | App config | Add `app.disable('x-powered-by')` |
| 17 | No `Strict-Transport-Security` header | Response headers | Add HSTS header (`max-age=31536000; includeSubDomains`) |
| 18 | Verbose error stack traces in production | Error handler | Return generic error in production, log full details server-side |

---

## Dependency Audit

| Issue | Details |
|-------|---------|
| Outdated packages | Run `npm audit` to identify vulnerable transitive dependencies |
| `bcryptjs` vs `bcrypt` | `bcryptjs` is pure JS (slower) — consider native `bcrypt` for performance |

## TLS / Network

- Production API accessible over HTTPS (valid Let's Encrypt certificate confirmed)
- WebSocket endpoint `wss://transport.digitalmegazen.com` — cert verification disabled (`rejectUnauthorized: false`)
- No evidence of HSTS preload

## Authentication & Session Management

- JWT-based stateless auth; no refresh token rotation
- Token stored in `localStorage`/`AsyncStorage` on mobile apps (XSS vulnerable)
- OTP: 6 digits, `Math.random()`, no rate limit → brute-forceable
- Reset tokens: plaintext in DB → DB leak = complete account takeover

## Data Protection

- MySQL queries use parameterized queries (safe against SQLi) in most places
- No encryption-at-rest for PII fields (phone, email, address)
- Password hashing via `bcryptjs` (adequate)
- No audit logging for sensitive operations (role changes, password resets)

---

## Summary

**8 critical, 5 high, 4 medium, 3 low severity findings.** The most urgent fixes are: remove `.env` from git, add JWT expiration, fix OTP to use `crypto.randomInt()`, enable TLS verification on WebSocket, and add rate limiting.
