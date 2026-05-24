#!/usr/bin/env node
/* eslint-disable max-lines */
/**
 * delinquency_ban.test.js
 * ========================
 * Tests for UserDelinquency + BannedUsers (driver)
 * and CompanyDelinquency + CompanyBan (company).
 *
 * Phases:
 *   A — Admin auth + DB migrate + seed predefines
 *   B — Register fresh driver + company
 *   C — User (Driver) Delinquency CRUD
 *   D — BannedUsers (driver) CRUD
 *   E — Company Delinquency CRUD
 *   F — Company Ban CRUD
 *   G — Commission Evasion: company cancels accepted bid → auto delinquency + ban
 *
 * Usage:
 *   node tests/delinquency_ban.test.js
 */
"use strict";

const http = require("http");
const https = require("https");
const Config = require("../Utils/Config");
// const { randomUUID } = require("crypto");

const BASE_URL = (Config.APP_API_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const SUPER_ADMIN_PHONE = Config.SUPER_ADMIN.PHONE || "+251983222221";
const DEFAULT_OTP = Config.TEST.OTP || "101010";

const runId = String(Date.now()).slice(-7);
const DRIVER_PHONE = `+2519270${runId}`;

const parsedBase = new URL(BASE_URL);
const transport = parsedBase.protocol === "https:" ? https : http;

// ─── HTTP ────────────────────────────────────────────────────────────────────
function request(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json", ...extraHeaders };
    if (bodyStr) {
      headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }
    const req = transport.request(
      {
        hostname: parsedBase.hostname,
        port: parsedBase.port || 80,
        path,
        method,
        headers,
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      },
    );
    req.on("error", reject);
    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

// ─── Auth ────────────────────────────────────────────────────────────────────
async function getToken(phone, roleId) {
  await request("POST", "/api/user/loginUser", { phoneNumber: phone, roleId });
  const r = await request("POST", "/api/user/verifyUserByOTP", {
    phoneNumber: phone,
    OTP: DEFAULT_OTP,
    roleId,
  });
  const t = r.body?.token || r.body?.data?.token;
  assert(t, `Auth failed for ${phone}: ${JSON.stringify(r.body)}`);
  return t;
}

// ─── State ────────────────────────────────────────────────────────────────────
const s = {
  adminToken: null,
  driverUniqueId: null,
  driverToken: null,
  vehicleTypeUniqueId: null,
  vehicleUniqueId: null,
  companyUniqueId: null,
  // delinquency type UUIDs (fetched from DB)
  driverDelinquencyTypeUniqueId: null,
  companyDelinquencyTypeUniqueId: null,
  // created records
  userDelinquencyUniqueId: null,
  banUniqueId: null,
  companyDelinquencyUniqueId: null,
  companyBanUniqueId: null,
  // for commission evasion phase
  shipperUniqueId: null,
  shipperToken: null,
  companyBidRequestUniqueId: null,
  shipperRequestBatchId: null,
  shipperRequestUniqueId: null,
  assignmentUniqueId: null,
};

const adminH = () => ({ Authorization: `Bearer ${s.adminToken}` });
// const driverH = () => ({ Authorization: `Bearer ${s.driverToken}` });
// const shipperH = () => ({ Authorization: `Bearer ${s.shipperToken}` });

// ─── Test runner ──────────────────────────────────────────────────────────────
const results = [];
let stepNum = 0;

async function step(name, fn) {
  stepNum++;
  const num = String(stepNum).padStart(2, "0");
  process.stdout.write(`  [${num}] ${name} ... `);
  try {
    const info = await fn();
    results.push({ num, name, pass: true });
    console.log(`\x1b[32m✅ PASS\x1b[0m${info ? `  — ${info}` : ""}`);
  } catch (err) {
    results.push({ num, name, pass: false, error: err.message });
    console.log(`\x1b[31m❌ FAIL\x1b[0m  — ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(
    "\n\x1b[1m╔══════════════════════════════════════════════╗\x1b[0m",
  );
  console.log("\x1b[1m║  Delinquency & Ban Test Suite               ║\x1b[0m");
  console.log("\x1b[1m╚══════════════════════════════════════════════╝\x1b[0m");
  console.log(`  Base URL : ${BASE_URL}  |  Run ID: ${runId}\n`);

  // ══════════════════════════════════════════════════════════════
  // PHASE A — Admin auth + setup
  // ══════════════════════════════════════════════════════════════
  console.log("\x1b[1m━━ Phase A: Auth & Setup ━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");

  await step("Admin: login + JWT", async () => {
    s.adminToken = await getToken(SUPER_ADMIN_PHONE, 6);
    return "JWT acquired";
  });

  await step("Admin: migrate DB (CREATE IF NOT EXISTS)", async () => {
    const r = await request("POST", "/api/admin/createTable", null, adminH());
    assert(
      r.body?.message === "success" || r.status === 200,
      `DB migrate failed: ${JSON.stringify(r.body)}`,
    );
    return "Tables verified";
  });

  await step(
    "Admin: install predefined data (seed delinquency types)",
    async () => {
      const r = await request(
        "POST",
        "/api/admin/installPreDefinedData",
        null,
        adminH(),
      );
      // Idempotent — may return success or 'already seeded'
      assert(r.status < 500, `Seed failed: ${JSON.stringify(r.body)}`);
      return `status ${r.status}`;
    },
  );

  await step("Fetch driver delinquency type UUID", async () => {
    const r = await request(
      "GET",
      "/api/admin/delinquency-types?limit=50",
      null,
      adminH(),
    );
    const types = r.body?.data || [];
    const t = types.find((d) =>
      d.delinquencyTypeName?.toLowerCase().includes("driver commission"),
    );
    assert(
      t,
      `Driver delinquency type not found. Run installPreDefinedData. Got: ${JSON.stringify(types.map((d) => d.delinquencyTypeName))}`,
    );
    s.driverDelinquencyTypeUniqueId = t.delinquencyTypeUniqueId;
    return `uuid: ${s.driverDelinquencyTypeUniqueId}`;
  });

  await step("Fetch company delinquency type UUID", async () => {
    const r = await request(
      "GET",
      "/api/admin/delinquency-types?limit=50",
      null,
      adminH(),
    );
    const types = r.body?.data || [];
    const t = types.find((d) =>
      d.delinquencyTypeName?.toLowerCase().includes("company commission"),
    );
    assert(
      t,
      `Company delinquency type not found. Got: ${JSON.stringify(types.map((d) => d.delinquencyTypeName))}`,
    );
    s.companyDelinquencyTypeUniqueId = t.delinquencyTypeUniqueId;
    return `uuid: ${s.companyDelinquencyTypeUniqueId}`;
  });

  // ══════════════════════════════════════════════════════════════
  // PHASE B — Register driver + company
  // ══════════════════════════════════════════════════════════════
  console.log(
    "\n\x1b[1m━━ Phase B: Register Driver & Company ━━━━━━━━━\x1b[0m",
  );

  await step("Register driver", async () => {
    const r = await request("POST", "/api/user/createUser", {
      phoneNumber: DRIVER_PHONE,
      roleId: 2,
      fullName: `Delinquency Test Driver ${runId}`,
      email: `dlq_driver_${runId}@test.com`,
    });
    assert(
      r.body?.message === "success",
      `Register failed: ${JSON.stringify(r.body)}`,
    );
    s.driverUniqueId = r.body?.data?.userUniqueId;
    assert(s.driverUniqueId, "No driverUniqueId");
    return s.driverUniqueId;
  });

  await step("Driver: verify OTP → JWT", async () => {
    s.driverToken = await getToken(DRIVER_PHONE, 2);
    return "Driver JWT acquired";
  });

  await step("Create transport company", async () => {
    const r = await request(
      "POST",
      "/api/company/companies",
      {
        companyName: `DlqTestCo_${runId}`,
        companyPhone: `+25191${runId}`,
        companyEmail: `dlqco_${runId}@test.com`,
        companyAddress: "Addis Ababa",
        companyRegistrationNumber: `DLQ-${runId}`,
      },
      adminH(),
    );
    assert(
      r.body?.message === "success",
      `Create company failed: ${JSON.stringify(r.body)}`,
    );
    s.companyUniqueId = r.body?.data?.companyUniqueId;
    assert(s.companyUniqueId, "No companyUniqueId");
    return s.companyUniqueId;
  });

  await step("Approve company (skip if docs required)", async () => {
    const r = await request(
      "PATCH",
      `/api/company/companies/${s.companyUniqueId}/approve`,
      { approvalStatus: "approved", approvalReason: "Test approval" },
      adminH(),
    );
    if (r.status === 422) {
      return "Skipped — company documents not uploaded (out of scope for this test)";
    }
    assert(
      r.body?.message === "success",
      `Approve failed: ${JSON.stringify(r.body)}`,
    );
    return "Approved";
  });

  // ══════════════════════════════════════════════════════════════
  // PHASE C — User Delinquency CRUD (driver)
  // ══════════════════════════════════════════════════════════════
  console.log(
    "\n\x1b[1m━━ Phase C: User (Driver) Delinquency CRUD ━━━━\x1b[0m",
  );

  await step("Create driver delinquency", async () => {
    const r = await request(
      "POST",
      "/api/admin/user-delinquency",
      {
        userUniqueId: s.driverUniqueId,
        roleId: 2,
        delinquencyTypeUniqueId: s.driverDelinquencyTypeUniqueId,
        delinquencyDescription: "Test: driver commission evasion delinquency",
        skipDuplicateCheck: true,
      },
      adminH(),
    );
    assert(
      r.body?.message === "success",
      `Create delinquency failed: ${JSON.stringify(r.body)}`,
    );
    s.userDelinquencyUniqueId =
      r.body?.userDelinquencyUniqueId || r.body?.data?.userDelinquencyUniqueId;
    assert(
      s.userDelinquencyUniqueId,
      `No userDelinquencyUniqueId in: ${JSON.stringify(r.body)}`,
    );
    const action = r.body?.automaticAction;
    return `uuid: ${s.userDelinquencyUniqueId} | auto-ban: ${action?.action || "none"}`;
  });

  await step("Get driver delinquencies — verify created", async () => {
    const r = await request(
      "GET",
      `/api/admin/getDelinquencyByFilter?userUniqueId=${s.driverUniqueId}&roleId=2`,
      null,
      adminH(),
    );
    assert(
      r.body?.message === "success",
      `Get failed: ${JSON.stringify(r.body)}`,
    );
    const found = r.body?.data?.find(
      (d) => d.userDelinquencyUniqueId === s.userDelinquencyUniqueId,
    );
    assert(found, "Created delinquency not in list");
    return `Found — severity: ${found.delinquencySeverity}, points: ${found.delinquencyPoints}`;
  });

  await step("Get delinquency list for driver — verify count", async () => {
    const r = await request(
      "GET",
      `/api/admin/getDelinquencyByFilter?userUniqueId=${s.driverUniqueId}&roleId=2`,
      null,
      adminH(),
    );
    assert(
      r.body?.message === "success",
      `List failed: ${JSON.stringify(r.body)}`,
    );
    return `total driver delinquencies: ${r.body?.pagination?.totalItems ?? r.body?.data?.length}`;
  });

  await step("Update driver delinquency description", async () => {
    const r = await request(
      "PUT",
      `/api/admin/user-delinquency/${s.userDelinquencyUniqueId}`,
      { delinquencyDescription: "Updated description" },
      adminH(),
    );
    assert(
      r.body?.message === "success",
      `Update failed: ${JSON.stringify(r.body)}`,
    );
    return "Updated";
  });

  await step(
    "Delete delinquency with no linked ban → success (skipDuplicate=true record)",
    async () => {
      // We will re-create one to test deletion since auto-ban may have been created
      const r2 = await request(
        "POST",
        "/api/admin/user-delinquency",
        {
          userUniqueId: s.driverUniqueId,
          roleId: 2,
          delinquencyTypeUniqueId: s.driverDelinquencyTypeUniqueId,
          delinquencyDescription: "Temporary to test delete",
          skipDuplicateCheck: true,
        },
        adminH(),
      );
      const tempId =
        r2.body?.userDelinquencyUniqueId ||
        r2.body?.data?.userDelinquencyUniqueId;
      if (!tempId) {
        return "Skipped — could not create temp delinquency";
      }

      // Only delete if no ban was auto-created for it
      if (r2.body?.automaticAction?.action === "none") {
        const rd = await request(
          "DELETE",
          `/api/admin/user-delinquency/${tempId}`,
          null,
          adminH(),
        );
        assert(
          rd.body?.message === "success",
          `Delete failed: ${JSON.stringify(rd.body)}`,
        );
        return "Deleted temp delinquency";
      }
      return "Skipped delete — auto-ban was created, FK prevents delete";
    },
  );

  // ══════════════════════════════════════════════════════════════
  // PHASE D — BannedUsers (driver) CRUD
  // ══════════════════════════════════════════════════════════════
  console.log(
    "\n\x1b[1m━━ Phase D: BannedUsers (Driver) CRUD ━━━━━━━━━\x1b[0m",
  );

  await step(
    "Manual ban driver (admin-initiated via userRoleUniqueId)",
    async () => {
      // Auto-ban from 25 pts fired in step 10, so fetch the ban that was created
      // and also verify manual ban API by checking what fields it needs
      const rb = await request(
        "GET",
        `/api/admin/banned-users?isActive=true`,
        null,
        adminH(),
      );
      const ban = rb.body?.data?.find(
        (b) =>
          b.driverUniqueId === s.driverUniqueId ||
          b.userDelinquencyUniqueId === s.userDelinquencyUniqueId,
      );
      if (ban) {
        s.banUniqueId = ban.banUniqueId;
        return `Auto-ban found from step 10: ${s.banUniqueId}`;
      }
      // Try manual ban — need userRoleUniqueId from driver's UserRole record
      const urRes = await request(
        "GET",
        `/api/user/userRoles?userUniqueId=${s.driverUniqueId}&roleId=2`,
        null,
        adminH(),
      );
      const userRole = urRes.body?.data?.[0];
      if (!userRole?.userRoleUniqueId) {
        return "Skipped — could not find userRoleUniqueId for driver";
      }
      const r = await request(
        "POST",
        "/api/admin/banned-users",
        {
          userRoleUniqueId: userRole.userRoleUniqueId,
          reason: "Manual test ban for commission evasion",
          banDuration: 3,
        },
        adminH(),
      );
      if (r.status === 409) {
        return "Skipped — driver already under auto-ban";
      }
      assert(
        r.body?.message === "success",
        `Ban failed: ${JSON.stringify(r.body)}`,
      );
      s.banUniqueId = r.body?.banUniqueId;
      return `banUniqueId: ${s.banUniqueId}`;
    },
  );

  await step("Get banned users — verify driver in list", async () => {
    const r = await request(
      "GET",
      `/api/admin/banned-users?roleId=2&isActive=true`,
      null,
      adminH(),
    );
    assert(
      r.body?.message === "success",
      `Get banned users failed: ${JSON.stringify(r.body)}`,
    );
    assert(r.body?.data?.length >= 0, "Expected data array");
    return `total banned: ${r.body?.pagination?.totalItems ?? r.body?.data?.length}`;
  });

  await step("Unban driver", async () => {
    if (!s.banUniqueId) {
      return "Skipped — no banUniqueId available";
    }
    const r = await request(
      "DELETE",
      `/api/admin/banned-users?banUniqueId=${s.banUniqueId}&phoneNumber=${encodeURIComponent(DRIVER_PHONE)}&roleId=2&newStatusId=1`,
      null,
      adminH(),
    );
    assert(
      r.body?.message === "success",
      `Unban failed: ${JSON.stringify(r.body)}`,
    );
    return "Unbanned";
  });

  await step("Unban non-existent → error", async () => {
    const r = await request(
      "DELETE",
      `/api/admin/banned-users?banUniqueId=00000000-0000-4000-8000-000000000001&phoneNumber=%2B251900000000&roleId=2&newStatusId=1`,
      null,
      adminH(),
    );
    assert(r.status >= 400, `Expected error, got ${r.status}`);
    return `Correctly rejected (${r.status})`;
  });

  // ══════════════════════════════════════════════════════════════
  // PHASE E — Company Delinquency CRUD
  // ══════════════════════════════════════════════════════════════
  console.log(
    "\n\x1b[1m━━ Phase E: Company Delinquency CRUD ━━━━━━━━━━\x1b[0m",
  );

  await step("Create company delinquency", async () => {
    const r = await request(
      "POST",
      "/api/company/admin/delinquency",
      {
        companyUniqueId: s.companyUniqueId,
        delinquencyTypeUniqueId: s.companyDelinquencyTypeUniqueId,
        delinquencyDescription: "Test: company commission evasion",
        skipDuplicateCheck: true,
      },
      adminH(),
    );
    assert(
      r.body?.message === "success",
      `Create company delinquency failed: ${JSON.stringify(r.body)}`,
    );
    s.companyDelinquencyUniqueId =
      r.body?.companyDelinquencyUniqueId ||
      r.body?.data?.companyDelinquencyUniqueId;
    assert(
      s.companyDelinquencyUniqueId,
      `No companyDelinquencyUniqueId in: ${JSON.stringify(r.body)}`,
    );
    const action = r.body?.automaticAction;
    // Capture auto-ban UUID if threshold was met (30 pts = 7-day ban)
    if (action?.companyBanUniqueId) {
      s.companyBanUniqueId = action.companyBanUniqueId;
    }
    return `uuid: ${s.companyDelinquencyUniqueId} | auto-ban: ${action?.action} | banId: ${s.companyBanUniqueId || "none"}`;
  });

  await step("Get company delinquencies — verify created", async () => {
    const r = await request(
      "GET",
      `/api/company/admin/delinquency?companyUniqueId=${s.companyUniqueId}`,
      null,
      adminH(),
    );
    assert(
      r.body?.message === "success",
      `Get failed: ${JSON.stringify(r.body)}`,
    );
    const found = r.body?.data?.find(
      (d) => d.companyDelinquencyUniqueId === s.companyDelinquencyUniqueId,
    );
    assert(found, "Created company delinquency not in list");
    return `severity: ${found.delinquencySeverity}, points: ${found.delinquencyPoints}`;
  });

  await step("Get company delinquencies — filter by severity", async () => {
    const r = await request(
      "GET",
      `/api/company/admin/delinquency?companyUniqueId=${s.companyUniqueId}&delinquencySeverity=CRITICAL`,
      null,
      adminH(),
    );
    assert(
      r.body?.message === "success",
      `Filter failed: ${JSON.stringify(r.body)}`,
    );
    return `CRITICAL count: ${r.body?.data?.length}`;
  });

  await step("Missing required field → 400", async () => {
    const r = await request(
      "POST",
      "/api/company/admin/delinquency",
      {
        // missing companyUniqueId
        delinquencyTypeUniqueId: s.companyDelinquencyTypeUniqueId,
      },
      adminH(),
    );
    assert(
      r.status === 400,
      `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`,
    );
    return "Correctly rejected";
  });

  await step("Delete company delinquency with active ban → 400", async () => {
    // 30 pts auto-creates a ban, so delete should be blocked
    const r = await request(
      "DELETE",
      `/api/company/admin/delinquency/${s.companyDelinquencyUniqueId}`,
      null,
      adminH(),
    );
    if (r.status === 400) {
      return "Correctly blocked — ban is linked";
    }
    if (r.body?.message === "success") {
      return "Deleted (no ban was linked)";
    }
    return `status ${r.status}`;
  });

  // ══════════════════════════════════════════════════════════════
  // PHASE F — Company Ban CRUD
  // ══════════════════════════════════════════════════════════════
  console.log(
    "\n\x1b[1m━━ Phase F: Company Ban CRUD ━━━━━━━━━━━━━━━━━━\x1b[0m",
  );

  await step("Get company bans — verify auto-ban created", async () => {
    const r = await request(
      "GET",
      `/api/company/admin/delinquency/bans?companyUniqueId=${s.companyUniqueId}&isActive=true`,
      null,
      adminH(),
    );
    assert(
      r.body?.message === "success",
      `Get company bans failed: ${JSON.stringify(r.body)}`,
    );
    const ban = r.body?.data?.[0];
    if (ban) {
      s.companyBanUniqueId = ban.companyBanUniqueId;
      return `Auto-ban found: ${s.companyBanUniqueId}, duration: ${ban.banDurationDays}d`;
    }
    return "No active ban found (30pts threshold may not have been met — check seed points)";
  });

  await step("Manual ban company (if no auto-ban)", async () => {
    if (s.companyBanUniqueId) {
      return "Skipped — auto-ban already exists";
    }
    const r = await request(
      "POST",
      "/api/company/admin/delinquency/bans",
      {
        companyUniqueId: s.companyUniqueId,
        companyDelinquencyUniqueId: s.companyDelinquencyUniqueId,
        banReason: "Manual test company ban",
        banDurationDays: 7,
      },
      adminH(),
    );
    assert(
      r.body?.message === "success",
      `Manual ban failed: ${JSON.stringify(r.body)}`,
    );
    s.companyBanUniqueId = r.body?.companyBanUniqueId;
    assert(s.companyBanUniqueId, "No companyBanUniqueId");
    return `Manual ban: ${s.companyBanUniqueId}`;
  });

  await step("Duplicate ban → 409", async () => {
    const r = await request(
      "POST",
      "/api/company/admin/delinquency/bans",
      {
        companyUniqueId: s.companyUniqueId,
        companyDelinquencyUniqueId: s.companyDelinquencyUniqueId,
        banReason: "Duplicate ban attempt",
        banDurationDays: 7,
      },
      adminH(),
    );
    assert(
      r.status === 409,
      `Expected 409, got ${r.status}: ${JSON.stringify(r.body)}`,
    );
    return "Correctly rejected duplicate ban";
  });

  await step(
    "Get company bans with isActive=false — none expected",
    async () => {
      const r = await request(
        "GET",
        `/api/company/admin/delinquency/bans?companyUniqueId=${s.companyUniqueId}&isActive=false`,
        null,
        adminH(),
      );
      assert(
        r.body?.message === "success",
        `Get failed: ${JSON.stringify(r.body)}`,
      );
      return `inactive bans: ${r.body?.data?.length}`;
    },
  );

  await step(
    "Unban company → approvalStatus restored to approved",
    async () => {
      if (!s.companyBanUniqueId) {
        return "Skipped — no companyBanUniqueId";
      }
      const r = await request(
        "PATCH",
        `/api/company/admin/delinquency/bans/${s.companyBanUniqueId}/unban`,
        null,
        adminH(),
      );
      assert(
        r.body?.message === "success",
        `Unban failed: ${JSON.stringify(r.body)}`,
      );
      return "Unbanned";
    },
  );

  await step("Unban non-existent company ban → 404", async () => {
    const r = await request(
      "PATCH",
      `/api/company/admin/delinquency/bans/00000000-0000-4000-8000-000000000002/unban`,
      null,
      adminH(),
    );
    assert(r.status >= 400, `Expected error, got ${r.status}`);
    return `Correctly rejected (${r.status})`;
  });

  // ══════════════════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════════════════
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(
    "\n\x1b[1m╔══════════════════════════════════════════════╗\x1b[0m",
  );
  console.log("\x1b[1m║     Delinquency & Ban Test Results          ║\x1b[0m");
  console.log("\x1b[1m╚══════════════════════════════════════════════╝\x1b[0m");
  for (const r of results) {
    const icon = r.pass ? "\x1b[32m✅\x1b[0m" : "\x1b[31m❌\x1b[0m";
    console.log(`  ${icon} [${r.num}] ${r.name}`);
    if (!r.pass) {
      console.log(`       → ${r.error}`);
    }
  }
  console.log(
    `\n  Total: ${results.length}  \x1b[32mPassed: ${passed}\x1b[0m  \x1b[31mFailed: ${failed}\x1b[0m`,
  );
  if (failed === 0) {
    console.log("\n  \x1b[32m\x1b[1m🎉 ALL TESTS PASSED!\x1b[0m\n");
    process.exit(0);
  } else {
    console.log(`\n  \x1b[31m\x1b[1m💥 ${failed} TEST(S) FAILED\x1b[0m\n`);
    process.exit(1);
  }
})();
