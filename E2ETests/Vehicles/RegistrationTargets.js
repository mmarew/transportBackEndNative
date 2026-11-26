"use strict";

// E2E coverage for the single vehicle-registration endpoint's target rules:
//   self / driver UUID / no-driver-is-assigned-yet
// and the explicit role whitelist (driver, admin, super admin, company admin).
//
// Run standalone:  node E2ETests/Vehicles/RegistrationTargets.js
// Integrated:      invoked from E2ETests/index.js after the queue suite.

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { backendURL, usersData, usersRoles, runId } = require("../constants");
const { authConfig } = require("../Utils");
const { ensureUser } = require("../Auth/ensureUser");
const {
  getCompanies,
  createCompanies,
} = require("../Company/CompanyProfileManagement");
const { report, stats } = require("../Reporter");
const { armExpect, disarmExpect } = require("../Expect");
const { pool } = require("../../Middleware/Database.config");

const NO_DRIVER = "no-driver-is-assigned-yet";
const REGISTER_PATH = "/api/user/vehicles/driverUserUniqueId/";

// ── Dedicated drivers (never reused by other suites) ──────────────────────────

const TEST_DRIVERS = [
  "vrDriverSelf",
  "vrDriverAdmin",
  "vrDriverCompany",
  "vrDriverSuper",
];

TEST_DRIVERS.forEach((userType, index) => {
  if (!usersData[userType]) {
    usersData[userType] = {
      fullName: `Vehicle Registration Driver ${index + 1}`,
      email: `vrdriver${index + 1}+${runId}@test.com`,
      // Distinct from the queue suite's +2519<runId>01..04 throwaway drivers.
      phoneNumber: `+25194${runId}${index + 1}`,
      roleId: usersRoles.driverRoleId,
      OTP: 101010,
      token: null,
      accountData: null,
    };
  }
});

const tokenFor = (userType) => usersData[userType]?.token;

// ── Helpers ───────────────────────────────────────────────────────────────────

let plateCounter = 0;
const newPlate = () => {
  plateCounter += 1;
  return `VR${String(Date.now()).slice(-7)}${String(plateCounter).padStart(2, "0")}`;
};

const getVehicleTypes = async () => {
  const res = await axios.get(
    backendURL + "/api/admin/vehicleTypes",
    authConfig(tokenFor("supperAdmin")),
  );
  if (!Array.isArray(res.data?.data) || res.data.data.length === 0) {
    throw new Error("No seeded vehicle types available");
  }
  return res.data.data;
};

const registerVehicle = async ({ token, target, body }) =>
  axios.post(
    backendURL + REGISTER_PATH + encodeURIComponent(target),
    body,
    authConfig(token),
  );

const userIdByPhone = async (userType) => {
  const [rows] = await pool.query(
    "SELECT userUniqueId FROM Users WHERE phoneNumber = ? LIMIT 1",
    [usersData[userType].phoneNumber],
  );
  if (!rows[0]?.userUniqueId) {
    throw new Error(`No Users row for ${userType}`);
  }
  return rows[0].userUniqueId;
};

const scalarCount = async (sql, params) => {
  const [rows] = await pool.query(sql, params);
  return Number(rows[0]?.n || 0);
};

const activeDriverLinks = (vehicleUniqueId) =>
  scalarCount(
    "SELECT COUNT(*) AS n FROM VehicleDriver WHERE vehicleUniqueId = ? AND assignmentStatus = 'active'",
    [vehicleUniqueId],
  );

const activeOwnerships = (vehicleUniqueId) =>
  scalarCount(
    "SELECT COUNT(*) AS n FROM VehicleOwnership WHERE vehicleUniqueId = ? AND vehicleOwnershipDeletedAt IS NULL",
    [vehicleUniqueId],
  );

const activeFleetLinks = (vehicleUniqueId, companyUniqueId) =>
  scalarCount(
    `SELECT COUNT(*) AS n FROM CompanyVehicle
     WHERE vehicleUniqueId = ? AND companyUniqueId = ? AND assignmentStatus = 'active'`,
    [vehicleUniqueId, companyUniqueId],
  );

const expectStatus = (error, expected) => {
  const status = error?.response?.status;
  if (status !== expected) {
    throw new Error(
      `Expected HTTP ${expected}, got ${status || "none"}: ${
        error?.response?.data?.error || error?.message || error
      }`,
    );
  }
  return status;
};

const vehicleUniqueIdFrom = (response) => {
  const id = response?.data?.data?.vehicleUniqueId;
  if (!id) throw new Error("Response did not include data.vehicleUniqueId");
  return id;
};

const runCase = async (label, fn) => {
  try {
    await fn();
  } catch (error) {
    report.fail(label, error);
  }
};

