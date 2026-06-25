/**
 * @fileoverview Delinquency → Ban Dispute Lifecycle Documentation
 * ═══════════════════════════════════════════════════════════════
 *
 * This file documents the complete lifecycle of a company delinquency dispute,
 * from initial accusation through resolution or ban. It is reference-only and
 * contains no executable code.
 *
 * @author System Architecture
 * @version 2.0.0
 * @since 2026-05-08
 */

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @summary Full dispute lifecycle in 5 steps
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  STEP 1: Create Delinquency                                           │
 * │  WHO:    Admin / System                                                │
 * │  WAIT:   —                                                             │
 * │  NOTIFY: 📱 Company owner (FCM push)                                  │
 * │  SETS:   responseDeadline (1–7 days based on severity)                 │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  STEP 2: Company Checks Pending Delinquencies                         │
 * │  WHO:    Company owner / dispatcher                                    │
 * │  WAIT:   —                                                             │
 * │  NOTIFY: —                                                             │
 * │  SHOWS:  responseDeadline, isOverdue, responseStatus                   │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  STEP 3: Company Submits Response (OPTIONAL)                           │
 * │  WHO:    Company owner / dispatcher                                    │
 * │  WAIT:   Must respond before responseDeadline (or response is LATE)    │
 * │  NOTIFY: 📱 Admin (FCM push) — only if post-decision response         │
 * │  FLAGS:  isLateResponse, isPostDecisionResponse                        │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  STEP 4: Admin Issues Decision                                         │
 * │  WHO:    Admin / SuperAdmin                                            │
 * │  WAIT:   Should wait until responseDeadline expires (not enforced)      │
 * │  NOTIFY: 📱 Company owner (FCM push)                                  │
 * │  OUTCOMES: EXONERATED | UPHELD | REDUCED | DISMISSED                   │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  STEP 5: Side-Effects (automatic, per outcome)                         │
 * │  WHO:    System                                                        │
 * │  EXONERATED → soft-delete delinquency (audit trail preserved)          │
 * │  UPHELD     → graduated auto-ban check (ban if points ≥ threshold)     │
 * │  REDUCED    → lower delinquency points                                 │
 * │  DISMISSED  → no action, case closed                                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — CREATE DELINQUENCY
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @step 1
 * @title Create Delinquency
 * @description Records a rule violation against a transport company.
 *
 * @endpoint POST /api/company/admin/delinquency
 * @access   Admin / SuperAdmin only
 * @service  CompanyDelinquency.service.js → createCompanyDelinquency()
 *
 * @body {string} companyUniqueId          - Target company
 * @body {string} delinquencyTypeUniqueId  - Violation type (from DelinquencyTypes)
 * @body {string} [delinquencyDescription] - Free-text description
 * @body {string} [journeyDecisionUniqueId]   - Optional link to a specific journey
 * @body {string} [companyBidRequestUniqueId] - Optional link to a bid
 * @body {boolean} [skipDuplicateCheck]       - Bypass 14-min anti-spam window
 *
 * @timing
 *   - Duplicate check: same type + same company within 0.24 hours (~14 min) blocked
 *   - responseDeadline auto-calculated based on severity:
 *       CRITICAL → 1 day
 *       HIGH     → 3 days
 *       MEDIUM   → 5 days  (default)
 *       LOW      → 7 days
 *
 * @notification
 *   📱 FCM push to company owner (roleId=4):
 *     Title: "⚠️ Delinquency Notice"
 *     Body:  "Your company has received a {severity} delinquency for: {typeName}.
 *             You have {N} day(s) to respond."
 *     Data:  { type: "DELINQUENCY_CREATED", companyDelinquencyUniqueId, companyUniqueId }
 *   ⚠️ Fire-and-forget — notification failure never blocks creation.
 *
 * @sideEffects
 *   - NO auto-ban at creation. Ever. Regardless of who creates it.
 *   - Bans are ONLY issued through Step 4 (UPHELD decision).
 *
 * @returns {{ companyDelinquencyUniqueId: string }}
 */

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — COMPANY CHECKS PENDING DELINQUENCIES
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @step 2
 * @title Check Pending Delinquencies
 * @description Company views delinquencies that have no admin decision yet.
 *
 * @endpoint GET /api/company/delinquency-response/pending
 * @access   Any authenticated user
 * @service  CompanyDelinquency.service.js → getPendingDelinquencies()
 *
 * @query {string} companyUniqueId - Required. The company to check.
 * @query {number} [page=1]        - Pagination page
 * @query {number} [limit=10]      - Items per page
 *
 * @returns {Array<Object>} Each row contains:
 *   - companyDelinquencyUniqueId
 *   - delinquencyDescription, delinquencySeverity, delinquencyPoints
 *   - delinquencyCreatedAt
 *   - responseDeadline    — when the company must respond by
 *   - isOverdue           — TRUE if responseDeadline < NOW()
 *   - delinquencyTypeName — human-readable violation type
 *   - accusedByName       — who filed the accusation
 *   - responseStatus      — 'AWAITING_RESPONSE' | 'RESPONDED'
 *
 * @filtering
 *   - Excludes soft-deleted delinquencies (EXONERATED)
 *   - Excludes delinquencies that already have an admin decision
 */

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — COMPANY SUBMITS RESPONSE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @step 3
 * @title Company Submits Dispute Response
 * @description Company's formal written defense against the accusation.
 *   - OPTIONAL: admin can decide without a response.
 *   - ONE response per delinquency (duplicates blocked).
 *   - ALLOWED even after admin already decided (post-decision defense).
 *
 * @endpoint POST /api/company/delinquency-response/response
 * @access   Any authenticated user (company owner / dispatcher)
 * @service  CompanyDelinquencyDispute.service.js → createDelinquencyResponse()
 *
 * @body {string} companyDelinquencyUniqueId  - The delinquency to respond to
 * @body {string} companyDelinquencyResponse  - Written defense (min 10 chars)
 *
 * @timing
 *   - Company should respond BEFORE the responseDeadline.
 *   - Late responses are accepted but flagged: isLateResponse = true.
 *   - Post-decision responses are accepted and flagged: isPostDecisionResponse = true.
 *
 * @notification
 *   📱 IF a decision already exists (post-decision response):
 *     → FCM push to the ADMIN who made the decision (roleId=3 or 6):
 *       Title: "🔄 Post-Decision Response Received"
 *       Body:  "{companyName} submitted a defense after your {OUTCOME} ruling.
 *               Please re-review the case."
 *       Data:  { type: "POST_DECISION_RESPONSE", companyDelinquencyUniqueId,
 *                adminDecisionOnDelinquencyUniqueId, companyDelinquencyResponseUniqueId }
 *
 * @returns {{
 *   companyDelinquencyResponseUniqueId: string,
 *   isLateResponse: boolean,
 *   isPostDecisionResponse: boolean,
 *   data: string  // message varies by timing scenario
 * }}
 *
 * @responseMessages
 *   | Scenario                 | isLate | isPostDecision | Message                                              |
 *   |--------------------------|--------|----------------|------------------------------------------------------|
 *   | On time, no decision     | false  | false          | "Dispute response submitted successfully"             |
 *   | Late, no decision        | true   | false          | "submitted (marked as LATE)"                          |
 *   | On time, after decision  | false  | true           | "Post-decision defense. Admin notified to re-review." |
 *   | Late + after decision    | true   | true           | "Post-decision defense (late). Admin notified."       |
 */

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — ADMIN ISSUES DECISION
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @step 4
 * @title Admin Issues Formal Decision
 * @description Admin reviews the delinquency (and response, if any) and issues
 *   a binding ruling. One decision per delinquency (duplicates blocked).
 *
 * @endpoint POST /api/company/admin/delinquency-decisions
 * @access   Admin / SuperAdmin only
 * @service  AdminDecisionOnDelinquency.service.js → createAdminDecision()
 *
 * @body {string} companyDelinquencyUniqueId             - The delinquency
 * @body {string} [companyDelinquencyResponseUniqueId]   - Link to company response (if any)
 * @body {string} decisionOutcome                        - 'EXONERATED'|'UPHELD'|'REDUCED'|'DISMISSED'
 * @body {string} adminDecisionText                      - Written reasoning (min 10 chars)
 * @body {number} [delinquencyPointsAfter]               - REQUIRED when outcome = REDUCED
 *
 * @timing
 *   - Admin SHOULD wait until responseDeadline expires before deciding.
 *   - This is NOT enforced — admin may decide early if urgency demands it.
 *   - Company can still respond after the decision (post-decision defense).
 *
 * @notification
 *   📱 FCM push to company owner (roleId=4):
 *     Title: "📜 Delinquency Decision: {OUTCOME}"
 *     Body varies by outcome:
 *       EXONERATED → "Your company has been cleared."
 *       UPHELD     → "The accusation has been upheld. A graduated review has been applied."
 *       REDUCED    → "The delinquency points have been reduced after admin review."
 *       DISMISSED  → "The case has been closed with no further action."
 *     Data: { type: "DELINQUENCY_DECISION", decisionOutcome, companyDelinquencyUniqueId }
 */

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — SIDE-EFFECTS PER OUTCOME
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @step 5
 * @title Automatic Side-Effects (triggered by Step 4)
 *
 * @outcome EXONERATED
 *   @description Company is cleared — the accusation was wrong.
 *   @action     Delinquency is SOFT-DELETED (delinquencyDeletedAt = NOW()).
 *               Audit trail preserved. The delinquency no longer counts toward
 *               point totals or ban thresholds.
 *   @ban        No ban. If points were previously accumulated, they are now reduced.
 *
 * @outcome UPHELD
 *   @description Accusation stands — company defense failed.
 *   @action     Runs checkAndApplyAutomaticCompanyBan():
 *     1. Sums ALL active delinquency points in the 30-day window
 *        (excludes soft-deleted / exonerated delinquencies).
 *     2. Checks if an active ban already exists (if so → no action).
 *     3. Matches total points against graduated thresholds:
 *
 *        | Total Points | Ban Duration | Severity  |
 *        |-------------|-------------|-----------|
 *        | < 15 pts    | NO BAN      | Warning   |
 *        | 15+ pts     | 3 days      | MEDIUM    |
 *        | 30+ pts     | 7 days      | HIGH      |
 *        | 60+ pts     | 90 days     | CRITICAL  |
 *        | 90+ pts     | 365 days    | PERMANENT |
 *
 *     4. If threshold met → CompanyBan created, ALL contributing delinquencies
 *        linked via CompanyBanDelinquency junction table.
 *     5. Audit log entry recorded via CompanyProfileHistory.
 *   @ban        Conditional — only if accumulated points meet a threshold.
 *
 * @outcome REDUCED
 *   @description Partial mitigation — points are lowered.
 *   @action     UPDATE CompanyDelinquency SET delinquencyPoints = {delinquencyPointsAfter}
 *   @ban        No direct ban. Lower points reduce future ban risk.
 *
 * @outcome DISMISSED
 *   @description Case closed — no further action needed.
 *   @action     None. Delinquency remains on record unchanged.
 *   @ban        No ban.
 */

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE TABLES INVOLVED
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @tables
 *
 * 1. CompanyDelinquency         — The accusation record
 *    Key columns: delinquencySeverity, delinquencyPoints, responseDeadline,
 *                 delinquencyDeletedAt (soft-delete for EXONERATED)
 *
 * 2. CompanyDelinquencyResponse — Company's written defense
 *    Key columns: isLateResponse (TRUE if past deadline)
 *    Constraint:  One response per delinquency
 *
 * 3. AdminDecisionOnDelinquency — Admin's formal ruling
 *    Key columns: decisionOutcome ENUM('EXONERATED','UPHELD','REDUCED','DISMISSED'),
 *                 delinquencyPointsAfter (for REDUCED)
 *    Constraint:  One decision per delinquency
 *
 * 4. CompanyBan                 — Ban record (created by UPHELD if threshold met)
 *    Key columns: banDurationDays, banExpiresAt, isActive
 *
 * 5. CompanyBanDelinquency      — Junction: links ban to ALL contributing delinquencies
 *    Key columns: pointsAtTime (snapshot of each delinquency's points at ban time)
 */

// ─────────────────────────────────────────────────────────────────────────────
// FULL API ENDPOINT REFERENCE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @endpoints
 *
 * ADMIN ENDPOINTS (require admin/superAdmin token):
 *   POST   /api/company/admin/delinquency                    — Create delinquency
 *   GET    /api/company/admin/delinquency                    — List delinquencies (paginated)
 *   DELETE /api/company/admin/delinquency/:id                — Soft-delete delinquency
 *   POST   /api/company/admin/delinquency-decisions          — Issue decision
 *   GET    /api/company/admin/delinquency-decisions          — List decisions (paginated)
 *   GET    /api/company/admin/delinquency-decisions/:id      — Get single decision
 *   PUT    /api/company/admin/delinquency-decisions/:id      — Amend decision text
 *   DELETE /api/company/admin/delinquency-decisions/:id      — Soft-delete decision
 *   GET    /api/company/admin/delinquency/bans               — List bans (paginated)
 *   POST   /api/company/admin/delinquency/bans               — Manual ban
 *   POST   /api/company/admin/delinquency/bans/unban         — Lift ban
 *
 * COMPANY ENDPOINTS (require any authenticated token):
 *   GET    /api/company/delinquency-response/pending         — Pending delinquencies
 *   POST   /api/company/delinquency-response/response        — Submit defense
 *   GET    /api/company/delinquency-response/response        — List responses
 */

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @notifications All notifications are fire-and-forget (never block the operation).
 *
 * | Trigger                    | Recipient       | Title                                | Data Type               |
 * |----------------------------|-----------------|--------------------------------------|-------------------------|
 * | Delinquency created        | Company owner   | ⚠️ Delinquency Notice                | DELINQUENCY_CREATED     |
 * | Admin decision issued      | Company owner   | 📜 Delinquency Decision: {OUTCOME}  | DELINQUENCY_DECISION    |
 * | Post-decision response     | Deciding admin  | 🔄 Post-Decision Response Received   | POST_DECISION_RESPONSE  |
 */
