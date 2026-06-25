const stats = { passed: 0, failed: 0, skipped: 0 };

const report = {
  pass(label) {
    stats.passed++;
    console.log(`  ✅ PASS: ${label}`);
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
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Results:  ✅ ${stats.passed} passed  |  ❌ ${stats.failed} failed  |  ⏩ ${stats.skipped} skipped`);
    console.log(`  Total:    ${total} tests`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    return stats.failed === 0;
  },
  reset() {
    stats.passed = 0;
    stats.failed = 0;
    stats.skipped = 0;
  },
};

module.exports = { report };
