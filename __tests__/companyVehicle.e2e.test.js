/**
 * @file companyVehicle.e2e.test.js
 * @description E2E CRUD tests for the Company Fleet API (/api/company/fleet).
 *
 * ## What is tested
 *   C — POST   /api/company/fleet           → assign a vehicle to a company
 *   R — GET    /api/company/fleet           → list vehicles (with filters)
 *   D — DELETE /api/company/fleet/:id       → remove (soft-delete) a vehicle
 *
 * ## Environment variables (set in .env or .env.test)
 *   TEST_TOKEN             — pre-issued shipper/company JWT (required)
 *   TEST_ADMIN_TOKEN       — pre-issued admin JWT (required for GET tests)
 *   TEST_COMPANY_UNIQUE_ID — UUID of the company to test with (optional, has fallback)
 *   TEST_VEHICLE_UNIQUE_ID — UUID of the vehicle to assign    (optional, has fallback)
 *
 * ## Run
 *   npx jest companyVehicle.e2e --runInBand
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

jest.setTimeout(30000);

const request = require("supertest");
const app = require("../Config/Express.config");
const { getAuthToken } = require("./helpers/authHelper");

// ─── Shared state across tests ─────────────────────────────────────────────
let authToken = null; // shipper token — used for POST / DELETE
let adminToken = null; // admin token  — used for GET (bypasses CompanyMembership guard)
let createdCompanyVehicleUniqueId = null; // captured in CREATE, used in DELETE

// Pull seed IDs from env so we never hard-code real UUIDs in source control
const COMPANY_UNIQUE_ID =
  process.env.TEST_COMPANY_UNIQUE_ID || "62d10f8a-cb8a-45a2-8eac-ac0895491643";
const VEHICLE_UNIQUE_ID =
  process.env.TEST_VEHICLE_UNIQUE_ID || "d43883ae-7e2c-43c8-840a-153ea7f26872";

// ─── Auth setup ────────────────────────────────────────────────────────────
beforeAll(async () => {
  authToken = await getAuthToken();
  if (!authToken) {
    throw new Error("No auth token — set TEST_TOKEN in .env");
  }

  // Admin token for GET tests. GET /api/company/fleet enforces CompanyMembership,
  // so a plain shipper token returns 403. Set TEST_ADMIN_TOKEN in .env to a
  // pre-issued admin JWT. When not set, GET tests are skipped automatically.
  adminToken = process.env.TEST_ADMIN_TOKEN || null;
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Company Fleet CRUD — /api/company/fleet", () => {
  // ─── CREATE ───────────────────────────────────────────────────────────
  describe("POST /api/company/fleet (assign vehicle)", () => {
    test("should assign a vehicle without assignmentStartDate (defaults to today)", async () => {
      const res = await request(app)
        .post("/api/company/fleet")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          companyUniqueId: COMPANY_UNIQUE_ID,
          vehicleUniqueId: VEHICLE_UNIQUE_ID,
          // assignmentStartDate intentionally omitted — defaults to currentDate()
        })
        .expect((r) => {
          // 201 = newly assigned; 409 = already active (idempotent re-run)
          if (r.status !== 201 && r.status !== 409) {
            throw new Error(
              `Unexpected status ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      if (res.status === 201) {
        expect(res.body.message).toBe("success");
        expect(res.body.data).toBeDefined();
        createdCompanyVehicleUniqueId =
          res.body.data?.companyVehicleUniqueId ??
          res.body.data?.data?.companyVehicleUniqueId;
        expect(createdCompanyVehicleUniqueId).toBeTruthy();
      }
    });

    test("should assign a vehicle with an explicit assignmentStartDate", async () => {
      const futureDate = new Date(Date.now() + 86_400_000).toISOString();
      const res = await request(app)
        .post("/api/company/fleet")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          companyUniqueId: COMPANY_UNIQUE_ID,
          vehicleUniqueId: VEHICLE_UNIQUE_ID,
          assignmentStartDate: futureDate,
        })
        .expect((r) => {
          if (r.status !== 201 && r.status !== 409 && r.status !== 400) {
            throw new Error(
              `Unexpected status ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      if (res.status === 201) {
        expect(res.body.message).toBe("success");
        createdCompanyVehicleUniqueId =
          res.body.data?.companyVehicleUniqueId ??
          res.body.data?.data?.companyVehicleUniqueId ??
          createdCompanyVehicleUniqueId;
      }
    });

    test("should return 400 when companyUniqueId is missing", async () => {
      const res = await request(app)
        .post("/api/company/fleet")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ vehicleUniqueId: VEHICLE_UNIQUE_ID })
        .expect(400);

      const errorCode = res.body.error?.code ?? res.body.code;
      expect(errorCode).toBe("VALIDATION_ERROR");

      const fields =
        res.body.error?.details?.map((d) => d.field) ??
        res.body.details?.map((d) => d.field) ??
        [];
      expect(fields).toContain("companyUniqueId");
    });

    test("should return 400 when vehicleUniqueId is missing", async () => {
      const res = await request(app)
        .post("/api/company/fleet")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ companyUniqueId: COMPANY_UNIQUE_ID })
        .expect(400);

      const errorCode = res.body.error?.code ?? res.body.code;
      expect(errorCode).toBe("VALIDATION_ERROR");

      const fields =
        res.body.error?.details?.map((d) => d.field) ??
        res.body.details?.map((d) => d.field) ??
        [];
      expect(fields).toContain("vehicleUniqueId");
    });

    test("should return 401 when no auth token is provided", async () => {
      await request(app)
        .post("/api/company/fleet")
        .send({
          companyUniqueId: COMPANY_UNIQUE_ID,
          vehicleUniqueId: VEHICLE_UNIQUE_ID,
        })
        .expect(401);
    });
  });

  // ─── READ ─────────────────────────────────────────────────────────────
  // GET enforces CompanyMembership — a plain shipper token returns 403.
  // Provide TEST_ADMIN_TOKEN in .env to enable these tests.
  const describeGet = process.env.TEST_ADMIN_TOKEN ? describe : describe.skip;
  describeGet("GET /api/company/fleet (requires TEST_ADMIN_TOKEN)", () => {
    test("should list vehicles for a company", async () => {
      const res = await request(app)
        .get("/api/company/fleet")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ companyUniqueId: COMPANY_UNIQUE_ID })
        .expect(200);

      expect(res.body.message).toBe("success");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toMatchObject({
        page: expect.any(Number),
        limit: expect.any(Number),
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    test("each record should contain expected fields", async () => {
      const res = await request(app)
        .get("/api/company/fleet")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ companyUniqueId: COMPANY_UNIQUE_ID })
        .expect(200);

      const record = res.body.data?.[0];
      if (record) {
        expect(record).toHaveProperty("companyVehicleUniqueId");
        expect(record).toHaveProperty("vehicleUniqueId");
        expect(record).toHaveProperty("assignmentStatus");
        expect(record).toHaveProperty("assignmentStartDate");
        expect(record).toHaveProperty("licensePlate");
        expect(record).toHaveProperty("vehicleTypeName");
      }
    });

    test("should filter by assignmentStatus=active", async () => {
      const res = await request(app)
        .get("/api/company/fleet")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({
          companyUniqueId: COMPANY_UNIQUE_ID,
          assignmentStatus: "active",
        })
        .expect(200);

      expect(res.body.message).toBe("success");
      res.body.data?.forEach((record) => {
        expect(record.assignmentStatus).toBe("active");
      });
    });

    test("should respect pagination (page=1, limit=1)", async () => {
      const res = await request(app)
        .get("/api/company/fleet")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ companyUniqueId: COMPANY_UNIQUE_ID, page: 1, limit: 1 })
        .expect(200);

      expect(res.body.data.length).toBeLessThanOrEqual(1);
      expect(res.body.pagination.limit).toBe(1);
    });

    test("should return 401 when no auth token is provided", async () => {
      await request(app)
        .get("/api/company/fleet")
        .query({ companyUniqueId: COMPANY_UNIQUE_ID })
        .expect(401);
    });
  });

  // ─── DELETE ───────────────────────────────────────────────────────────
  describe("DELETE /api/company/fleet/:companyVehicleUniqueId", () => {
    test("should remove the vehicle assignment created in CREATE", async () => {
      if (!createdCompanyVehicleUniqueId) {
        console.warn(
          "Skipping DELETE — no ID captured from CREATE (vehicle already assigned).",
        );
        return;
      }
      const res = await request(app)
        .delete(`/api/company/fleet/${createdCompanyVehicleUniqueId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.message).toBe("success");
    });

    test("should return 400 when an invalid UUID is provided", async () => {
      await request(app)
        .delete("/api/company/fleet/not-a-valid-uuid")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);
    });

    test("should return 404 when a non-existent UUID is provided", async () => {
      await request(app)
        .delete("/api/company/fleet/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${authToken}`)
        .expect((r) => {
          if (r.status !== 404 && r.status !== 400) {
            throw new Error(`Expected 404 or 400, got ${r.status}`);
          }
        });
    });

    test("should return 401 when no auth token is provided", async () => {
      await request(app)
        .delete("/api/company/fleet/00000000-0000-0000-0000-000000000001")
        .expect(401);
    });
  });
});
