"use strict";

/**
 * Unit tests for resolveDocumentUrl()
 *
 * Ensures that:
 *   1. New relative paths (/uploads/...) get the current APP_API_URL prepended.
 *   2. Legacy full URLs (old domain) get re-based to the current APP_API_URL.
 *   3. Null/undefined inputs return null.
 *   4. External URLs without /uploads/ are returned as-is.
 */

// Mock Config BEFORE requiring FTPHandler so the module picks up the mock
jest.mock("../Utils/Config", () => ({
  APP_API_URL: "https://company.dynamicsroute.tech",
}));

const { resolveDocumentUrl } = require("../Utils/FTPHandler");

describe("resolveDocumentUrl", () => {
  // ── New relative paths ──────────────────────────────────────────────────────
  it("resolves a relative /uploads/ path to the full URL", () => {
    const result = resolveDocumentUrl("/uploads/4_abc123.png");
    expect(result).toBe(
      "https://company.dynamicsroute.tech/uploads/4_abc123.png",
    );
  });

  // ── Legacy full URLs ────────────────────────────────────────────────────────
  it("re-bases a legacy https://dynamicsroute.tech URL to the current domain", () => {
    const legacy =
      "https://dynamicsroute.tech/uploads/4_2cd86393-721f-4746-b6b5-97d7690d5bce.png";
    const result = resolveDocumentUrl(legacy);
    expect(result).toBe(
      "https://company.dynamicsroute.tech/uploads/4_2cd86393-721f-4746-b6b5-97d7690d5bce.png",
    );
  });

  it("re-bases any arbitrary old domain to the current domain", () => {
    const legacy = "http://localhost:3000/uploads/test_file.jpg";
    const result = resolveDocumentUrl(legacy);
    expect(result).toBe(
      "https://company.dynamicsroute.tech/uploads/test_file.jpg",
    );
  });

  // ── Null / undefined / empty ────────────────────────────────────────────────
  it("returns null for null input", () => {
    expect(resolveDocumentUrl(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(resolveDocumentUrl(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveDocumentUrl("")).toBeNull();
  });

  // ── External / unknown URLs ─────────────────────────────────────────────────
  it("returns an external URL as-is if it has no /uploads/ segment", () => {
    const external = "https://cdn.example.com/images/photo.jpg";
    expect(resolveDocumentUrl(external)).toBe(external);
  });
});
