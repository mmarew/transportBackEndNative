const request = require("supertest");
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const app = require("../App"); // Adjust path to your Express app
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

// Mock data
const mockAdmin = {
  _id: new mongoose.Types.ObjectId(),
  email: "admin@test.com",
  role: "admin",
};

const mockDrivers = [
  {
    _id: new mongoose.Types.ObjectId(),
    fullName: "John Driver",
    email: "john@test.com",
    phone: "1234567890",
    vehicleType: "SUV",
    journeyStatus: 1,
    isOnline: true,
    userRoleStatus: 1,
    role: 2,
  },
  {
    _id: new mongoose.Types.ObjectId(),
    fullName: "Jane Smith",
    email: "jane@test.com",
    phone: "0987654321",
    vehicleType: "Car",
    journeyStatus: 2,
    isOnline: true,
    userRoleStatus: 1,
    role: 2,
  },
];

describe("Admin API Tests", () => {
  let adminToken;
  let testDrivers = [];

  beforeAll(async () => {
    // Generate admin token
    adminToken = jwt.sign(
      {
        userId: mockAdmin._id,
        email: mockAdmin.email,
        role: mockAdmin.role,
      },
      process.env.JWT_SECRET || "test-secret",
      { expiresIn: "1h" }
    );

    // You might want to seed test data here
    // await seedTestData();
  });

  afterAll(async () => {
    // Clean up test data
    // await cleanupTestData();
    await mongoose.connection.close();
  });

  describe("GET /api/admin/getOnlineDrivers", () => {
    it("should return 401 without authorization token", async () => {
      const response = await request(app)
        .get("/api/admin/getOnlineDrivers")
        .expect(401);

      expect(response.body).toHaveProperty("error");
    });

    it("should return 403 with non-admin token", async () => {
      const userToken = jwt.sign(
        { userId: "user123", email: "user@test.com", role: "user" },
        process.env.JWT_SECRET || "test-secret"
      );

      const response = await request(app)
        .get("/api/admin/getOnlineDrivers")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403);
    });

    it("should return online drivers with valid admin token", async () => {
      const response = await request(app)
        .get("/api/admin/getOnlineDrivers")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("success", true);
      expect(response.body).toHaveProperty("data");
      expect(Array.isArray(response.body.data.drivers)).toBe(true);
    });

    it("should filter online drivers by name", async () => {
      const response = await request(app)
        .get("/api/admin/getOnlineDrivers?name=John")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should filter online drivers by vehicle type", async () => {
      const response = await request(app)
        .get("/api/admin/getOnlineDrivers?vehicleType=SUV")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should handle multiple journey status filters", async () => {
      const response = await request(app)
        .get("/api/admin/getOnlineDrivers?journeyStatus=1&journeyStatus=2")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should handle combined search and filters", async () => {
      const response = await request(app)
        .get(
          "/api/admin/getOnlineDrivers?search=john&vehicleType=Car&phone=1234567890"
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe("GET /api/admin/getOfflineDrivers", () => {
    it("should return offline drivers with pagination", async () => {
      const response = await request(app)
        .get("/api/admin/getOfflineDrivers?page=1&limit=10")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("success", true);
      expect(response.body.data).toHaveProperty("drivers");
      expect(response.body.data).toHaveProperty("pagination");
    });

    it("should search offline drivers by name", async () => {
      const response = await request(app)
        .get("/api/admin/getOfflineDrivers?name=john")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should filter offline drivers by vehicle type and phone", async () => {
      const response = await request(app)
        .get("/api/admin/getOfflineDrivers?vehicleType=SUV&phone=123456")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should handle combined search for offline drivers", async () => {
      const response = await request(app)
        .get(
          "/api/admin/getOfflineDrivers?search=john&vehicleType=Car&email=gmail.com"
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe("GET /api/admin/getAllActiveDrivers", () => {
    it("should return all active drivers with pagination", async () => {
      const response = await request(app)
        .get("/api/admin/getAllActiveDrivers?page=1&limit=10")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("drivers");
      expect(response.body.data).toHaveProperty("pagination");
    });

    it("should search active drivers by name and vehicle type", async () => {
      const response = await request(app)
        .get("/api/admin/getAllActiveDrivers?name=john&vehicleType=SUV")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should filter and sort active drivers", async () => {
      const response = await request(app)
        .get(
          "/api/admin/getAllActiveDrivers?licensePlate=ABC123&sortBy=fullName&sortOrder=ASC"
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should handle combined search with multiple filters", async () => {
      const response = await request(app)
        .get(
          "/api/admin/getAllActiveDrivers?search=john&vehicleType=Car&email=gmail.com"
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should handle sorting parameters", async () => {
      const response = await request(app)
        .get("/api/admin/getAllActiveDrivers?sortBy=createdAt&sortOrder=ASC")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe("GET /api/admin/getUnAuthorizedDriver", () => {
    it("should return unauthorized drivers with pagination", async () => {
      const response = await request(app)
        .get("/api/admin/getUnAuthorizedDriver?page=1&limit=10")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("drivers");
      expect(response.body.data).toHaveProperty("pagination");
    });

    it("should search unauthorized drivers by name and filter by status", async () => {
      const response = await request(app)
        .get("/api/admin/getUnAuthorizedDriver?name=john&status=2&status=3")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should filter and sort unauthorized drivers", async () => {
      const response = await request(app)
        .get(
          "/api/admin/getUnAuthorizedDriver?vehicleType=Truck&sortBy=fullName&sortOrder=ASC"
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should handle combined search with multiple filters", async () => {
      const response = await request(app)
        .get(
          "/api/admin/getUnAuthorizedDriver?search=john&licensePlate=ABC&email=gmail.com"
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should handle custom pagination and sorting", async () => {
      const response = await request(app)
        .get(
          "/api/admin/getUnAuthorizedDriver?page=2&limit=15&sortBy=createdAt&sortOrder=DESC"
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // Edge Cases and Error Handling
  describe("Error Handling", () => {
    it("should handle invalid page parameter", async () => {
      const response = await request(app)
        .get("/api/admin/getOnlineDrivers?page=invalid")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200); // or 400 if you have validation

      expect(response.body.success).toBe(true);
    });

    it("should handle negative limit parameter", async () => {
      const response = await request(app)
        .get("/api/admin/getOnlineDrivers?limit=-5")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200); // or 400 if you have validation

      expect(response.body.success).toBe(true);
    });

    it("should handle empty search results", async () => {
      const response = await request(app)
        .get("/api/admin/getOnlineDrivers?name=NonexistentDriverName")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.drivers)).toBe(true);
    });
  });
});
