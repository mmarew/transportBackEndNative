const axios = require("axios");
const { usersData, backendURL } = require("../constants");
const { authConfig } = require("../Utils");
const { report } = require("../Reporter");

const testAdminDashboardFlow = async () => {
  console.log("\n✅ ========== ADMIN DASHBOARD TESTS ==========\n");

  const admin = usersData.admin || usersData.supperAdmin;
  const token = admin?.token || usersData?.supperAdmin?.token;

  if (!token) {
    report.skip("Dashboard — no admin token available");
    console.log("\n⚠️  No admin token available — skipping dashboard tests\n");
    return;
  }

  const config = authConfig(token);

  // ── Test 1: 401 without token ─────────────────────────────────
  try {
    const res = await axios.get(backendURL + "/api/admin/dashboard", {
      validateStatus: () => true,
    });
    if (res.status === 401) {
      report.pass("Dashboard — rejects unauthenticated request (401)");
    } else {
      report.fail(
        "Dashboard — rejects unauthenticated request",
        `Expected 401, got ${res.status}`,
      );
    }
  } catch (err) {
    report.fail("Dashboard — rejects unauthenticated request", err.message);
  }

  // ── Test 2: 200 with valid token ────────────────────────────
  try {
    const res = await axios.get(
      backendURL + "/api/admin/dashboard",
      config,
    );
    if (res.status !== 200) {
      report.fail(
        "Dashboard — returns 200 with admin token",
        `Expected 200, got ${res.status}`,
      );
    } else if (!res.data?.data) {
      report.fail(
        "Dashboard — returns 200 with admin token",
        "Response body missing .data field",
      );
    } else {
      report.pass("Dashboard — returns 200 with admin token");
    }
  } catch (err) {
    report.fail("Dashboard — returns 200 with admin token", err.message);
  }

  // ── Test 3: response shape ──────────────────────────────────
  try {
    const res = await axios.get(
      backendURL + "/api/admin/dashboard",
      config,
    );
    const d = res.data.data;

    const required = [
      "pendingCompanies",
      "approvedCompanies",
      "suspendedCompanies",
      "totalCompanyVehicles",
      "totalCompanyDrivers",
      "activeCompanyBids",
    ];
    const missing = required.filter((k) => typeof d?.[k] !== "number");

    if (missing.length > 0) {
      report.fail(
        "Dashboard — response shape",
        `Missing or non-numeric fields: ${missing.join(", ")}`,
      );
    } else if (
      d.pendingCompanies < 0 ||
      d.approvedCompanies < 0 ||
      d.suspendedCompanies < 0
    ) {
      report.fail(
        "Dashboard — response shape",
        "Company counts cannot be negative",
      );
    } else {
      report.pass("Dashboard — response shape");
    }
  } catch (err) {
    report.fail("Dashboard — response shape", err.message);
  }

  // ── Test 4: averageRating ───────────────────────────────────
  try {
    const res = await axios.get(
      backendURL + "/api/admin/dashboard",
      config,
    );
    const r = res.data.data?.averageRating;
    if (r === null || typeof r === "number") {
      if (typeof r === "number" && (r < 0 || r > 5)) {
        report.fail("Dashboard — averageRating", "Out of range 0-5");
      } else {
        report.pass("Dashboard — averageRating");
      }
    } else {
      report.fail("Dashboard — averageRating", "Expected number or null");
    }
  } catch (err) {
    report.fail("Dashboard — averageRating", err.message);
  }

  console.log("\n✅ ========== ADMIN DASHBOARD TESTS COMPLETED ==========\n");
};

module.exports = { testAdminDashboardFlow };
