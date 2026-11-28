"use strict";

// E2E coverage for document-driven vehicle status evaluation:
//   registered vehicle -> PENDING_DOCS -> ACTIVE -> REJECTED -> ACTIVE
//   -> expired doc -> PENDING_DOCS -> sticky SUSPENDED -> admin clear -> ACTIVE
//
// Run standalone: node E2ETests/Vehicles/VehicleStatusEvaluation.js
// Integrated:    invoked from E2ETests/index.js after registration targets.

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const {
  backendURL,
  usersData,
  usersRoles,
  runId,
} = require("../constants");
const { authConfig } = require("../Utils");
const { ensureUser } = require("../Auth/ensureUser");
const { ensureCoreUsers } = require("../Auth/bootstrap");
const { pool } = require("../../Middleware/Database.config");
const { report } = require("../Reporter");

const STATUS = {
  ACTIVE: 1,
  PENDING_DOCS: 7,
  SUSPENDED: 4,
  REJECTED: 5,
};

const STATUS_URL = "/api/vehicleStatus";
const REGISTER_PATH = "/api/user/vehicles/driverUserUniqueId/self";
const ACCEPT_REJECT_URL = "/api/admin/acceptRejectAttachedDocuments";

// Prefix matches ensureUser's DYNAMIC_USER_PREFIXES so the driver is created
// through the public registration endpoint.
const DRIVER_KEY = "vrDriverStatusEval";

if (!usersData[DRIVER_KEY]) {
  usersData[DRIVER_KEY] = {
    fullName: `Vehicle Status Eval Driver ${runId}`,
    email: `vehicle-status-eval+${runId}@test.com`,
    phoneNumber: `+25193${runId}8`,
    roleId: usersRoles.driverRoleId,
    OTP: 101010,
    token: null,
    accountData: null,
  };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const adminToken = () => usersData.admin?.token;
const evalDriverToken = () => usersData[DRIVER_KEY]?.token;

const currentStatus = async (vehicleUniqueId) => {
  if (!adminToken()) throw new Error("Admin token not available");
  const res = await axios.get(
    `${backendURL}${STATUS_URL}?vehicleUniqueId=${vehicleUniqueId}`,
    authConfig(adminToken()),
  );
  const row = res.data?.data?.[0];
  if (!row) throw new Error("No VehicleStatus row for the registered vehicle");
  return row;
};

const waitForStatus = async (
  vehicleUniqueId,
  expectedTypeId,
  descriptionIncludes = null,
  timeoutMs = 4000,
) => {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await currentStatus(vehicleUniqueId);
    const typeMatches = Number(last.VehicleStatusTypeId) === expectedTypeId;
    const descriptionMatches =
      !descriptionIncludes ||
      String(last.statusDescription || "").includes(descriptionIncludes);
    if (typeMatches && descriptionMatches) return last;
    await delay(100);
  }
  throw new Error(
    `Timed out waiting for status ${expectedTypeId}${
      descriptionIncludes ? ` containing "${descriptionIncludes}"` : ""
    }. Last: type=${last?.VehicleStatusTypeId}, description=${last?.statusDescription}`,
  );
};

const userIdByPhone = async (phoneNumber) => {
  const [rows] = await pool.query(
    "SELECT userUniqueId FROM Users WHERE phoneNumber = ? LIMIT 1",
    [phoneNumber],
  );
  if (!rows[0]?.userUniqueId) {
    throw new Error(`No Users row for phone ${phoneNumber}`);
  }
  return rows[0].userUniqueId;
};

const getVehicleTypes = async () => {
  const res = await axios.get(
    backendURL + "/api/admin/vehicleTypes",
    authConfig(adminToken()),
  );
  if (!Array.isArray(res.data?.data) || res.data.data.length === 0) {
    throw new Error("No seeded vehicle types available");
  }
  return res.data.data;
};

const insertVehicleDoc = async ({
  vehicleUniqueId,
  documentTypeId,
  expirationDate,
  createdBy,
}) => {
  const attachedDocumentUniqueId = uuidv4();
  await pool.query(
    `INSERT INTO AttachedDocuments (
       attachedDocumentUniqueId, ownerType, ownerUniqueId,
       attachedDocumentDescription, documentTypeId, attachedDocumentFileNumber,
       documentExpirationDate, attachedDocumentAcceptance, attachedDocumentName,
       documentVersion, attachedDocumentCreatedByUserId, attachedDocumentCreatedAt
     ) VALUES (?, 'vehicle', ?, ?, ?, ?, ?, 'PENDING', ?, 1, ?, NOW())`,
    [
      attachedDocumentUniqueId,
      vehicleUniqueId,
      `E2E vehicle doc ${documentTypeId}`,
      documentTypeId,
      `E2E-${documentTypeId}-${uuidv4().slice(0, 6)}`,
      expirationDate,
      `e2e-vehicle-doc-${attachedDocumentUniqueId}.png`,
      createdBy,
    ],
  );
  return attachedDocumentUniqueId;
};

