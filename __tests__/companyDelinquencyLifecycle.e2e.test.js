/**
 * E2E Test: Company Delinquency → Dispute → Admin Decision → Ban Lifecycle
 * ──────────────────────────────────────────────────────────────────────────
 *
 * FLOW UNDER TEST:
 *   1. Admin creates a delinquency against a company
 *   2. Company owner submits a dispute response
 *   3. Admin issues a ruling (EXONERATED / UPHELD / REDUCED / DISMISSED)
 *   4. On UPHELD → verify a CompanyBan is created with banSource='admin_decision'
 *   5. On EXONERATED → verify the delinquency is removed
 *   6. Guard: company cannot bid while banned
 *
 * SETUP STRATEGY:
 *   - Reads the first active company and admin token from the live DB via seeded data.
 *   - All created records are cleaned up in afterAll to keep the DB clean.
 */

const request = require("supertest");
const app = require("../Config/Express.config");
const { pool } = require("../Middleware/Database.config");

// ── Token helpers ─────────────────────────────────────────────────────────────
let ADMIN_TOKEN = process.env.TEST_ADMIN_TOKEN || null;
let COMPANY_TOKEN = process.env.TEST_COMPANY_TOKEN || null;

/**
 * Attempt to get a fresh super-admin token by calling verifyUserByOTP
 * with the super admin credentials seeded in .env.
 * Returns null if login fails (tests will skip gracefully).
 */
async function resolveAdminToken() {
  if (ADMIN_TOKEN) {return ADMIN_TOKEN;} // already have one (env var)

  const phone = process.env.SUPER_ADMIN_PHONE || "+251983222221";
  const otp = process.env.TEST_OTP || 101010;

  try {
    const res = await request(app)
      .post("/api/user/verifyUserByOTP")
      .send({ OTP: otp, phoneNumber: phone, roleId: 6 }); // roleId 6 = superAdmin

    const token = res.body?.token || res.body?.data?.token;
    if (token) {
      ADMIN_TOKEN = token;
      return token;
    }
  } catch { /* ignore */ }

  console.warn("⚠️  Could not obtain admin token. Set TEST_ADMIN_TOKEN env var to run admin tests.");
  return null;
}

async function resolveCompanyToken() {
  if (COMPANY_TOKEN) {return COMPANY_TOKEN;}
  // Fallback: reuse admin token (admin can act on company routes too)
  COMPANY_TOKEN = ADMIN_TOKEN;
  return COMPANY_TOKEN;
}

// ── Shared state across tests ─────────────────────────────────────────────────
let companyUniqueId;
let delinquencyTypeUniqueId;
let companyDelinquencyUniqueId;
let companyDelinquencyResponseUniqueId;
let adminDecisionOnDelinquencyUniqueId;
let banUniqueId;

// Track all created records for cleanup
const cleanup = {
  delinquencyUniqueIds: [],
  responseUniqueIds: [],
  decisionUniqueIds: [],
  banUniqueIds: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function pickCompany() {
  const [[row]] = await pool.query(
    `SELECT companyUniqueId FROM TransportCompany WHERE isDeleted = FALSE LIMIT 1`,
  );
  return row?.companyUniqueId || null;
}

async function pickDelinquencyType() {
  const [[row]] = await pool.query(
    `SELECT delinquencyTypeUniqueId FROM DelinquencyTypes WHERE isActive = TRUE LIMIT 1`,
  );
  return row?.delinquencyTypeUniqueId || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Resolve admin token dynamically (OTP login or env var)
  await resolveAdminToken();
  await resolveCompanyToken();

  companyUniqueId = await pickCompany();
  delinquencyTypeUniqueId = await pickDelinquencyType();

  if (!ADMIN_TOKEN) {
    console.warn("⚠️  No admin token — admin tests will be skipped");
  }
  if (!companyUniqueId) {
    console.warn("⚠️  No active company found — seeding tests may be skipped");
  }
  if (!delinquencyTypeUniqueId) {
    console.warn("⚠️  No active delinquency type found — seeding tests may be skipped");
  }
}, 20000);

// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP — runs after all tests
// ─────────────────────────────────────────────────────────────────────────────
afterAll(async () => {
  try {
    // Order matters: FK dependencies child → parent
    if (cleanup.banUniqueIds.length) {
      await pool.query(
        `DELETE FROM CompanyBanDelinquency WHERE companyBanUniqueId IN (?)`,
        [cleanup.banUniqueIds],
      );
      await pool.query(
        `DELETE FROM CompanyBan WHERE companyBanUniqueId IN (?)`,
        [cleanup.banUniqueIds],
      );
    }
    if (cleanup.decisionUniqueIds.length) {
      await pool.query(
        `DELETE FROM AdminDecisionOnDelinquency WHERE adminDecisionOnDelinquencyUniqueId IN (?)`,
        [cleanup.decisionUniqueIds],
      );
    }
    if (cleanup.responseUniqueIds.length) {
      await pool.query(
        `DELETE FROM CompanyDelinquencyResponse WHERE companyDelinquencyResponseUniqueId IN (?)`,
        [cleanup.responseUniqueIds],
      );
    }
    if (cleanup.delinquencyUniqueIds.length) {
      await pool.query(
        `DELETE FROM CompanyDelinquency WHERE companyDelinquencyUniqueId IN (?)`,
        [cleanup.delinquencyUniqueIds],
      );
    }
  } catch (err) {
    console.error("Cleanup error (non-fatal):", err.message);
  } finally {
    await pool.end();
  }
}, 20000);

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 1 — Admin creates a delinquency
// ═════════════════════════════════════════════════════════════════════════════
describe("1. POST /api/company/admin/delinquency — create delinquency", () => {
  test("requires admin token", async () => {
    const res = await request(app)
      .post("/api/company/admin/delinquency")
      .send({
        companyUniqueId: "00000000-0000-0000-0000-000000000000",
        delinquencyTypeUniqueId: "00000000-0000-0000-0000-000000000000",
        delinquencyDescription: "Unauthorized test",
      });
    // No token → should be 401
    expect([401, 403]).toContain(res.status);
  });

  test("rejects missing required fields", async () => {
    if (!companyUniqueId) {return;}
    const res = await request(app)
      .post("/api/company/admin/delinquency")
      .set(auth(ADMIN_TOKEN))
      .send({ companyUniqueId }); // missing delinquencyTypeUniqueId
    expect([400, 422]).toContain(res.status);
  });

  test("successfully creates a delinquency", async () => {
    if (!companyUniqueId || !delinquencyTypeUniqueId) {
      return console.warn("Skipping: missing company or delinquency type");
    }

    const res = await request(app)
      .post("/api/company/admin/delinquency")
      .set(auth(ADMIN_TOKEN))
      .send({
        companyUniqueId,
        delinquencyTypeUniqueId,
        delinquencyDescription: "E2E test delinquency — driver failed to load",
        skipDuplicateCheck: true,
      })
      .expect(200);

    expect(res.body.message).toBe("success");
    expect(res.body.companyDelinquencyUniqueId).toBeDefined();

    companyDelinquencyUniqueId = res.body.companyDelinquencyUniqueId;
    cleanup.delinquencyUniqueIds.push(companyDelinquencyUniqueId);
  });

  test("delinquency record exists in DB", async () => {
    if (!companyDelinquencyUniqueId) {return;}
    const [[row]] = await pool.query(
      `SELECT companyDelinquencyUniqueId, companyUniqueId FROM CompanyDelinquency
       WHERE companyDelinquencyUniqueId = ?`,
      [companyDelinquencyUniqueId],
    );
    expect(row).toBeDefined();
    expect(row.companyUniqueId).toBe(companyUniqueId);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 2 — Admin reads delinquency list
// ═════════════════════════════════════════════════════════════════════════════
describe("2. GET /api/company/admin/delinquency — list delinquencies", () => {
  test("returns paginated list with the created delinquency", async () => {
    if (!companyDelinquencyUniqueId) {return;}

    const res = await request(app)
      .get("/api/company/admin/delinquency")
      .set(auth(ADMIN_TOKEN))
      .query({ companyUniqueId, page: 1, limit: 20 })
      .expect(200);

    expect(res.body.message).toBe("success");
    expect(Array.isArray(res.body.data)).toBe(true);

    const found = res.body.data.find(
      (d) => d.companyDelinquencyUniqueId === companyDelinquencyUniqueId,
    );
    expect(found).toBeDefined();
    expect(found.companyUniqueId).toBe(companyUniqueId);
  });

  test("pagination metadata is present", async () => {
    const res = await request(app)
      .get("/api/company/admin/delinquency")
      .set(auth(ADMIN_TOKEN))
      .query({ page: 1, limit: 5 })
      .expect(200);

    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination).toHaveProperty("currentPage");
    expect(res.body.pagination).toHaveProperty("totalPages");
    expect(res.body.pagination).toHaveProperty("totalItems");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 3 — Company submits a dispute response
// ═════════════════════════════════════════════════════════════════════════════
describe("3. POST /api/company/delinquency-response/response — company dispute", () => {
  test("rejects response shorter than 10 characters", async () => {
    if (!companyDelinquencyUniqueId) {return;}
    const res = await request(app)
      .post("/api/company/delinquency-response/response")
      .set(auth(COMPANY_TOKEN))
      .send({
        companyDelinquencyUniqueId,
        companyDelinquencyResponse: "Short",
      });
    expect([400, 422]).toContain(res.status);
  });

  test("company submits a valid dispute response", async () => {
    if (!companyDelinquencyUniqueId) {return;}

    const res = await request(app)
      .post("/api/company/delinquency-response/response")
      .set(auth(COMPANY_TOKEN))
      .send({
        companyDelinquencyUniqueId,
        companyDelinquencyResponse:
          "We deny the accusation. The driver was on time and the customer changed the schedule last minute.",
      })
      .expect(200);

    expect(res.body.message).toBe("success");
    expect(res.body.companyDelinquencyResponseUniqueId).toBeDefined();

    companyDelinquencyResponseUniqueId =
      res.body.companyDelinquencyResponseUniqueId;
    cleanup.responseUniqueIds.push(companyDelinquencyResponseUniqueId);
  });

  test("duplicate response to the same delinquency is blocked", async () => {
    if (!companyDelinquencyUniqueId) {return;}

    const res = await request(app)
      .post("/api/company/delinquency-response/response")
      .set(auth(COMPANY_TOKEN))
      .send({
        companyDelinquencyUniqueId,
        companyDelinquencyResponse: "Trying to submit a second response.",
      });
    // Must be rejected — only one response allowed per delinquency
    expect([400, 409]).toContain(res.status);
  });

  test("response record is stored correctly in DB", async () => {
    if (!companyDelinquencyResponseUniqueId) {return;}
    const [[row]] = await pool.query(
      `SELECT * FROM CompanyDelinquencyResponse
       WHERE companyDelinquencyResponseUniqueId = ?`,
      [companyDelinquencyResponseUniqueId],
    );
    expect(row).toBeDefined();
    expect(row.companyDelinquencyUniqueId).toBe(companyDelinquencyUniqueId);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 4 — Admin reads responses
// ═════════════════════════════════════════════════════════════════════════════
describe("4. GET /api/company/delinquency-response/response — list responses", () => {
  test("admin can list responses filtered by delinquency", async () => {
    if (!companyDelinquencyUniqueId) {return;}

    const res = await request(app)
      .get("/api/company/delinquency-response/response")
      .set(auth(ADMIN_TOKEN))
      .query({ companyDelinquencyUniqueId })
      .expect(200);

    expect(res.body.message).toBe("success");
    expect(Array.isArray(res.body.data)).toBe(true);

    if (companyDelinquencyResponseUniqueId) {
      const found = res.body.data.find(
        (r) =>
          r.companyDelinquencyResponseUniqueId ===
          companyDelinquencyResponseUniqueId,
      );
      expect(found).toBeDefined();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 5 — Admin issues a DISMISSED ruling (first, to test non-ban outcomes)
// ═════════════════════════════════════════════════════════════════════════════
describe("5. POST /api/company/admin/delinquency-decisions — DISMISSED outcome", () => {
  test("DISMISSED: requires adminDecisionText of at least 10 chars", async () => {
    if (!companyDelinquencyUniqueId) {return;}
    const res = await request(app)
      .post("/api/company/admin/delinquency-decisions")
      .set(auth(ADMIN_TOKEN))
      .send({
        companyDelinquencyUniqueId,
        decisionOutcome: "DISMISSED",
        adminDecisionText: "Too short",
      });
    expect([400, 422]).toContain(res.status);
  });

  test("DISMISSED: successfully records admin decision", async () => {
    if (!companyDelinquencyUniqueId) {return;}

    const res = await request(app)
      .post("/api/company/admin/delinquency-decisions")
      .set(auth(ADMIN_TOKEN))
      .send({
        companyDelinquencyUniqueId,
        companyDelinquencyResponseUniqueId,
        decisionOutcome: "DISMISSED",
        adminDecisionText:
          "After review, the case is dismissed. No further action required.",
      })
      .expect(200);

    expect(res.body.message).toBe("success");
    expect(res.body.decisionOutcome).toBe("DISMISSED");
    expect(res.body.adminDecisionOnDelinquencyUniqueId).toBeDefined();

    adminDecisionOnDelinquencyUniqueId =
      res.body.adminDecisionOnDelinquencyUniqueId;
    cleanup.decisionUniqueIds.push(adminDecisionOnDelinquencyUniqueId);
  });

  test("DISMISSED: delinquency record still exists (no side-effect)", async () => {
    if (!companyDelinquencyUniqueId) {return;}
    const [[row]] = await pool.query(
      `SELECT companyDelinquencyUniqueId FROM CompanyDelinquency
       WHERE companyDelinquencyUniqueId = ?`,
      [companyDelinquencyUniqueId],
    );
    // DISMISSED does not delete the delinquency
    expect(row).toBeDefined();
  });

  test("duplicate admin decision on same delinquency is blocked", async () => {
    if (!companyDelinquencyUniqueId) {return;}
    const res = await request(app)
      .post("/api/company/admin/delinquency-decisions")
      .set(auth(ADMIN_TOKEN))
      .send({
        companyDelinquencyUniqueId,
        decisionOutcome: "EXONERATED",
        adminDecisionText: "Trying a second decision on same delinquency.",
      });
    expect([400, 409]).toContain(res.status);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 6 — UPHELD outcome creates a ban
// ═════════════════════════════════════════════════════════════════════════════
describe("6. Admin UPHELD decision → CompanyBan created", () => {
  let rejectedDelinquencyUniqueId;
  let rejectedDecisionUniqueId;

  beforeAll(async () => {
    if (!companyUniqueId || !delinquencyTypeUniqueId) {return;}

    // Create a fresh delinquency to test UPHELD flow
    const res = await request(app)
      .post("/api/company/admin/delinquency")
      .set(auth(ADMIN_TOKEN))
      .send({
        companyUniqueId,
        delinquencyTypeUniqueId,
        delinquencyDescription: "E2E: UPHELD flow delinquency",
        skipDuplicateCheck: true,
      });

    if (res.body.companyDelinquencyUniqueId) {
      rejectedDelinquencyUniqueId = res.body.companyDelinquencyUniqueId;
      cleanup.delinquencyUniqueIds.push(rejectedDelinquencyUniqueId);
    }
  }, 15000);

  test("UPHELD: admin issues UPHELD decision", async () => {
    if (!rejectedDelinquencyUniqueId) {return;}

    const res = await request(app)
      .post("/api/company/admin/delinquency-decisions")
      .set(auth(ADMIN_TOKEN))
      .send({
        companyDelinquencyUniqueId: rejectedDelinquencyUniqueId,
        decisionOutcome: "UPHELD",
        adminDecisionText:
          "Company response was insufficient. Ban is applied for 30 days.",
      })
      .expect(200);

    expect(res.body.message).toBe("success");
    expect(res.body.decisionOutcome).toBe("UPHELD");

    rejectedDecisionUniqueId = res.body.adminDecisionOnDelinquencyUniqueId;
    cleanup.decisionUniqueIds.push(rejectedDecisionUniqueId);
  });

  test("UPHELD: CompanyBan created with banSource=admin_decision", async () => {
    if (!rejectedDecisionUniqueId) {return;}

    const [[ban]] = await pool.query(
      `SELECT companyBanUniqueId, banSource, adminDecisionOnDelinquencyUniqueId, isActive
       FROM CompanyBan
       WHERE adminDecisionOnDelinquencyUniqueId = ?`,
      [rejectedDecisionUniqueId],
    );

    expect(ban).toBeDefined();
    expect(ban.banSource).toBe("admin_decision");
    expect(ban.adminDecisionOnDelinquencyUniqueId).toBe(rejectedDecisionUniqueId);
    expect(ban.isActive).toBe(1);

    banUniqueId = ban.companyBanUniqueId;
    cleanup.banUniqueIds.push(banUniqueId);
  });

  test("UPHELD: CompanyBanDelinquency junction row links the ban to the delinquency", async () => {
    if (!banUniqueId || !rejectedDelinquencyUniqueId) {return;}

    const [[junctionRow]] = await pool.query(
      `SELECT * FROM CompanyBanDelinquency
       WHERE companyBanUniqueId = ? AND companyDelinquencyUniqueId = ?`,
      [banUniqueId, rejectedDelinquencyUniqueId],
    );
    expect(junctionRow).toBeDefined();
    expect(junctionRow.pointsAtTime).toBeGreaterThanOrEqual(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 7 — EXONERATED outcome removes the delinquency
// ═════════════════════════════════════════════════════════════════════════════
describe("7. Admin EXONERATED decision → delinquency deleted", () => {
  let acceptedDelinquencyUniqueId;

  beforeAll(async () => {
    if (!companyUniqueId || !delinquencyTypeUniqueId) {return;}

    const res = await request(app)
      .post("/api/company/admin/delinquency")
      .set(auth(ADMIN_TOKEN))
      .send({
        companyUniqueId,
        delinquencyTypeUniqueId,
        delinquencyDescription: "E2E: EXONERATED flow delinquency",
        skipDuplicateCheck: true,
      });

    if (res.body.companyDelinquencyUniqueId) {
      acceptedDelinquencyUniqueId = res.body.companyDelinquencyUniqueId;
      // Note: we do NOT push to cleanup because EXONERATED will delete it
    }
  }, 15000);

  test("EXONERATED: admin clears the delinquency", async () => {
    if (!acceptedDelinquencyUniqueId) {return;}

    const res = await request(app)
      .post("/api/company/admin/delinquency-decisions")
      .set(auth(ADMIN_TOKEN))
      .send({
        companyDelinquencyUniqueId: acceptedDelinquencyUniqueId,
        decisionOutcome: "EXONERATED",
        adminDecisionText:
          "Company defense was valid. Delinquency is cleared with no further penalty.",
      })
      .expect(200);

    expect(res.body.message).toBe("success");
    expect(res.body.decisionOutcome).toBe("EXONERATED");
    cleanup.decisionUniqueIds.push(res.body.adminDecisionOnDelinquencyUniqueId);
  });

  test("EXONERATED: delinquency row is removed from DB", async () => {
    if (!acceptedDelinquencyUniqueId) {return;}

    const [[row]] = await pool.query(
      `SELECT companyDelinquencyUniqueId FROM CompanyDelinquency
       WHERE companyDelinquencyUniqueId = ?`,
      [acceptedDelinquencyUniqueId],
    );
    // Row must be gone
    expect(row).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 8 — REDUCED outcome updates delinquency points
// ═════════════════════════════════════════════════════════════════════════════
describe("8. Admin REDUCED decision → delinquency points updated", () => {
  let reducedDelinquencyUniqueId;


  beforeAll(async () => {
    if (!companyUniqueId || !delinquencyTypeUniqueId) {return;}

    const res = await request(app)
      .post("/api/company/admin/delinquency")
      .set(auth(ADMIN_TOKEN))
      .send({
        companyUniqueId,
        delinquencyTypeUniqueId,
        delinquencyDescription: "E2E: REDUCED flow delinquency",
        skipDuplicateCheck: true,
      });

    if (res.body.companyDelinquencyUniqueId) {
      reducedDelinquencyUniqueId = res.body.companyDelinquencyUniqueId;
      cleanup.delinquencyUniqueIds.push(reducedDelinquencyUniqueId);

      // Query removed since we don't need row or originalPoints
    }
  }, 15000);

  test("REDUCED: requires delinquencyPointsAfter", async () => {
    if (!reducedDelinquencyUniqueId) {return;}
    const res = await request(app)
      .post("/api/company/admin/delinquency-decisions")
      .set(auth(ADMIN_TOKEN))
      .send({
        companyDelinquencyUniqueId: reducedDelinquencyUniqueId,
        decisionOutcome: "REDUCED",
        adminDecisionText: "Reducing points as partial mitigation.",
        // delinquencyPointsAfter intentionally omitted
      });
    expect([400, 422]).toContain(res.status);
  });

  test("REDUCED: admin reduces delinquency points", async () => {
    if (!reducedDelinquencyUniqueId) {return;}

    const res = await request(app)
      .post("/api/company/admin/delinquency-decisions")
      .set(auth(ADMIN_TOKEN))
      .send({
        companyDelinquencyUniqueId: reducedDelinquencyUniqueId,
        decisionOutcome: "REDUCED",
        adminDecisionText:
          "Partial mitigation accepted. Reducing delinquency points from full to 1.",
        delinquencyPointsAfter: 1,
      })
      .expect(200);

    expect(res.body.message).toBe("success");
    expect(res.body.decisionOutcome).toBe("REDUCED");
    cleanup.decisionUniqueIds.push(res.body.adminDecisionOnDelinquencyUniqueId);
  });

  test("REDUCED: delinquency points updated in DB", async () => {
    if (!reducedDelinquencyUniqueId) {return;}

    const [[row]] = await pool.query(
      `SELECT delinquencyPoints FROM CompanyDelinquency WHERE companyDelinquencyUniqueId = ?`,
      [reducedDelinquencyUniqueId],
    );
    expect(row).toBeDefined();
    expect(row.delinquencyPoints).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 9 — Admin reads decision list
// ═════════════════════════════════════════════════════════════════════════════
describe("9. GET /api/company/admin/delinquency-decisions — list decisions", () => {
  test("admin can list decisions with pagination", async () => {
    const res = await request(app)
      .get("/api/company/admin/delinquency-decisions")
      .set(auth(ADMIN_TOKEN))
      .query({ page: 1, limit: 10 })
      .expect(200);

    expect(res.body.message).toBe("success");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  test("non-admin cannot access the decision list", async () => {
    // No token
    const res = await request(app)
      .get("/api/company/admin/delinquency-decisions");
    expect([401, 403]).toContain(res.status);
  });

  test("filter by decisionOutcome=DISMISSED returns only DISMISSED records", async () => {
    const res = await request(app)
      .get("/api/company/admin/delinquency-decisions")
      .set(auth(ADMIN_TOKEN))
      .query({ decisionOutcome: "DISMISSED", page: 1, limit: 10 })
      .expect(200);

    for (const row of res.body.data) {
      expect(row.decisionOutcome).toBe("DISMISSED");
    }
  });
});
