"use strict";

/**
 * Unit tests for the EAT wall-clock date helpers in Utils/CurrentDate.js.
 *
 * currentDate() and minutesAgo() both return MySQL DATETIME strings in East
 * African Time (UTC+3). `minutesAgo` exists so queue offer-window comparisons
 * (`offeredAt < cutoff`) run in the same timezone domain as the stored values;
 * a UTC `Date` cutoff is serialized by mysql2 in the process timezone and skews
 * the comparison by the machine's UTC offset.
 */

const { currentDate, minutesAgo } = require("../Utils/CurrentDate");

describe("minutesAgo", () => {
  it("returns a MySQL DATETIME string (YYYY-MM-DD HH:mm:ss)", () => {
    expect(minutesAgo(0)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("is strictly before currentDate() for a positive window", () => {
    expect(minutesAgo(3) < currentDate()).toBe(true);
  });

  it("is not after currentDate() for a zero window (fresh offer stays safe)", () => {
    // Regression: a fresh offer (offeredAt = now) must NOT satisfy
    // `offeredAt < cutoff` — the timezone bug made every offer look expired.
    const now = currentDate();
    expect(now < minutesAgo(0)).toBe(false);
  });

  it("scales with the window size", () => {
    const base = minutesAgo(0);
    const five = minutesAgo(5);
    const ten = minutesAgo(10);
    expect(five < base).toBe(true);
    expect(ten < five).toBe(true);
  });
});
