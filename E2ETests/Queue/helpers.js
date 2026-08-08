"use strict";

// Shared helpers for the Queue E2E suite: onboarding, queue API calls, and
// read-only DB assertions. Mirrors the framework conventions (axios +
// authConfig + pool).

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { pool } = require("../../Middleware/Database.config");
const { testAuthWorkFlow, testVerifyAndLoginUser } = require("../Auth");
const { queueState } = require("./state");
const { report } = require("../Reporter");
const {
  SHIPPER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/shipperRequest.endpoints");
const {
  DRIVER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/driverRequest.endpoints");
const {
  getDriverJourneyStatus,
  acceptShipperRequest,
} = require("../Driver/DriverJourneyStatus");

// ── Auth tokens ────────────────────────────────────────────────────────────────

const superAdminToken = () => usersData.supperAdmin?.token;
const adminToken = () => usersData.admin?.token;
const shipperToken = () => usersData.shipper?.token;
const driverToken = (driverKey) => usersData[driverKey]?.token;

const ensureAdminTokens = async () => {
  if (!superAdminToken()) await testVerifyAndLoginUser({ userType: "supperAdmin" });
  if (!adminToken()) await testVerifyAndLoginUser({ userType: "admin" });
};

// ── Vehicle types ──────────────────────────────────────────────────────────────

let vehicleTypesCache = null;
const getVehicleTypes = async () => {
  if (vehicleTypesCache) return vehicleTypesCache;
  const res = await axios.get(
    backendURL + "/api/admin/vehicleTypes",
    authConfig(superAdminToken()),
  );
  vehicleTypesCache = res.data.data;
  if (vehicleTypesCache.length < 3) {
    throw new Error("Need at least 3 seeded vehicle types for queue tests");
  }
  return vehicleTypesCache;
};

// ── Onboarding ─────────────────────────────────────────────────────────────────

/**
 * Register a queue driver (role 2) with a vehicle of the chosen type and store
 * everything needed by the rest of the suite on usersData[driverKey] and
 * queueState.drivers[driverKey].
 */
const onboardQueueDriver = async ({ driverKey, vehicleTypeIndex }) => {
  const types = await getVehicleTypes();
  const vehicleTypeUniqueId = types[vehicleTypeIndex].vehicleTypeUniqueId;
  const token = driverToken(driverKey);

  const plate =
    "Q" + String(vehicleTypeIndex + 1) + String(Date.now()).slice(-6) + driverKey.replace(/\D/g, "").padStart(2, "0");
  await axios.post(
    backendURL + "/api/user/vehicles/driverUserUniqueId/self",
    {
      licensePlate: plate,
      color: "white color",
      vehicleTypeUniqueId,
      isDriverOwnerOfVehicle: false,
    },
    authConfig(token),
  );

  const vd = await axios.get(
    backendURL + "/api/vehicleDriver?driverUserUniqueId=self&assignmentStatus=active",
    authConfig(token),
  );
  const row = Array.isArray(vd.data.data) ? vd.data.data[0] : vd.data.data;
  if (!row?.vehicleDriverUniqueId) {
    throw new Error(`No vehicleDriver row created for ${driverKey}`);
  }

  const account = await axios.get(
    backendURL + "/api/driver/account",
    authConfig(token),
  );
  usersData[driverKey].accountData = account.data;

  queueState.drivers[driverKey] = {
    userUniqueId: account.data?.data?.userData?.userUniqueId || account.data?.userData?.userUniqueId,
    vehicleDriverUniqueId: row.vehicleDriverUniqueId,
    vehicleTypeUniqueId: row.vehicleTypeUniqueId || vehicleTypeUniqueId,
  };
  return queueState.drivers[driverKey];
};

/**
 * Register the four queue drivers:
 * - d1, d2, d3 → typeA (truck)
 * - d4 → typeB (truck_long) for type-scoping
 */
const registerQueueDrivers = async () => {
  const defs = [
    { driverKey: "queueDriver1", vehicleTypeIndex: 0 },
    { driverKey: "queueDriver2", vehicleTypeIndex: 0 },
    { driverKey: "queueDriver3", vehicleTypeIndex: 0 },
    { driverKey: "queueDriver4", vehicleTypeIndex: 1 },
  ];
  for (const def of defs) {
    await testAuthWorkFlow({ userType: def.driverKey });
    await onboardQueueDriver(def);
  }
  await activateQueueDrivers(defs.map((d) => d.driverKey));
};

/**
 * The account-status evaluation downgrades freshly registered drivers to
 * INACTIVE_REQUIRED_DOCUMENTS_MISSING (statusId 3) because they have no
 * documents/vehicle on file. Queue tests exercise the accept/reject/dispatch
 * engine, which guards on USER_STATUS.ACTIVE via verifyDriversIdentity, so we
 * move the driver to ACTIVE through the admin user-role-status endpoint.
 */
const activateQueueDriver = async (driverKey) => {
  const userUniqueId = queueState.drivers[driverKey]?.userUniqueId;
  if (!userUniqueId) {
    throw new Error(`No userUniqueId recorded for ${driverKey}`);
  }
  const res = await axios.put(
    backendURL + `/api/admin/userRoleStatus/${userUniqueId}`,
    {
      roleId: 2,
      newStatusId: 1,
      phoneNumber: usersData[driverKey].phoneNumber,
      userRoleStatusDescription: "Activated for queue E2E",
    },
    authConfig(superAdminToken()),
  );
  return res.data;
};

const activateQueueDrivers = async (driverKeys) => {
  for (const driverKey of driverKeys) {
    await activateQueueDriver(driverKey);
  }
};

const registerQueueOrgAdmin = async () => {
  if (usersData.queueOrgAdmin?.token) return;
  await testAuthWorkFlow({ userType: "queueOrgAdmin" });
};

const ensureShipper = async () => {
  if (!usersData.shipper?.token) {
    await testAuthWorkFlow({ userType: "shipper" });
  }
  const account = await axios.get(
    backendURL + "/api/shipper/account",
    authConfig(shipperToken()),
  );
  usersData.shipper.accountData = account.data;
  queueState.shipper.userUniqueId =
    account.data?.data?.userData?.userUniqueId ||
    account.data?.data?.user?.userUniqueId ||
    account.data?.userData?.userUniqueId;
};

// ── Queue organization API ─────────────────────────────────────────────────────

const createQueueOrganization = async (name, token = superAdminToken()) => {
  const res = await axios.post(
    backendURL + "/api/queueOrganization",
    {
      queueOrganizationName: name,
      queueOrganizationType: "other",
      queueOrganizationPhone: "+251910000001",
      queueOrganizationAddress: "Addis Ababa",
      latitude: 9.03,
      longitude: 38.74,
    },
    authConfig(token),
  );
  return res.data?.data || res.data;
};

const approveQueueOrganization = async ({
  queueOrganizationUniqueId,
  approvalStatus = "approved",
  queueEnabled = true,
  token = superAdminToken(),
}) => {
  const res = await axios.patch(
    backendURL + `/api/queueOrganization/${queueOrganizationUniqueId}/approve`,
    { approvalStatus, queueEnabled },
    authConfig(token),
  );
  return res.data;
};

const deleteQueueOrganization = async (queueOrganizationUniqueId, token = superAdminToken()) => {
  const res = await axios.delete(
    backendURL + `/api/queueOrganization/${queueOrganizationUniqueId}`,
    authConfig(token),
  );
  return res.data;
};

const getQueueOrganizations = async (filters = {}, token = superAdminToken()) => {
  const qs = new URLSearchParams(filters).toString();
  const res = await axios.get(
    backendURL + "/api/queueOrganization" + (qs ? `?${qs}` : ""),
    authConfig(token),
  );
  return res.data?.data || res.data;
};

// ── Driver queue API ───────────────────────────────────────────────────────────

const checkin = async (driverKey, queueOrganizationUniqueId) => {
  const d = queueState.drivers[driverKey];
  const res = await axios.post(
    backendURL + "/api/queue/driver/checkin",
    {
      queueOrganizationUniqueId,
      vehicleDriverUniqueId: d.vehicleDriverUniqueId,
      latitude: 9.03,
      longitude: 38.74,
    },
    authConfig(driverToken(driverKey)),
  );
  return res.data?.data || res.data;
};

const checkout = async (driverKey, queueOrganizationUniqueId) => {
  const res = await axios.delete(
    backendURL +
      "/api/queue/driver/checkout?queueOrganizationUniqueId=" +
      queueOrganizationUniqueId,
    authConfig(driverToken(driverKey)),
  );
  return res.data;
};

const myPosition = async (driverKey, queueOrganizationUniqueId) => {
  const res = await axios.get(
    backendURL +
      "/api/queue/driver/myPosition?queueOrganizationUniqueId=" +
      queueOrganizationUniqueId,
    authConfig(driverToken(driverKey)),
  );
  return res.data?.data || res.data;
};

const getQueueStatus = async (queueOrganizationUniqueId, token = superAdminToken()) => {
  const res = await axios.get(
    backendURL + "/api/queue/status?queueOrganizationUniqueId=" + queueOrganizationUniqueId,
    authConfig(token),
  );
  return res.data?.data || res.data;
};

const manualCheckin = async (queueOrganizationUniqueId, driverKey, token = superAdminToken()) => {
  const d = queueState.drivers[driverKey];
  const res = await axios.post(
    backendURL + "/api/queue/manualCheckin",
    { queueOrganizationUniqueId, vehicleDriverUniqueId: d.vehicleDriverUniqueId },
    authConfig(token),
  );
  return res.data?.data || res.data;
};

const overrideEntry = async (queueUniqueId, queueNumber, token = superAdminToken()) => {
  const res = await axios.patch(
    backendURL + `/api/queue/entry/${queueUniqueId}/override`,
    { queueNumber, reason: "E2E override test" },
    authConfig(token),
  );
  return res.data;
};

const removeEntry = async (queueUniqueId, token = superAdminToken()) => {
  const res = await axios.delete(
    backendURL + `/api/queue/entry/${queueUniqueId}`,
    authConfig(token),
  );
  return res.data;
};

const manualDispatch = async ({ queueOrganizationUniqueId, vehicleTypeUniqueId, shipperRequestUniqueId, token = superAdminToken() }) => {
  const res = await axios.post(
    backendURL + "/api/queue/dispatch",
    { queueOrganizationUniqueId, vehicleTypeUniqueId, shipperRequestUniqueId },
    authConfig(token),
  );
  return res.data;
};

// ── Order lifecycle API ────────────────────────────────────────────────────────

const buildQueueOrderPayload = ({
  queueOrganizationUniqueId,
  vehicleTypeUniqueId,
  numberOfVehicles = 1,
  shippableItemName = "Queue test cargo",
  shippingCost = 6000,
}) => {
  const shippingDate = new Date();
  shippingDate.setDate(shippingDate.getDate() + 1);
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 3);
  return {
    shipperRequestBatchUniqueId: uuidv4(),
    numberOfVehicles,
    shippingDate: shippingDate.toISOString(),
    deliveryDate: deliveryDate.toISOString(),
    shippingCost,
    shippableItemQtyInQuintal: 100,
    shippableItemName,
    requestMode: "individual_target",
    queueOrganizationUniqueId,
    originLocation: { latitude: 9.03, longitude: 38.74, description: "Addis Ababa" },
    destination: { latitude: 8.54, longitude: 39.27, description: "Adama" },
    vehicle: { vehicleTypeUniqueId },
  };
};

const createQueueOrder = async ({ queueOrganizationUniqueId, vehicleTypeUniqueId, numberOfVehicles = 1, shippableItemName, shippingCost }) => {
  const res = await axios.post(
    backendURL + SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST,
    buildQueueOrderPayload({
      queueOrganizationUniqueId,
      vehicleTypeUniqueId,
      numberOfVehicles,
      shippableItemName,
      shippingCost,
    }),
    authConfig(shipperToken()),
  );
  return res.data;
};

const rejectDriverOffer = async ({ shipperRequestUniqueId, driverRequestUniqueId, journeyDecisionUniqueId, shipperRequestId, journeyStatusId = 2 }) => {
  const res = await axios.put(
    backendURL + SHIPPER_REQUEST_ENDPOINTS.REJECT_DRIVER_OFFER,
    {
      shipperRequestUniqueId,
      driverRequestUniqueId,
      journeyDecisionUniqueId,
      shipperRequestId,
      journeyStatusId,
    },
    authConfig(shipperToken()),
  );
  return res.data;
};

const cancelOrder = async ({ orderUniqueId, cancelAs = "shipper" }) => {
  const token =
    cancelAs === "shipper" ? shipperToken() : cancelAs === "admin" ? adminToken() : superAdminToken();
  const owner = cancelAs === "shipper" ? queueState.shipper.userUniqueId : queueState.shipper.userUniqueId;
  const res = await axios.put(
    backendURL +
      SHIPPER_REQUEST_ENDPOINTS.CANCEL_SHIPPER_REQUEST.replace(
        ":userUniqueId",
        owner,
      ),
    { shipperRequestUniqueId: orderUniqueId, cancellationReasonsTypeId: 6 },
    authConfig(token),
  );
  return res.data;
};

const acceptOrder = async (driverKey, shippingCostByDriver = 5500) => {
  await getDriverJourneyStatus({ userType: driverKey });
  return await acceptShipperRequest({
    userType: driverKey,
    shippingCostByDriver,
  });
};

const rejectOrderByDriver = async (driverKey) => {
  const res = await axios.put(
    backendURL +
      DRIVER_REQUEST_ENDPOINTS.CANCEL_DRIVER_REQUEST +
      "?ownerUserUniqueId=self&roleId=2&cancellationReasonsTypeId=2",
    {},
    authConfig(driverToken(driverKey)),
  );
  return res.data;
};

// ── Read-only DB assertions ────────────────────────────────────────────────────

const dbToday = () => new Date().toISOString().slice(0, 10);

const getQueueEntryByDriver = async ({ queueOrganizationUniqueId, driverKey, queueDate = dbToday() }) => {
  const [rows] = await pool.query(
    `SELECT dq.*
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND u.phoneNumber = ? AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber DESC LIMIT 1`,
    [queueOrganizationUniqueId, queueDate, usersData[driverKey].phoneNumber],
  );
  return rows[0] || null;
};

const getQueueEntryByOrder = async ({ queueOrganizationUniqueId, orderUniqueId, queueDate = dbToday() }) => {
  const [rows] = await pool.query(
    `SELECT dq.*
     FROM DriverQueue dq
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND dq.shipperRequestUniqueId = ? AND dq.queueDeletedAt IS NULL
     LIMIT 1`,
    [queueOrganizationUniqueId, queueDate, orderUniqueId],
  );
  return rows[0] || null;
};

const getLatestOrders = async (count = 1) => {
  const [rows] = await pool.query(
    `SELECT shipperRequestUniqueId, journeyStatusId
     FROM ShipperRequest
     WHERE shipperRequestCreatedBy = ?
     ORDER BY shipperRequestCreatedAt DESC, shipperRequestId DESC
     LIMIT ?`,
    [queueState.shipper.userUniqueId, count],
  );
  return rows;
};

const getOrderByUniqueId = async (orderUniqueId) => {
  const [rows] = await pool.query(
    `SELECT sr.*, js.journeyStatusName
     FROM ShipperRequest sr
     LEFT JOIN JourneyStatus js ON js.journeyStatusId = sr.journeyStatusId
     WHERE sr.shipperRequestUniqueId = ?`,
    [orderUniqueId],
  );
  return rows[0] || null;
};

const getJourneyDecisionCount = async (orderUniqueId) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM JourneyDecisions jd
     JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
     WHERE sr.shipperRequestUniqueId = ?`,
    [orderUniqueId],
  );
  return rows[0].total;
};

const getCanceledJourneysForOrder = async (orderUniqueId) => {
  const order = await getOrderByUniqueId(orderUniqueId);
  const [rows] = await pool.query(
    `SELECT * FROM CanceledJourneys
     WHERE contextId = ? AND contextType = 'ShipperRequest'`,
    [order.shipperRequestId],
  );
  return rows;
};

const getActiveQueueCountForDriver = async (driverKey, queueDate = dbToday()) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
     WHERE u.phoneNumber = ? AND dq.queueDate = ? AND dq.queueDeletedAt IS NULL
       AND dq.status IN ('waiting','offered')`,
    [usersData[driverKey].phoneNumber, queueDate],
  );
  return rows[0].total;
};

