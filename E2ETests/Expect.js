"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Deliberate-failure ("negative probe") machinery.
//
// A suite produces three fundamentally different kinds of non-2xx traffic and
// they must never look alike in the log:
//
//   🛡 EXPECTED  — the test INTENTIONALLY trips a guard (403/400/404/409) to
//                  prove the system protects data / enforces a rule. This is a
//                  PASS. It must be DECLARED by the test via armExpect(), so the
//                  harness can label it instead of printing a scary "(fail)".
//   ❌ FAIL      — anything else: an unexpected status, a guard that did NOT
//                  fire when it should have, a logic/syntax error, or an error
//                  that a test swallowed. Always counted, always propagated.
//   ⏩ SKIP      — a declared unmet precondition. Counted, never a silent pass.
//
// logCapture.js calls matchExpect() when an HTTP error arrives, so a declared
// probe is rendered as 🛡 EXPECTED rather than as a backend failure.
//
// Expectations live on a STACK (not a single slot) so that a helper arming
// inside an already-armed block cannot disarm the outer probe, and so that
// concurrent requests (Promise.all races) can each declare their own.
// ─────────────────────────────────────────────────────────────────────────────

const { report } = require("./Reporter");

let seq = 0;
const armed = [];

/**
 * Declare that a rejection is about to be provoked on purpose.
 *
 * @param {number|number[]} allowed    statuses that prove the guard fired
 * @param {string}          label      human-readable rule being proven
 * @param {Object}          [opts]
 * @param {string}          [opts.urlIncludes] only match requests whose URL
 *                                contains this substring (needed when several
 *                                probes are in flight at once)
 * @returns {{id:number}} token — pass it back to disarmExpect()
 */
const armExpect = (allowed, label, opts = {}) => {
  const token = {
    id: ++seq,
    allowed: Array.isArray(allowed) ? allowed : [allowed],
    label: label || "guard probe",
    urlIncludes: opts.urlIncludes || null,
  };
  armed.push(token);
  return token;
};

/**
 * Remove a declaration. With a token, removes exactly that one; without, removes
 * the most recent (convenient for a plain try/finally around a single probe).
 */
const disarmExpect = (token) => {
  if (!token) return armed.pop() || null;
  const idx = armed.findIndex((t) => t.id === token.id);
  if (idx === -1) return null;
  return armed.splice(idx, 1)[0];
};

/** Kept for callers/inspection that just want to know if anything is armed. */
const peekExpect = () => armed[armed.length - 1] || null;

/**
 * Find (and consume) the declaration that matches an observed rejection.
 * Matching requires the status to be allowed and, when the declaration named a
 * URL fragment, the request URL to contain it. Innermost match wins.
 */
const matchExpect = (status, url = "") => {
  for (let i = armed.length - 1; i >= 0; i--) {
    const t = armed[i];
    if (!t.allowed.includes(status)) continue;
    if (t.urlIncludes && !String(url).includes(t.urlIncludes)) continue;
    armed.splice(i, 1);
    return t;
  }
  return null;
};

/**
 * Run a request that is EXPECTED to be rejected by a server-side guard.
 *
 * - rejects with an allowed status  → 🛡 guard-probe PASS
 * - resolves (guard did not fire)   → ❌ FAIL (thrown; the rule is not enforced)
 * - rejects with any other status   → ❌ FAIL (thrown; wrong failure mode)
 * - throws a non-HTTP error         → ❌ FAIL (thrown; logic/syntax problem)
 *
 * @param {Object}   opts
 * @param {string}   opts.label    human-readable rule being proven
 * @param {number[]} [opts.allowed] statuses that count as "guard enforced"
 * @param {string}   [opts.urlIncludes] restrict the declaration to one endpoint
 * @param {Function} opts.run      () => Promise<axiosResponse>
 * @returns {Promise<{status:number, expected:true, data:*}>}
 */
const expectGuardRejection = async ({
  label,
  allowed = [400, 403],
  urlIncludes,
  run,
}) => {
  const expected = Array.isArray(allowed) ? allowed : [allowed];
  const token = armExpect(expected, label, { urlIncludes });
  try {
    const res = await run();
    throw new Error(
      `${label}: guard did NOT fire — request succeeded with HTTP ${res?.status} ` +
        `(expected rejection with ${expected.join("/")})`,
    );
  } catch (error) {
    const status = error?.response?.status;
    if (status && expected.includes(status)) {
      report.guard(label, status);
      return { status, expected: true, data: error.response?.data };
    }
    throw error;
  } finally {
    disarmExpect(token);
  }
};

/**
 * Run a request that is EXPECTED to succeed, and fail loudly if it does not.
 * Mirrors expectGuardRejection so positive and negative probes read the same.
 */
const expectSuccess = async ({ label, run, allowed = [200, 201] }) => {
  const res = await run();
  const status = res?.status;
  if (!allowed.includes(status)) {
    throw new Error(`${label}: expected HTTP ${allowed.join("/")}, got ${status}`);
  }
  report.pass(label);
  return res;
};

module.exports = {
  armExpect,
  disarmExpect,
  peekExpect,
  matchExpect,
  expectGuardRejection,
  expectSuccess,
};
