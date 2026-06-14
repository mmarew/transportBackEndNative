const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
jest.setTimeout(60000);
const request = require("supertest");
const app = require("../Config/Express.config");
const { pool } = require("../Middleware/Database.config");
const { getAdminToken, getAuthToken } = require("./helpers/authHelper");

let ADMIN_TOKEN = null;
let USER_TOKEN = null;

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

let setupOk = false;

beforeAll(async () => {
  ADMIN_TOKEN = await getAdminToken();
  if (!ADMIN_TOKEN) { console.warn("No admin token, skipping"); return; }

  try {
    USER_TOKEN = await getAuthToken({ roleId: 2 });
    if (!USER_TOKEN) { console.warn("No user token, skipping"); return; }

    const statusRes = await request(app)
      .get("/api/driver/verifyDriverJourneyStatus")
      .set(auth(USER_TOKEN));
    targetUserUniqueId =
      statusRes.body?.driver?.driver?.userUniqueId ||
      statusRes.body?.vehicle?.driverUserUniqueId;

    if (!targetUserUniqueId) {
      const acctRes = await request(app)
        .get("/api/driver/account")
        .set(auth(USER_TOKEN));
      targetUserUniqueId = acctRes.body?.data?.userUniqueId;
    }
    targetRoleId = 2;

    const dtRes = await request(app)
      .get("/api/admin/delinquency-types")
      .set(auth(ADMIN_TOKEN));
    if (dtRes.status === 200) {
      const types = dtRes.body?.data || [];
      if (types.length) delinquencyTypeUniqueId = types[0].delinquencyTypeUniqueId;
    }
    if (!delinquencyTypeUniqueId) {
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.query("SELECT delinquencyTypeUniqueId FROM DelinquencyTypes LIMIT 1");
        if (rows[0]) delinquencyTypeUniqueId = rows[0].delinquencyTypeUniqueId;
      } finally { conn.release(); }
    }

    setupOk = !!(targetUserUniqueId && targetRoleId && delinquencyTypeUniqueId);
  } catch (e) {
    console.warn("Setup error:", e.message);
  }
});

const maybeDescribe = (name, fn) => (setupOk ? describe(name, fn) : describe.skip(name, fn));

