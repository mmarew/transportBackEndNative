const stats = { passed: 0, failed: 0, skipped: 0, guards: 0 };

const report = {
  pass(label) {
    stats.passed++;
    console.log(`  ✅ PASS: ${label}`);
  },
  /**
   * A deliberate negative probe: the test intentionally tripped a server guard
   * and the guard fired with the expected status. Counted as a pass, but shown
   * separately so "the system rejected this on purpose" is never confused with
   * "the system is broken".
   */
  guard(label, status) {
    stats.passed++;
    stats.guards++;
    console.log(`  🛡 GUARD OK: ${label} — rejected with ${status} as designed`);
  },
  fail(label, err) {
    stats.failed++;
    console.error(`  ❌ FAIL: ${label} — ${err?.message || err}`);
  },
  skip(label, reason) {
    stats.skipped++;
    console.log(`  ⏩ SKIP: ${label} — ${reason || "precondition not met"}`);
  },
  summary() {
    const total = stats.passed + stats.failed + stats.skipped;
    const plain = stats.passed - stats.guards;
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(
      `  Results:  ✅ ${stats.passed} passed  |  ❌ ${stats.failed} failed  |  ⏩ ${stats.skipped} skipped`,
    );
    console.log(
      `            (of the passes: ${plain} positive, 🛡 ${stats.guards} deliberate guard-probes)`,
    );
    console.log(`  Total:    ${total} tests`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    return stats.failed === 0;
  },
  reset() {
    stats.passed = 0;
    stats.failed = 0;
    stats.skipped = 0;
    stats.guards = 0;
  },
};

module.exports = { report, stats };
