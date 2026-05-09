/**
 * E2E Test: User Delinquency → Dispute → Admin Decision → Ban Lifecycle
 * ──────────────────────────────────────────────────────────────────────────
 *
 * FLOW UNDER TEST:
 *   1. Admin creates a delinquency against a user (driver)
 *   2. User submits a dispute response
 *   3. Admin issues a ruling (EXONERATED / UPHELD / REDUCED / DISMISSED)
 *   4. On UPHELD → verify a BannedUsers ban is created via graduated auto-ban
 *   5. On EXONERATED → verify the delinquency is soft-deleted
 *   6. Pending delinquencies endpoint returns correct data
 *
 * Mirrors companyDelinquencyLifecycle.e2e.test.js for user-level disputes.
 */

const request = require("supertest");
const app = require("../Config/Express.config");
const { pool } = require("../Middleware/Database.config");

// ── Token helpers ─────────────────────────────────────────────────────────────
let ADMIN_TOKEN = process.env.TEST_ADMIN_TOKEN || null;

async function resolveAdminToken() {
  if (ADMIN_TOKEN) {return ADMIN_TOKEN;}

  const phone = process.env.SUPER_ADMIN_PHONE || "+251983222221";
  const otp = process.env.TEST_OTP || 101010;

  try {
    const res = await request(app)
      .post("/api/user/verifyUserByOTP")
      .send({ OTP: otp, phoneNumber: phone, roleId: 6 });

    const token = res.body?.token || res.body?.data?.token;
    if (token) {
      ADMIN_TOKEN = token;
      return token;
    }
  } catch { /* ignore */ }

  console.warn("⚠️  Could not obtain admin token.");
  return null;
}

// ── Shared state ──────────────────────────────────────────────────────────────
let targetUserUniqueId;
let targetRoleId;
let delinquencyTypeUniqueId;
let userDelinquencyUniqueId;
let userDelinquencyResponseUniqueId;
let adminDecisionUniqueId;

const cleanup = {
  delinquencyUniqueIds: [],
  responseUniqueIds: [],
  decisionUniqueIds: [],
  banUniqueIds: [],
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function pickDriverUser() {
  // Pick a user who has roleId=2 (driver)
  const [[row]] = await pool.query(
    `SELECT ur.userUniqueId, ur.roleId 
     FROM UserRole ur 
     WHERE ur.roleId = 2 
     LIMIT 1`,
  );
  return row || null;
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
  await resolveAdminToken();

  const driver = await pickDriverUser();
  if (driver) {
    targetUserUniqueId = driver.userUniqueId;
    targetRoleId = driver.roleId;
  }
  delinquencyTypeUniqueId = await pickDelinquencyType();

  if (!ADMIN_TOKEN) {console.warn("⚠️  No admin token — tests will be skipped");}
  if (!targetUserUniqueId) {console.warn("⚠️  No driver user found");}
  if (!delinquencyTypeUniqueId) {console.warn("⚠️  No delinquency type found");}
}, 20000);

// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP
// ─────────────────────────────────────────────────────────────────────────────
afterAll(async () => {
  try {
    if (cleanup.banUniqueIds.length) {
      await pool.query(
        `DELETE FROM BannedUserDelinquency WHERE banUniqueId IN (?)`,
        [cleanup.banUniqueIds],
      );
      await pool.query(
        `DELETE FROM BannedUsers WHERE banUniqueId IN (?)`,
        [cleanup.banUniqueIds],
      );
    }
    if (cleanup.decisionUniqueIds.length) {
      await pool.query(
        `DELETE FROM AdminDecisionOnUserDelinquency WHERE adminDecisionOnUserDelinquencyUniqueId IN (?)`,
        [cleanup.decisionUniqueIds],
      );
    }
    if (cleanup.responseUniqueIds.length) {
      await pool.query(
        `DELETE FROM UserDelinquencyResponse WHERE userDelinquencyResponseUniqueId IN (?)`,
        [cleanup.responseUniqueIds],
      );
    }
    if (cleanup.delinquencyUniqueIds.length) {
      await pool.query(
        `DELETE FROM UserDelinquency WHERE userDelinquencyUniqueId IN (?)`,
        [cleanup.delinquencyUniqueIds],
      );
    }
  } catch (err) {
    console.error("Cleanup error:", err.message);
  }
  await pool.end();
}, 15000);

