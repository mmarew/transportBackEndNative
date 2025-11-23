const express = require("express");
const request = require("supertest");

// Mock middleware and controller BEFORE loading the router so routes use the mocks
jest.mock("../Middleware/VerifyUsersIdentity", () => ({
  verifyAdminsIdentity: (req, res, next) => next(),
}));

jest.mock("../Middleware/VerifyToken", () => ({
  verifyTokenOfAxios: (req, res, next) => {
    // emulate decoded user attached by token middleware
    req.user = { userUniqueId: "test-admin-1", role: "admin" };
    next();
  },
}));

const mockController = {
  getOnlineDrivers: (req, res) =>
    res
      .status(200)
      .json({ success: true, data: { drivers: [], query: req.query } }),
  getOfflineDrivers: (req, res) =>
    res
      .status(200)
      .json({
        success: true,
        data: { drivers: [], pagination: { page: req.query.page || 1 } },
      }),
  getAllActiveDrivers: (req, res) =>
    res
      .status(200)
      .json({ success: true, data: { drivers: [], pagination: {} } }),
  getUnAuthorizedDriver: (req, res) =>
    res
      .status(200)
      .json({ success: true, data: { drivers: [], pagination: {} } }),
};

jest.mock("../Controllers/Admin.controller", () => mockController);

// Require only the admin routes and mount on a minimal express app
const adminRouter = require("../Routes/Admin.routes");
const app = express();
app.use(express.json());
app.use("/", adminRouter);

describe("Admin routes (unit) - mocked middleware and controller", () => {
  test("GET /api/admin/getOnlineDrivers returns 200 and forwards query", async () => {
    const res = await request(app).get("/api/admin/getOnlineDrivers?name=John");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
    expect(res.body.data).toHaveProperty("drivers");
    expect(res.body.data).toHaveProperty("query");
    expect(res.body.data.query.name).toBe("John");
  });

  test("GET /api/admin/getOfflineDrivers returns pagination and accepts page param", async () => {
    const res = await request(app).get(
      "/api/admin/getOfflineDrivers?page=2&limit=10"
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // query params are strings; ensure the page value was forwarded
    expect(res.body.data.pagination.page).toBe("2");
  });

  test("GET /api/admin/getAllActiveDrivers returns 200", async () => {
    const res = await request(app).get("/api/admin/getAllActiveDrivers");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("GET /api/admin/getUnAuthorizedDriver returns 200 and respects query", async () => {
    const res = await request(app).get(
      "/api/admin/getUnAuthorizedDriver?status=2&status=3"
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
