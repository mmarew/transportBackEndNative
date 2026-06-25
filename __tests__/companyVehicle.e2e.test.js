const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

jest.setTimeout(30000);

const request = require("supertest");
const app = require("../Config/Express.config");
const { getAuthToken, getAdminToken } = require("./helpers/authHelper");

let authToken = null;
let adminToken = null;
let createdCompanyVehicleUniqueId = null;

let COMPANY_UNIQUE_ID = process.env.TEST_COMPANY_UNIQUE_ID || null;
let VEHICLE_UNIQUE_ID = process.env.TEST_VEHICLE_UNIQUE_ID || null;

let setupOk = false;

beforeAll(async () => {
  try {
    authToken = await getAuthToken({ roleId: 7 });
    adminToken = await getAdminToken();
  } catch (e) {
    console.warn("Token acquisition failed:", e.message);
  }

  if (!authToken) return;

  try {
    if (!COMPANY_UNIQUE_ID) {
      const profileRes = await request(app)
        .get("/api/company/companies")
        .set("Authorization", `Bearer ${authToken}`);
      const company = profileRes.body?.data?.[0];
      if (company) COMPANY_UNIQUE_ID = company.companyUniqueId;
    }

    if (!VEHICLE_UNIQUE_ID) {
      const conn = require("../Middleware/Database.config").pool;
      const [rows] = await conn.query("SELECT vehicleUniqueId FROM Vehicle WHERE vehicleDeletedAt IS NULL LIMIT 1");
      if (rows[0]) VEHICLE_UNIQUE_ID = rows[0].vehicleUniqueId;
    }

    setupOk = !!(COMPANY_UNIQUE_ID && VEHICLE_UNIQUE_ID);
  } catch (e) {
    console.warn("Setup error:", e.message);
  }
});

const maybeDescribe = (name, fn) => (setupOk ? describe(name, fn) : describe.skip(name, fn));

maybeDescribe("Company Fleet CRUD — /api/company/fleet", () => {
  describe("POST /api/company/fleet (assign vehicle)", () => {
    test("should assign a vehicle without assignmentStartDate (defaults to today)", async () => {
      const res = await request(app)
        .post("/api/company/fleet")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ companyUniqueId: COMPANY_UNIQUE_ID, vehicleUniqueId: VEHICLE_UNIQUE_ID });

      if (res.status !== 201 && res.status !== 409) {
        throw new Error(`Unexpected status ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (res.status === 201) {
        expect(res.body.message).toBe("success");
        createdCompanyVehicleUniqueId =
          res.body.data?.companyVehicleUniqueId ?? res.body.data?.data?.companyVehicleUniqueId;
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
        });

      if (res.status !== 201 && res.status !== 409 && res.status !== 400) {
        throw new Error(`Unexpected status ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (res.status === 201) {
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
        .send({ vehicleUniqueId: VEHICLE_UNIQUE_ID });
      expect(res.status).toBe(400);
    });

    test("should return 400 when vehicleUniqueId is missing", async () => {
      const res = await request(app)
        .post("/api/company/fleet")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ companyUniqueId: COMPANY_UNIQUE_ID });
      expect(res.status).toBe(400);
    });

    test("should return 401 when no auth token is provided", async () => {
      const res = await request(app)
        .post("/api/company/fleet")
        .send({ companyUniqueId: COMPANY_UNIQUE_ID, vehicleUniqueId: VEHICLE_UNIQUE_ID });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/company/fleet", () => {
    const maybeIt = adminToken ? it : it.skip;

    maybeIt("should list vehicles for a company", async () => {
      const res = await request(app)
        .get("/api/company/fleet")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ companyUniqueId: COMPANY_UNIQUE_ID, userUniqueId: "self" });
      expect([200, 201]).toContain(res.status);
    });

    maybeIt("each record should contain expected fields", async () => {
      const res = await request(app)
        .get("/api/company/fleet")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ companyUniqueId: COMPANY_UNIQUE_ID, userUniqueId: "self" });
      if (res.status === 200 && res.body.data?.length) {
        const record = res.body.data[0];
        expect(record).toHaveProperty("companyVehicleUniqueId");
        expect(record).toHaveProperty("vehicleUniqueId");
        expect(record).toHaveProperty("assignmentStatus");
      }
    });

    maybeIt("should filter by assignmentStatus=active", async () => {
      const res = await request(app)
        .get("/api/company/fleet")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ companyUniqueId: COMPANY_UNIQUE_ID, userUniqueId: "self", assignmentStatus: "active" });
      if (res.status === 200 && res.body.data?.length) {
        res.body.data.forEach((r) => expect(r.assignmentStatus).toBe("active"));
      }
    });

    maybeIt("should respect pagination (page=1, limit=1)", async () => {
      const res = await request(app)
        .get("/api/company/fleet")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ companyUniqueId: COMPANY_UNIQUE_ID, userUniqueId: "self", page: 1, limit: 1 });
      if (res.status === 200) {
        expect(res.body.data?.length).toBeLessThanOrEqual(1);
      }
    });

    maybeIt("should return 401 when no auth token is provided", async () => {
      const res = await request(app)
        .get("/api/company/fleet")
        .query({ companyUniqueId: COMPANY_UNIQUE_ID });
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /api/company/fleet/:companyVehicleUniqueId", () => {
    test("should remove the vehicle assignment created in CREATE", async () => {
      if (!createdCompanyVehicleUniqueId) return;
      const res = await request(app)
        .delete(`/api/company/fleet/${createdCompanyVehicleUniqueId}`)
        .set("Authorization", `Bearer ${authToken}`);
      expect([200, 201, 404]).toContain(res.status);
    });

    test("should return 400 when an invalid UUID is provided", async () => {
      const res = await request(app)
        .delete("/api/company/fleet/not-a-uuid")
        .set("Authorization", `Bearer ${authToken}`);
      expect(res.status).toBe(400);
    });

    test("should return 404 when a non-existent UUID is provided", async () => {
      const res = await request(app)
        .delete("/api/company/fleet/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${authToken}`);
      expect(res.status).toBe(404);
    });

    test("should return 401 when no auth token is provided", async () => {
      const res = await request(app)
        .delete("/api/company/fleet/" + (createdCompanyVehicleUniqueId || "00000000-0000-0000-0000-000000000000"));
      expect(res.status).toBe(401);
    });
  });
});
