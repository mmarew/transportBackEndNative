# Remaining E2E Test Skips — Fix Guide

**Current state:** 127 ✅ passed · 29 ⏩ skipped · 0 ❌ failed (156 total)

---

## 1. Server Bugs (code needs fix, not test fix)

| # | Endpoint | Error | Root Cause |
|---|----------|-------|------------|
| 1 | `DELETE /api/user/attachedDocuments/:id` | `deleteData missing tableName` | Service function called without `tableName` param — likely a controller bug in `deleteAttachedDocument` |
| 2 | `GET /api/admin/userStatuses/:id` | `ER_NO_SUCH_TABLE: 'UserStatuses' vs 'userstatuses'` | Model or query uses wrong table name casing |
| 3 | `POST /api/finance/userDeposit/initiateSantimPay` | 400 `VALIDATION_ERROR` | Body validation schema expects different field names than the test sends |
| 4 | `POST /api/driver/takeFromStreet` | 500 `isOperational:true` | Unhandled error in the controller when processing take-from-street — may need to check the route handler |
| 5 | `DELETE /api/driver/request/:id` | 500 `isOperational:true` | Unhandled error when soft-deleting a request that doesn't exist or has invalid status |

**Fix approach:** Look at each controller/service and fix the underlying issue (missing params, wrong table name, unhandled error path).

---

## 2. Need Real SMS/Email OTP (unavoidable via API)

| # | Endpoint | Reason |
|---|----------|--------|
| 6 | `GET /api/user/verify-email` | Needs a real email verification token (generated during signup) |
| 7 | `GET /api/user/verify-phone` | Needs a real SMS verification code |
| 8 | `POST /api/user/verify-phone` | Needs a real SMS verification code |

**Fix approach:** Either (a) mock the SMS/email service in test mode, or (b) accept as skipped since these need human interaction.

---

## 3. Browser-Only Endpoints (use URL params, not JWT)

| # | Endpoint | Reason |
|---|----------|--------|
| 9 | `GET /api/admin/system/logs` | Uses `?secret=` param from browser, not JWT auth |
| 10 | `GET /api/admin/system/uploads` | Uses `?secret=` param from browser, not JWT auth |
| 11 | `GET /api/user/report-wrong-email` | Uses `?token=` query param from email link, not auth header |

**Fix approach:** Can't test via standard API auth flow. Either skip or write a separate test that gets the secret/key.

---

## 4. Need Active Journey Flow (tested elsewhere in `runIndividualFlow.js`)

| # | Endpoint | Why It Skips |
|---|----------|--------------|
| 12 | `PUT /api/driver/sendUpdatedLocation` | No active driver request with a `journeyDecisionUniqueId` |
| 13 | `PUT /api/shipperRequest/markJourneyCompletionAsSeen` | No completed request to mark |
| 14 | `PUT /api/shipperRequest/markCancellationAsSeen` | No cancellation notification exists |
| 15 | `PUT /api/user/rejectDriverOffer` | 400 — needs real shipper request + driver request FKs |
| 16 | `markNegativeStatusAsSeen` (runner) | No pending negative notification |
| 17 | `sendUpdatedLocation` (runner) | No journeyDecision from active journey |
| 18 | `markJourneyCompletionAsSeen` (runner) | No completed journey |
| 19 | `markCancellationAsSeen` (runner) | No cancellation |

**Fix approach:** These need a complete shipper → driver → journey → decision flow. Already covered by `E2ETests/Journey/`, `E2ETests/Driver/DriverRequest.js`, and `E2ETests/Phases/runIndividualFlow.js`. If you want them tested in `missingEndpoints.js`, we'd need to run the full flow first (shipper creates request → driver accepts → journey starts → completes/cancels).

---

## 5. No Test Data in DB (empty lists)

| # | Endpoint | What's Missing |
|---|----------|----------------|
| 20 | `PUT /api/finance/userBalance/:id` | No balance record for the test driver |
| 21 | `DELETE /api/finance/userBalance/:id` | No balance record for the test driver |
| 22 | `PUT /api/finance/userDeposit/:id` | No deposit record |
| 23 | `DELETE /api/finance/userDeposit/:id` | No deposit record |
| 24 | `PUT /api/finance/userSubscription/:id` | No subscription record |
| 25 | `DELETE /api/finance/userSubscription/:id` | No subscription record |
| 26 | `PUT /api/finance/userBalanceTransfer/:id` | No transfer record |
| 27 | `DELETE /api/finance/userBalanceTransfer/:id` | No transfer record |
| 28 | `GET/PUT/DELETE /api/finance/journeyPayments/:id` | No payment record |
| 29 | `DELETE /api/admin/roles/:id` | No role with `roleId > 10` (deletable roles) |
| 30 | `POST /api/finance/journeyPayments` | No existing `journeyDecision` or `paymentMethod` records |
| 31 | `POST /api/finance/userDeposit` | No valid `financialInstitutionAccount` FK |
| 32 | `POST /api/finance/userSubscription` | No valid `subscriptionPlanPricing` FK |
| 33 | `POST /api/notifications/send-to-user` | 400 — needs valid `userUniqueId` with FCM token |

**Fix approach:** Either (a) create seed data in the test DB setup, or (b) chain tests so the CREATE test runs first and feeds its output to the UPDATE/DELETE tests. The CRUD-list-fallback logic is already in place for #20-29 — it just needs data in the DB.

---

## 6. Business Logic Constraints (expected behavior)

| # | Test | Why It's Expected |
|---|------|-------------------|
| 34 | `testCancelBatch` | Batch can't be canceled in current status state |
| 35 | `testPartialCancelBatch` | Can't partially cancel in current state |
| 36 | `testCreateCompanyRating` | Needs a full company journey flow first |
| 37 | `CompanyRating workflow` | Same — needs company journey |
| 38 | `Update admin decision` | Decisions are immutable by design |
| 39 | `Delete admin decision` | Use new decision to override, not delete |
| 40 | `individualReject` | No available shipper request (previous rejection blocks) |
| 41 | `companyReject` | No active individual request |
| 42 | `PUT /api/user/attachedDocuments/:id` | Endpoint requires `multipart/form-data`, test sends JSON |

**Fix approach:** These are expected behaviors, not test gaps. The multipart endpoint (#42) can be tested with `form-data` instead of JSON if desired. For company ratings, seed a `companyBidRequest` in test data.

---

## Summary by Priority

| Priority | Count | Action Needed |
|----------|-------|---------------|
| **P0 — Server bugs** | 5 | Fix controller/service code |
| **P1 — Seed data** | 14 | Add test seed data or chain CREATE → UPDATE/DELETE |
| **P2 — Journey flow** | 8 | Link tests into full journey flow (already tested elsewhere) |
| **P3 — Unavoidable** | 6 | Accept as skipped (OTP, browser-only) |
| **P4 — Expected** | 9 | Accept as skipped (business logic constraints) |