const decideDocument = async ({
  attachedDocumentUniqueId,
  action,
  reason,
}) => {
  const res = await axios.put(
    backendURL + ACCEPT_REJECT_URL,
    {
      attachedDocumentUniqueId,
      action,
      reason,
      roleId: usersRoles.vehicleRoleId,
    },
    authConfig(adminToken()),
  );
  return res.data;
};

const setStatus = async (vehicleUniqueId, statusTypeId, statusDescription) => {
  const row = await currentStatus(vehicleUniqueId);
  const res = await axios.put(
    `${backendURL}${STATUS_URL}/${row.vehicleStatusUniqueId}`,
    { VehicleStatusTypeId: statusTypeId, statusDescription },
    authConfig(adminToken()),
  );
  return res.data;
};

const runCase = async (label, fn) => {
  try {
    await fn();
    report.pass(label);
  } catch (error) {
    report.fail(label, error);
  }
};

const runVehicleStatusEvaluationTests = async ({ reset = true } = {}) => {
  if (reset) report.reset();

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  VEHICLE STATUS EVALUATION E2E —", new Date().toISOString());
  console.log("═══════════════════════════════════════════════════\n");

  await ensureCoreUsers({ fetchAccount: false });
  await ensureUser({
    userType: DRIVER_KEY,
    options: { fetchAccount: false },
  });

  if (!adminToken() || !evalDriverToken()) {
    throw new Error("Admin or vehicle-status evaluation driver token missing");
  }

  const createdBy = await userIdByPhone(usersData[DRIVER_KEY].phoneNumber);
  const vehicleTypes = await getVehicleTypes();
  const licensePlate = `VS${String(Date.now()).slice(-6)}${uuidv4()
    .slice(0, 4)
    .toUpperCase()}`;

  const registration = await axios.post(
    backendURL + REGISTER_PATH,
    {
      vehicleTypeUniqueId: vehicleTypes[0].vehicleTypeUniqueId,
      licensePlate,
      color: "White",
      isDriverOwnerOfVehicle: true,
    },
    authConfig(evalDriverToken()),
  );
  const vehicleUniqueId = registration?.data?.data?.vehicleUniqueId;
  if (!vehicleUniqueId) {
    throw new Error("Vehicle registration did not return vehicleUniqueId");
  }

  let insuranceDocId = null;
  let libreaDocId = null;

  await runCase(
    "VS-01 registered vehicle with no docs is PENDING_DOCS",
    async () => {
      const row = await waitForStatus(
        vehicleUniqueId,
        STATUS.PENDING_DOCS,
        "missing:",
      );
      if (Number(row.VehicleStatusTypeId) !== STATUS.PENDING_DOCS) {
        throw new Error(`Unexpected status row: ${JSON.stringify(row)}`);
      }
    },
  );

  await runCase(
    "VS-02 attached-but-pending docs keep vehicle PENDING_DOCS",
    async () => {
      insuranceDocId = await insertVehicleDoc({
        vehicleUniqueId,
        documentTypeId: 3,
        expirationDate: "2030-12-31 00:00:00",
        createdBy,
      });
      libreaDocId = await insertVehicleDoc({
        vehicleUniqueId,
        documentTypeId: 2,
        expirationDate: null,
        createdBy,
      });
      await waitForStatus(
        vehicleUniqueId,
        STATUS.PENDING_DOCS,
        "pending approval",
      );
    },
  );

  await runCase(
    "VS-03 both mandatory docs accepted makes vehicle ACTIVE",
    async () => {
      await decideDocument({
        attachedDocumentUniqueId: insuranceDocId,
        action: "ACCEPTED",
        reason: "E2E insurance approved",
      });
      await decideDocument({
        attachedDocumentUniqueId: libreaDocId,
        action: "ACCEPTED",
        reason: "E2E librea approved",
      });
      await waitForStatus(
        vehicleUniqueId,
        STATUS.ACTIVE,
        "All mandatory vehicle documents accepted",
      );
    },
  );

  await runCase(
    "VS-04 rejected mandatory document makes vehicle REJECTED",
    async () => {
      await decideDocument({
        attachedDocumentUniqueId: libreaDocId,
        action: "REJECTED",
        reason: "E2E librea rejected",
      });
      await waitForStatus(
        vehicleUniqueId,
        STATUS.REJECTED,
        "Mandatory vehicle document rejected",
      );
    },
  );

  await runCase(
    "VS-05 re-accepting the rejected document restores ACTIVE",
    async () => {
      await decideDocument({
        attachedDocumentUniqueId: libreaDocId,
        action: "ACCEPTED",
        reason: "E2E librea re-approved",
      });
      await waitForStatus(
        vehicleUniqueId,
        STATUS.ACTIVE,
        "All mandatory vehicle documents accepted",
      );
    },
  );

  await runCase(
    "VS-06 expired accepted document makes vehicle PENDING_DOCS",
    async () => {
      await pool.query(
        "UPDATE AttachedDocuments SET documentExpirationDate = ? WHERE attachedDocumentUniqueId = ?",
        ["2000-01-01 00:00:00", insuranceDocId],
      );
      await waitForStatus(
        vehicleUniqueId,
        STATUS.PENDING_DOCS,
        "expired:",
      );
    },
  );

  await runCase(
    "VS-07 unexpired document restores ACTIVE",
    async () => {
      await pool.query(
        "UPDATE AttachedDocuments SET documentExpirationDate = ? WHERE attachedDocumentUniqueId = ?",
        ["2030-12-31 00:00:00", insuranceDocId],
      );
      await waitForStatus(
        vehicleUniqueId,
        STATUS.ACTIVE,
        "All mandatory vehicle documents accepted",
      );
    },
  );

  await runCase(
    "VS-08 admin suspension is sticky across document events",
    async () => {
      await setStatus(
        vehicleUniqueId,
        STATUS.SUSPENDED,
        "E2E maintenance suspension",
      );
      await waitForStatus(
        vehicleUniqueId,
        STATUS.SUSPENDED,
        "E2E maintenance suspension",
      );
      await decideDocument({
        attachedDocumentUniqueId: insuranceDocId,
        action: "ACCEPTED",
        reason: "E2E re-approval while suspended",
      });
      const row = await waitForStatus(
        vehicleUniqueId,
        STATUS.SUSPENDED,
        "E2E maintenance suspension",
      );
      if (String(row.statusDescription) !== "E2E maintenance suspension") {
        throw new Error(
          `Suspension reason was overwritten: ${row.statusDescription}`,
        );
      }
    },
  );

  await runCase(
    "VS-09 admin clears suspension and status is re-evaluated to ACTIVE",
    async () => {
      await setStatus(
        vehicleUniqueId,
        STATUS.ACTIVE,
        "E2E maintenance cleared",
      );
      await waitForStatus(
        vehicleUniqueId,
        STATUS.ACTIVE,
        "All mandatory vehicle documents accepted",
      );
    },
  );

  await runCase(
    "VS-10 admin cannot force ACTIVE while mandatory docs are missing",
    async () => {
      const secondPlate = `VS${String(Date.now()).slice(-6)}${uuidv4()
        .slice(0, 4)
        .toUpperCase()}`;
      const secondRegistration = await axios.post(
        backendURL + REGISTER_PATH,
        {
          vehicleTypeUniqueId: vehicleTypes[0].vehicleTypeUniqueId,
          licensePlate: secondPlate,
          color: "Blue",
          isDriverOwnerOfVehicle: true,
        },
        authConfig(evalDriverToken()),
      );
      const secondVehicleId = secondRegistration?.data?.data?.vehicleUniqueId;
      if (!secondVehicleId) {
        throw new Error("Second vehicle registration did not return vehicleUniqueId");
      }

      await setStatus(secondVehicleId, STATUS.ACTIVE, "E2E forced ACTIVE");
      await waitForStatus(secondVehicleId, STATUS.PENDING_DOCS, "missing:");
    },
  );

  console.log("\n── Vehicle Status Evaluation E2E complete ──\n");
};

module.exports = { runVehicleStatusEvaluationTests };

if (require.main === module) {
  runVehicleStatusEvaluationTests({ reset: true })
    .then(() => {
      const ok = report.summary();
      process.exit(ok ? 0 : 1);
    })
    .catch((error) => {
      console.error(
        "VehicleStatusEvaluation setup error:",
        error?.response?.data || error?.message || error,
      );
      report.fail("VehicleStatusEvaluation suite", error);
      report.summary();
      process.exit(1);
    });
}