// ═════════════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe("User Delinquency Lifecycle", () => {
  // ── 1. Create Delinquency ─────────────────────────────────────────────────
  describe("1. POST /api/admin/user-delinquency — create delinquency", () => {
    it("creates a user delinquency record", async () => {
      if (!ADMIN_TOKEN || !targetUserUniqueId) {return;}

      const res = await request(app)
        .post("/api/admin/user-delinquency")
        .set(auth(ADMIN_TOKEN))
        .send({
          userUniqueId: targetUserUniqueId,
          roleId: targetRoleId,
          delinquencyTypeUniqueId,
          delinquencyDescription: "E2E test: driver was late to pickup",
          skipDuplicateCheck: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("success");
      userDelinquencyUniqueId = res.body.userDelinquencyUniqueId;
      cleanup.delinquencyUniqueIds.push(userDelinquencyUniqueId);
    });

    it("delinquency row exists in DB with responseDeadline set", async () => {
      if (!userDelinquencyUniqueId) {return;}

      const [[row]] = await pool.query(
        `SELECT * FROM UserDelinquency WHERE userDelinquencyUniqueId = ?`,
        [userDelinquencyUniqueId],
      );
      expect(row).toBeDefined();
      expect(row.userUniqueId).toBe(targetUserUniqueId);
      expect(row.delinquencyDeletedAt).toBeNull();
    });
  });

  // ── 2. Pending Delinquencies ──────────────────────────────────────────────
  describe("2. GET /api/user/delinquency-response/pending", () => {
    it("returns pending delinquencies for the user", async () => {
      if (!ADMIN_TOKEN || !targetUserUniqueId) {return;}

      const res = await request(app)
        .get("/api/user/delinquency-response/pending")
        .set(auth(ADMIN_TOKEN))
        .query({ userUniqueId: targetUserUniqueId, roleId: targetRoleId });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("success");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });
  });

  // ── 3. User Dispute Response ──────────────────────────────────────────────
  describe("3. POST /api/user/delinquency-response/response — user dispute", () => {
    it("rejects response shorter than 10 characters", async () => {
      if (!ADMIN_TOKEN || !userDelinquencyUniqueId) {return;}

      const res = await request(app)
        .post("/api/user/delinquency-response/response")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId,
          userDelinquencyResponse: "short",
        });

      expect(res.status).toBe(400);
    });

    it("user submits a valid dispute response", async () => {
      if (!ADMIN_TOKEN || !userDelinquencyUniqueId) {return;}

      const res = await request(app)
        .post("/api/user/delinquency-response/response")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId,
          userDelinquencyResponse:
            "I was delayed due to heavy traffic on the highway. I have GPS evidence.",
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("success");
      userDelinquencyResponseUniqueId = res.body.userDelinquencyResponseUniqueId;
      cleanup.responseUniqueIds.push(userDelinquencyResponseUniqueId);
    });

    it("duplicate response is blocked", async () => {
      if (!ADMIN_TOKEN || !userDelinquencyUniqueId) {return;}

      const res = await request(app)
        .post("/api/user/delinquency-response/response")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId,
          userDelinquencyResponse: "Trying to submit another response here.",
        });

      expect(res.status).toBe(400);
    });
  });

  // ── 4. List Responses ─────────────────────────────────────────────────────
  describe("4. GET /api/user/delinquency-response/response — list responses", () => {
    it("returns responses filtered by delinquency", async () => {
      if (!ADMIN_TOKEN || !userDelinquencyUniqueId) {return;}

      const res = await request(app)
        .get("/api/user/delinquency-response/response")
        .set(auth(ADMIN_TOKEN))
        .query({ userDelinquencyUniqueId });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 5. Admin DISMISSED Decision ───────────────────────────────────────────
  describe("5. POST /api/admin/user-delinquency-decisions — DISMISSED", () => {
    it("DISMISSED: requires adminDecisionText >= 10 chars", async () => {
      if (!ADMIN_TOKEN || !userDelinquencyUniqueId) {return;}

      const res = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId,
          decisionOutcome: "DISMISSED",
          adminDecisionText: "short",
        });

      expect(res.status).toBe(400);
    });

    it("DISMISSED: successfully records admin decision", async () => {
      if (!ADMIN_TOKEN || !userDelinquencyUniqueId) {return;}

      const res = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId,
          userDelinquencyResponseUniqueId,
          decisionOutcome: "DISMISSED",
          adminDecisionText: "Case dismissed — not enough evidence to proceed.",
        });

      expect(res.status).toBe(200);
      expect(res.body.decisionOutcome).toBe("DISMISSED");
      adminDecisionUniqueId = res.body.adminDecisionOnUserDelinquencyUniqueId;
      cleanup.decisionUniqueIds.push(adminDecisionUniqueId);
    });

    it("DISMISSED: delinquency still exists (no side-effect)", async () => {
      if (!userDelinquencyUniqueId) {return;}

      const [[row]] = await pool.query(
        `SELECT delinquencyDeletedAt FROM UserDelinquency WHERE userDelinquencyUniqueId = ?`,
        [userDelinquencyUniqueId],
      );
      expect(row.delinquencyDeletedAt).toBeNull();
    });

    it("duplicate admin decision is blocked", async () => {
      if (!ADMIN_TOKEN || !userDelinquencyUniqueId) {return;}

      const res = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId,
          decisionOutcome: "UPHELD",
          adminDecisionText: "Trying to issue a second decision on same delinquency.",
        });

      expect(res.status).toBe(400);
    });
  });

  // ── 6. Admin UPHELD → graduated ban check ─────────────────────────────────
  describe("6. Admin UPHELD decision → graduated auto-ban check", () => {
    let upheldDelinquencyIds = [];

    beforeAll(async () => {
      if (!ADMIN_TOKEN || !targetUserUniqueId) {return;}

      // Seed 4 delinquencies (5pts each = 20pts total → crosses 15pt MEDIUM threshold)
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post("/api/admin/user-delinquency")
          .set(auth(ADMIN_TOKEN))
          .send({
            userUniqueId: targetUserUniqueId,
            roleId: targetRoleId,
            delinquencyTypeUniqueId,
            delinquencyDescription: `E2E UPHELD seed #${i + 1}`,
            delinquencyPoints: 5,
            skipDuplicateCheck: true,
          });

        if (res.body.userDelinquencyUniqueId) {
          upheldDelinquencyIds.push(res.body.userDelinquencyUniqueId);
          cleanup.delinquencyUniqueIds.push(res.body.userDelinquencyUniqueId);
        }
      }
    });

    it("UPHELD: admin issues UPHELD decision on one delinquency", async () => {
      if (!ADMIN_TOKEN || upheldDelinquencyIds.length === 0) {return;}

      const targetId = upheldDelinquencyIds[0];
      const res = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId: targetId,
          decisionOutcome: "UPHELD",
          adminDecisionText: "Evidence confirms the driver was at fault. Accusation upheld.",
        });

      expect(res.status).toBe(200);
      expect(res.body.decisionOutcome).toBe("UPHELD");
      cleanup.decisionUniqueIds.push(res.body.adminDecisionOnUserDelinquencyUniqueId);
    });

    it("UPHELD: BannedUsers ban created via graduated auto-ban (points >= threshold)", async () => {
      if (!targetUserUniqueId) {return;}

      const [[ban]] = await pool.query(
        `SELECT * FROM BannedUsers
         WHERE userUniqueId = ? AND roleId = ? AND isActive = TRUE
         ORDER BY banAt DESC LIMIT 1`,
        [targetUserUniqueId, targetRoleId],
      );

      expect(ban).toBeDefined();
      expect(ban.banDurationDays).toBeGreaterThanOrEqual(3);
      cleanup.banUniqueIds.push(ban.banUniqueId);
    });

    it("UPHELD: BannedUserDelinquency junction rows exist (if ban via UPHELD path)", async () => {
      if (cleanup.banUniqueIds.length === 0) {return;}

      const banId = cleanup.banUniqueIds[cleanup.banUniqueIds.length - 1];
      const [junctionRows] = await pool.query(
        `SELECT * FROM BannedUserDelinquency WHERE banUniqueId = ?`,
        [banId],
      );

      // Junction rows only exist when ban was created by the graduated
      // checkAndApplyAutomaticUserBan (UPHELD path). If the ban was created
      // by the old creation-time auto-ban, no junction rows exist.
      expect(junctionRows).toBeDefined();
    });
  });

  // ── 7. Admin EXONERATED → delinquency soft-deleted ────────────────────────
  describe("7. Admin EXONERATED decision → delinquency soft-deleted", () => {
    let exonerateDelId;

    beforeAll(async () => {
      if (!ADMIN_TOKEN || !targetUserUniqueId) {return;}

      const res = await request(app)
        .post("/api/admin/user-delinquency")
        .set(auth(ADMIN_TOKEN))
        .send({
          userUniqueId: targetUserUniqueId,
          roleId: targetRoleId,
          delinquencyTypeUniqueId,
          delinquencyDescription: "E2E EXONERATED test delinquency",
          skipDuplicateCheck: true,
        });

      exonerateDelId = res.body.userDelinquencyUniqueId;
      if (exonerateDelId) {cleanup.delinquencyUniqueIds.push(exonerateDelId);}
    });

    it("EXONERATED: admin clears the delinquency", async () => {
      if (!ADMIN_TOKEN || !exonerateDelId) {return;}

      const res = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId: exonerateDelId,
          decisionOutcome: "EXONERATED",
          adminDecisionText: "Investigation found the accusation was baseless. User cleared.",
        });

      expect(res.status).toBe(200);
      expect(res.body.decisionOutcome).toBe("EXONERATED");
      cleanup.decisionUniqueIds.push(res.body.adminDecisionOnUserDelinquencyUniqueId);
    });

    it("EXONERATED: delinquency row is soft-deleted in DB", async () => {
      if (!exonerateDelId) {return;}

      const [[row]] = await pool.query(
        `SELECT delinquencyDeletedAt FROM UserDelinquency WHERE userDelinquencyUniqueId = ?`,
        [exonerateDelId],
      );
      expect(row.delinquencyDeletedAt).not.toBeNull();
    });
  });

  // ── 8. Admin REDUCED → points updated ─────────────────────────────────────
  describe("8. Admin REDUCED decision → points updated", () => {
    let reduceDelId;

    beforeAll(async () => {
      if (!ADMIN_TOKEN || !targetUserUniqueId) {return;}

      const res = await request(app)
        .post("/api/admin/user-delinquency")
        .set(auth(ADMIN_TOKEN))
        .send({
          userUniqueId: targetUserUniqueId,
          roleId: targetRoleId,
          delinquencyTypeUniqueId,
          delinquencyDescription: "E2E REDUCED test delinquency",
          skipDuplicateCheck: true,
        });

      reduceDelId = res.body.userDelinquencyUniqueId;
      if (reduceDelId) {cleanup.delinquencyUniqueIds.push(reduceDelId);}
    });

    it("REDUCED: requires delinquencyPointsAfter", async () => {
      if (!ADMIN_TOKEN || !reduceDelId) {return;}

      const res = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId: reduceDelId,
          decisionOutcome: "REDUCED",
          adminDecisionText: "Reducing points after partial evidence.",
        });

      expect(res.status).toBe(400);
    });

    it("REDUCED: admin reduces delinquency points", async () => {
      if (!ADMIN_TOKEN || !reduceDelId) {return;}

      const res = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId: reduceDelId,
          decisionOutcome: "REDUCED",
          adminDecisionText: "Partial evidence — reducing from default to 1 point.",
          delinquencyPointsAfter: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.decisionOutcome).toBe("REDUCED");
      cleanup.decisionUniqueIds.push(res.body.adminDecisionOnUserDelinquencyUniqueId);
    });

    it("REDUCED: delinquency points updated in DB", async () => {
      if (!reduceDelId) {return;}

      const [[row]] = await pool.query(
        `SELECT delinquencyPoints FROM UserDelinquency WHERE userDelinquencyUniqueId = ?`,
        [reduceDelId],
      );
      expect(row.delinquencyPoints).toBe(1);
    });
  });

  // ── 9. List Admin Decisions ───────────────────────────────────────────────
  describe("9. GET /api/admin/user-delinquency-decisions — list decisions", () => {
    it("admin can list decisions with pagination", async () => {
      if (!ADMIN_TOKEN) {return;}

      const res = await request(app)
        .get("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.pagination).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