// Declare a deliberate 4xx probe up front so logCapture labels it 🛡 EXPECTED
// instead of counting it as an undeclared backend failure.
const expectRejection = async (label, expected, fn) => {
  armExpect(expected, label);
  let outcome;
  try {
    await fn();
    outcome = { succeeded: true };
  } catch (error) {
    outcome = { error };
  } finally {
    disarmExpect();
  }
  if (outcome.succeeded) {
    throw new Error(`${label}: expected HTTP ${expected} but the request succeeded`);
  }
  report.guard(label, expectStatus(outcome.error, expected));
};

// ── Suite ─────────────────────────────────────────────────────────────────────

const runVehicleRegistrationTargetTests = async ({
  reset = true,
  silent = false,
} = {}) => {
  if (reset) report.reset();

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  VEHICLE REGISTRATION TARGET E2E —", new Date().toISOString());
  console.log("═══════════════════════════════════════════════════\n");

  // Provision every role the endpoint's whitelist touches.
  await ensureUser({ userType: "supperAdmin", options: { skipCreate: true, fetchAccount: false } });
  await ensureUser({ userType: "admin", options: { fetchAccount: false } });
  await ensureUser({ userType: "companyAdmin", options: { fetchAccount: false } });
  await ensureUser({ userType: "shipper", options: { fetchAccount: false } });
  for (const userType of TEST_DRIVERS) {
    await ensureUser({ userType, options: { fetchAccount: false } });
  }

  // A real company with an active owner membership is required for the
  // company-admin fleet paths and the membership guard.
  await getCompanies({ userType: "companyAdmin" });
  const company = await createCompanies({ userType: "companyAdmin" });
  // createCompanies returns { data: {...} } on a fresh create but a bare row
  // when an existing company is reused.
  const companyUniqueId = company?.data?.companyUniqueId || company?.companyUniqueId;
  if (!companyUniqueId) {
    throw new Error("Company setup failed — cannot run company registration cases");
  }

  const vehicleTypes = await getVehicleTypes();
  const baseBody = () => ({
    vehicleTypeUniqueId: vehicleTypes[0].vehicleTypeUniqueId,
    licensePlate: newPlate(),
    color: "white color",
    isDriverOwnerOfVehicle: false,
  });

  const adminUid = await userIdByPhone("vrDriverAdmin");
  const companyDriverUid = await userIdByPhone("vrDriverCompany");
  const superDriverUid = await userIdByPhone("vrDriverSuper");

  // VR-01 — driver /self keeps the full onboarding behavior.
  await runCase("VR-01 driver /self creates vehicle + driver + ownership", async () => {
    const res = await registerVehicle({
      token: tokenFor("vrDriverSelf"),
      target: "self",
      body: baseBody(),
    });
    const vehicleUniqueId = vehicleUniqueIdFrom(res);
    if ((await activeDriverLinks(vehicleUniqueId)) !== 1) {
      throw new Error("Expected one active VehicleDriver row");
    }
    if ((await activeOwnerships(vehicleUniqueId)) !== 1) {
      throw new Error("Expected one active VehicleOwnership row");
    }
    report.pass("VR-01 driver /self creates vehicle + driver + ownership");
  });

  // VR-02 — a driver still cannot register for another driver.
  await runCase("VR-02 driver cannot target another driver", () =>
    expectRejection("VR-02 driver cannot target another driver", 403, () =>
      registerVehicle({
        token: tokenFor("vrDriverSelf"),
        target: adminUid,
        body: baseBody(),
      })));

  // VR-03 — admin may register for an arbitrary driver UUID.
  await runCase("VR-03 admin registers for a driver UUID", async () => {
    const res = await registerVehicle({
      token: tokenFor("admin"),
      target: adminUid,
      body: baseBody(),
    });
    const vehicleUniqueId = vehicleUniqueIdFrom(res);
    const [rows] = await pool.query(
      `SELECT driverUserUniqueId FROM VehicleDriver
       WHERE vehicleUniqueId = ? AND assignmentStatus = 'active'`,
      [vehicleUniqueId],
    );
    if (rows[0]?.driverUserUniqueId !== adminUid) {
      throw new Error("VehicleDriver was not created for the admin's target driver");
    }
    report.pass("VR-03 admin registers for a driver UUID");
  });

  // VR-04 — super admin may register for an arbitrary driver UUID.
  await runCase("VR-04 super admin registers for a driver UUID", async () => {
    const res = await registerVehicle({
      token: tokenFor("supperAdmin"),
      target: superDriverUid,
      body: baseBody(),
    });
    const vehicleUniqueId = vehicleUniqueIdFrom(res);
    const [rows] = await pool.query(
      `SELECT driverUserUniqueId FROM VehicleDriver
       WHERE vehicleUniqueId = ? AND assignmentStatus = 'active'`,
      [vehicleUniqueId],
    );
    if (rows[0]?.driverUserUniqueId !== superDriverUid) {
      throw new Error("VehicleDriver was not created for the super admin's target driver");
    }
    report.pass("VR-04 super admin registers for a driver UUID");
  });

  // VR-05 — company admin may register for one of its drivers and add it to
  // the company fleet in the same call.
  await runCase("VR-05 company admin registers driver vehicle into fleet", async () => {
    const res = await registerVehicle({
      token: tokenFor("companyAdmin"),
      target: companyDriverUid,
      body: { ...baseBody(), companyUniqueId },
    });
    const vehicleUniqueId = vehicleUniqueIdFrom(res);
    if ((await activeFleetLinks(vehicleUniqueId, companyUniqueId)) !== 1) {
      throw new Error("CompanyVehicle row was not created");
    }
    const [rows] = await pool.query(
      `SELECT driverUserUniqueId FROM VehicleDriver
       WHERE vehicleUniqueId = ? AND assignmentStatus = 'active'`,
      [vehicleUniqueId],
    );
    if (rows[0]?.driverUserUniqueId !== companyDriverUid) {
      throw new Error("VehicleDriver was not created for the company's target driver");
    }
    report.pass("VR-05 company admin registers driver vehicle into fleet");
  });

  // VR-06 — the headline case: hyphenated sentinel, no driver rows, and the
  // vehicle still lands in the company fleet.
  await runCase("VR-06 no-driver-is-assigned-yet creates vehicle-only company vehicle", async () => {
    const res = await registerVehicle({
      token: tokenFor("companyAdmin"),
      target: NO_DRIVER,
      body: { ...baseBody(), companyUniqueId },
    });
    const vehicleUniqueId = vehicleUniqueIdFrom(res);
    if (res.data?.data?.vehicleOnly !== true) {
      throw new Error("Response did not flag vehicleOnly: true");
    }
    if ((await activeDriverLinks(vehicleUniqueId)) !== 0) {
      throw new Error("A VehicleDriver row was created for a vehicle-only registration");
    }
    if ((await activeOwnerships(vehicleUniqueId)) !== 0) {
      throw new Error("A VehicleOwnership row was created for a vehicle-only registration");
    }
    if ((await activeFleetLinks(vehicleUniqueId, companyUniqueId)) !== 1) {
      throw new Error("Vehicle was not linked to the company fleet");
    }
    report.pass("VR-06 no-driver-is-assigned-yet creates vehicle-only company vehicle");
  });

  // VR-07 — company admin cannot use the sentinel without a company.
  await runCase("VR-07 company admin no-driver target requires companyUniqueId", () =>
    expectRejection(
      "VR-07 company admin no-driver target requires companyUniqueId",
      400,
      () =>
        registerVehicle({
          token: tokenFor("companyAdmin"),
          target: NO_DRIVER,
          body: baseBody(),
        }),
    ));

  // VR-08 — company admins are restricted to companies they belong to.
  await runCase("VR-08 company admin cannot target a foreign company", () =>
    expectRejection(
      "VR-08 company admin cannot target a foreign company",
      403,
      () =>
        registerVehicle({
          token: tokenFor("companyAdmin"),
          target: NO_DRIVER,
          body: { ...baseBody(), companyUniqueId: uuidv4() },
        }),
    ));

  // VR-09 — drivers cannot add vehicles to a company fleet through this route.
  await runCase("VR-09 driver cannot supply companyUniqueId", () =>
    expectRejection("VR-09 driver cannot supply companyUniqueId", 403, () =>
      registerVehicle({
        token: tokenFor("vrDriverSelf"),
        target: "self",
        body: { ...baseBody(), companyUniqueId },
      })));

  // VR-10 — the role whitelist rejects everyone else (shipper role 1).
  await runCase("VR-10 shipper role is rejected by the whitelist", () =>
    expectRejection(
      "VR-10 shipper role is rejected by the whitelist",
      403,
      () =>
        registerVehicle({
          token: tokenFor("shipper"),
          target: "self",
          body: baseBody(),
        }),
    ));

  if (!silent) {
    const passed = report.summary();
    console.log(
      passed
        ? "  ✅ Vehicle registration target suite completed — all green"
        : "  ❌ Vehicle registration target suite completed with failures",
    );
    return passed;
  }
  return stats.failed === 0;
};

module.exports = { runVehicleRegistrationTargetTests };

// Standalone runner: `node E2ETests/Vehicles/RegistrationTargets.js`
if (require.main === module) {
  runVehicleRegistrationTargetTests()
    .then((passed) => process.exit(passed ? 0 : 1))
    .catch((error) => {
      console.error("FATAL:", error?.message || error);
      process.exit(1);
    });
}