// ── Generic API-error helper ───────────────────────────────────────────────────

const expectStatus = async (promise, expectedStatuses, label) => {
  const expected = Array.isArray(expectedStatuses)
    ? expectedStatuses
    : [expectedStatuses];
  try {
    const res = await promise;
    if (!expected.includes(res.status)) {
      throw new Error(
        `${label}: expected HTTP ${expected.join("/")}, got ${res.status}`,
      );
    }
    return res;
  } catch (error) {
    if (error.response && expected.includes(error.response.status)) {
      return error.response;
    }
    if (error.response) {
      throw new Error(
        `${label}: expected HTTP ${expected.join("/")}, got ${error.response.status}`,
      );
    }
    throw error;
  }
};

module.exports = {
  superAdminToken,
  adminToken,
  shipperToken,
  driverToken,
  ensureAdminTokens,
  getVehicleTypes,
  registerQueueDrivers,
  registerQueueOrgAdmin,
  ensureShipper,
  activateQueueDriver,
  createQueueOrganization,
  approveQueueOrganization,
  deleteQueueOrganization,
  getQueueOrganizations,
  checkin,
  checkout,
  myPosition,
  getQueueStatus,
  manualCheckin,
  overrideEntry,
  removeEntry,
  manualDispatch,
  buildQueueOrderPayload,
  createQueueOrder,
  rejectDriverOffer,
  cancelOrder,
  acceptOrder,
  rejectOrderByDriver,
  dbToday,
  getQueueEntryByDriver,
  getQueueEntryByOrder,
  getLatestOrders,
  getOrderByUniqueId,
  getJourneyDecisionCount,
  getCanceledJourneysForOrder,
  getActiveQueueCountForDriver,
  expectStatus,
};