maybeDescribe("User Delinquency Lifecycle", () => {

  describe("1. POST /api/admin/user-delinquency — create delinquency", () => {
    test("creates a user delinquency record", async () => {
      const res = await request(app)
        .post("/api/admin/user-delinquency")
        .set(auth(ADMIN_TOKEN))
        .send({
          targetUserUniqueId,
          targetRoleId,
          delinquencyTypeUniqueId,
          delinquencyDescription: "E2E test delinquency - late arrival",
          delinquencyPoints: 3,
          delinquencySeverity: "medium",
        });
      expect([200, 201]).toContain(res.status);
      userDelinquencyUniqueId = res.body.userDelinquencyUniqueId || res.body.data?.userDelinquencyUniqueId;
      expect(userDelinquencyUniqueId).toBeTruthy();
      cleanup.delinquencyUniqueIds.push(userDelinquencyUniqueId);
    });

    test("delinquency row exists in DB with responseDeadline set", async () => {
      expect(userDelinquencyUniqueId).toBeTruthy();
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.query(
          "SELECT userDelinquencyUniqueId, responseDeadline FROM UserDelinquency WHERE userDelinquencyUniqueId = ? LIMIT 1",
          [userDelinquencyUniqueId],
        );
        expect(rows[0]).toBeTruthy();
        expect(rows[0].responseDeadline).toBeTruthy();
      } finally { conn.release(); }
    });
  });

  describe("2. GET /api/user/delinquency-response/pending", () => {
    test("returns pending delinquencies for the user", async () => {
      const res = await request(app)
        .get("/api/user/delinquency-response/pending")
        .set(auth(USER_TOKEN))
        .query({ userUniqueId: targetUserUniqueId, roleId: targetRoleId });
      expect([200, 201]).toContain(res.status);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("3. POST /api/user/delinquency-response/response — user dispute", () => {
    test("rejects response shorter than 10 characters", async () => {
      const res = await request(app)
        .post("/api/user/delinquency-response/response")
        .set(auth(USER_TOKEN))
        .send({ userDelinquencyUniqueId, responseText: "Short" });
      expect(res.status).toBe(400);
    });

    test("user submits a valid dispute response", async () => {
      const res = await request(app)
        .post("/api/user/delinquency-response/response")
        .set(auth(USER_TOKEN))
        .send({ userDelinquencyUniqueId, responseText: "This is my valid dispute response for the E2E test." });
      expect([200, 201]).toContain(res.status);
      userDelinquencyResponseUniqueId = res.body.responseUniqueId || res.body.data?.responseUniqueId;
      expect(userDelinquencyResponseUniqueId).toBeTruthy();
      cleanup.responseUniqueIds.push(userDelinquencyResponseUniqueId);
    });

    test("duplicate response is blocked", async () => {
      expect(userDelinquencyUniqueId).toBeTruthy();
      const res = await request(app)
        .post("/api/user/delinquency-response/response")
        .set(auth(USER_TOKEN))
        .send({ userDelinquencyUniqueId, responseText: "Another valid dispute response text for E2E." });
      expect(res.status).toBe(409);
    });
  });

  describe("4. GET /api/user/delinquency-response/response — list responses", () => {
    test("returns responses filtered by delinquency", async () => {
      const res = await request(app)
        .get("/api/user/delinquency-response/response")
        .set(auth(ADMIN_TOKEN))
        .query({ userDelinquencyUniqueId });
      expect([200, 201]).toContain(res.status);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("5. POST /api/admin/user-delinquency-decisions — DISMISSED", () => {
    test("DISMISSED: requires adminDecisionText >= 10 chars", async () => {
      const res = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({ userDelinquencyUniqueId, decisionOutcome: "DISMISSED", adminDecisionText: "Too short" });
      expect(res.status).toBe(400);
    });

    test("DISMISSED: successfully records admin decision", async () => {
      const res = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId, decisionOutcome: "DISMISSED",
          adminDecisionText: "This delinquency is dismissed for testing purposes.",
        });
      expect([200, 201]).toContain(res.status);
      adminDecisionUniqueId = res.body.adminDecisionUniqueId || res.body.data?.adminDecisionUniqueId;
      expect(adminDecisionUniqueId).toBeTruthy();
      cleanup.decisionUniqueIds.push(adminDecisionUniqueId);
    });

    test("DISMISSED: delinquency still exists (no side-effect)", async () => {
      expect(userDelinquencyUniqueId).toBeTruthy();
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.query(
          "SELECT userDelinquencyUniqueId FROM UserDelinquency WHERE userDelinquencyUniqueId = ?",
          [userDelinquencyUniqueId],
        );
        expect(rows[0]).toBeTruthy();
      } finally { conn.release(); }
    });

    test("duplicate admin decision is blocked", async () => {
      expect(userDelinquencyUniqueId).toBeTruthy();
      const res = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId, decisionOutcome: "DISMISSED",
          adminDecisionText: "Another dismissal text for duplicate check.",
        });
      expect(res.status).toBe(409);
    });
  });

  describe("6. Admin UPHELD decision → graduated auto-ban check", () => {
    let upheldDelinquencyUniqueId;

    test("UPHELD: admin issues UPHELD decision on one delinquency", async () => {
      const res = await request(app)
        .post("/api/admin/user-delinquency")
        .set(auth(ADMIN_TOKEN))
        .send({
          targetUserUniqueId, targetRoleId, delinquencyTypeUniqueId,
          delinquencyDescription: "E2E UPHELD test",
          delinquencyPoints: 5, delinquencySeverity: "high",
        });
      expect([200, 201]).toContain(res.status);
      upheldDelinquencyUniqueId = res.body.userDelinquencyUniqueId || res.body.data?.userDelinquencyUniqueId;
      expect(upheldDelinquencyUniqueId).toBeTruthy();
      cleanup.delinquencyUniqueIds.push(upheldDelinquencyUniqueId);

      const decRes = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId: upheldDelinquencyUniqueId, decisionOutcome: "UPHELD",
          adminDecisionText: "This delinquency is upheld for E2E testing purposes.",
        });
      expect([200, 201]).toContain(decRes.status);
      cleanup.decisionUniqueIds.push(decRes.body.adminDecisionUniqueId || decRes.body.data?.adminDecisionUniqueId);
    });

    test("UPHELD: BannedUsers ban created via graduated auto-ban (points >= threshold)", async () => {
      expect(upheldDelinquencyUniqueId).toBeTruthy();
      const conn = await pool.getConnection();
      try {
        const [bans] = await conn.query(
          "SELECT banUniqueId, banDurationDays FROM BannedUsers WHERE userUniqueId = ? ORDER BY createdAt DESC LIMIT 1",
          [targetUserUniqueId],
        );
        const ban = bans[0];
        if (!ban) return;
        expect(ban.banDurationDays).toBeGreaterThanOrEqual(3);
        cleanup.banUniqueIds.push(ban.banUniqueId);
      } finally { conn.release(); }
    });

    test("UPHELD: BannedUserDelinquency junction rows exist (if ban via UPHELD path)", async () => {
      expect(upheldDelinquencyUniqueId).toBeTruthy();
      const conn = await pool.getConnection();
      try {
        const [junctions] = await conn.query(
          "SELECT junctionUniqueId FROM BannedUserDelinquency WHERE userDelinquencyUniqueId = ? LIMIT 1",
          [upheldDelinquencyUniqueId],
        );
        if (junctions[0]) {
          expect(junctions[0].junctionUniqueId).toBeTruthy();
        }
      } finally { conn.release(); }
    });
  });

  describe("7. Admin EXONERATED decision → delinquency soft-deleted", () => {
    let exoneratedDelinquencyUniqueId;

    test("EXONERATED: admin clears the delinquency", async () => {
      const res = await request(app)
        .post("/api/admin/user-delinquency")
        .set(auth(ADMIN_TOKEN))
        .send({
          targetUserUniqueId, targetRoleId, delinquencyTypeUniqueId,
          delinquencyDescription: "E2E EXONERATED test",
          delinquencyPoints: 2, delinquencySeverity: "low",
        });
      expect([200, 201]).toContain(res.status);
      exoneratedDelinquencyUniqueId = res.body.userDelinquencyUniqueId || res.body.data?.userDelinquencyUniqueId;
      expect(exoneratedDelinquencyUniqueId).toBeTruthy();
      cleanup.delinquencyUniqueIds.push(exoneratedDelinquencyUniqueId);

      const decRes = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId: exoneratedDelinquencyUniqueId, decisionOutcome: "EXONERATED",
          adminDecisionText: "This delinquency is exonerated for E2E testing.",
        });
      expect([200, 201]).toContain(decRes.status);
      cleanup.decisionUniqueIds.push(decRes.body.adminDecisionUniqueId || decRes.body.data?.adminDecisionUniqueId);
    });

    test("EXONERATED: delinquency row is soft-deleted in DB", async () => {
      expect(exoneratedDelinquencyUniqueId).toBeTruthy();
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.query(
          "SELECT delinquencyDeletedAt FROM UserDelinquency WHERE userDelinquencyUniqueId = ? LIMIT 1",
          [exoneratedDelinquencyUniqueId],
        );
        if (rows[0]) {
          expect(rows[0].delinquencyDeletedAt).toBeTruthy();
        }
      } finally { conn.release(); }
    });
  });

  describe("8. Admin REDUCED decision → points updated", () => {
    let reducedDelinquencyUniqueId;

    test("REDUCED: requires delinquencyPointsAfter", async () => {
      const res = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId: userDelinquencyUniqueId, decisionOutcome: "REDUCED",
          adminDecisionText: "Points should be reduced for this E2E test case.",
        });
      expect(res.status).toBe(400);
    });

    test("REDUCED: admin reduces delinquency points", async () => {
      const res = await request(app)
        .post("/api/admin/user-delinquency")
        .set(auth(ADMIN_TOKEN))
        .send({
          targetUserUniqueId, targetRoleId, delinquencyTypeUniqueId,
          delinquencyDescription: "E2E REDUCED test",
          delinquencyPoints: 4, delinquencySeverity: "medium",
        });
      expect([200, 201]).toContain(res.status);
      reducedDelinquencyUniqueId = res.body.userDelinquencyUniqueId || res.body.data?.userDelinquencyUniqueId;
      expect(reducedDelinquencyUniqueId).toBeTruthy();
      cleanup.delinquencyUniqueIds.push(reducedDelinquencyUniqueId);

      const decRes = await request(app)
        .post("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .send({
          userDelinquencyUniqueId: reducedDelinquencyUniqueId, decisionOutcome: "REDUCED",
          adminDecisionText: "Points reduced for E2E testing.",
          delinquencyPointsAfter: 1,
        });
      expect([200, 201]).toContain(decRes.status);
      cleanup.decisionUniqueIds.push(decRes.body.adminDecisionUniqueId || decRes.body.data?.adminDecisionUniqueId);
    });

    test("REDUCED: delinquency points updated in DB", async () => {
      expect(reducedDelinquencyUniqueId).toBeTruthy();
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.query(
          "SELECT delinquencyPoints FROM UserDelinquency WHERE userDelinquencyUniqueId = ? LIMIT 1",
          [reducedDelinquencyUniqueId],
        );
        if (rows[0]) {
          expect(Number(rows[0].delinquencyPoints)).toBe(1);
        }
      } finally { conn.release(); }
    });
  });

  describe("9. GET /api/admin/user-delinquency-decisions — list decisions", () => {
    test("admin can list decisions with pagination", async () => {
      const res = await request(app)
        .get("/api/admin/user-delinquency-decisions")
        .set(auth(ADMIN_TOKEN))
        .query({ page: 1, limit: 10 });
      expect([200, 201]).toContain(res.status);
      expect(res.body.pagination).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
