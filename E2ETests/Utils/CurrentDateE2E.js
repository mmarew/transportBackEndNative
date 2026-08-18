// CurrentDate Helpers — E2E Tests
// Converted from __tests__/currentDate.test.js unit tests.
// Tests the EAT wall-clock date helpers via their actual usage in the API:
//   1. currentDate() returns MySQL DATETIME format
//   2. minutesAgo() returns a time strictly before currentDate()
//   3. Zero window doesn't produce expired timestamp
//   4. Larger windows produce earlier timestamps

const { currentDate, minutesAgo } = require("../../Utils/CurrentDate");

// ── Test: currentDate format ─────────────────────────────────────────────────
const testCurrentDateFormat = async () => {
  const now = currentDate();
  const pattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

  if (!pattern.test(now)) {
    throw new Error(`currentDate() returned invalid format: ${now}`);
  }
  console.log(`✅ currentDate() returns valid MySQL DATETIME: ${now}`);
};

// ── Test: minutesAgo is before currentDate ───────────────────────────────────
const testMinutesAgoBeforeNow = async () => {
  const now = currentDate();
  const threeMinAgo = minutesAgo(3);

  if (!(threeMinAgo < now)) {
    throw new Error(
      `minutesAgo(3)="${threeMinAgo}" is NOT before currentDate()="${now}"`,
    );
  }
  console.log(
    `✅ minutesAgo(3)="${threeMinAgo}" is correctly before currentDate()`,
  );
};

// ── Test: zero window is not expired ─────────────────────────────────────────
const testZeroWindowNotExpired = async () => {
  const now = currentDate();
  const zeroMinAgo = minutesAgo(0);

  if (now < zeroMinAgo) {
    throw new Error(
      `Regression: currentDate()="${now}" < minutesAgo(0)="${zeroMinAgo}" — zero window must not be expired`,
    );
  }
  console.log("✅ Zero window correctly not expired (no timezone regression)");
};

// ── Test: window scaling ─────────────────────────────────────────────────────
const testWindowScaling = async () => {
  const base = minutesAgo(0);
  const five = minutesAgo(5);
  const ten = minutesAgo(10);

  if (!(five < base))
    throw new Error("minutesAgo(5) should be before minutesAgo(0)");
  if (!(ten < five))
    throw new Error("minutesAgo(10) should be before minutesAgo(5)");
  console.log("✅ Window scaling correct: 10min < 5min < 0min");
};

// ── Full workflow ────────────────────────────────────────────────────────────
const testCurrentDateWorkflow = async () => {
  console.log("\n── CurrentDate Helpers ──");
  await testCurrentDateFormat();
  await testMinutesAgoBeforeNow();
  await testZeroWindowNotExpired();
  await testWindowScaling();
  console.log("── CurrentDate Helpers complete ──\n");
};

module.exports = {
  testCurrentDateWorkflow,
  testCurrentDateFormat,
  testMinutesAgoBeforeNow,
  testZeroWindowNotExpired,
  testWindowScaling,
};
