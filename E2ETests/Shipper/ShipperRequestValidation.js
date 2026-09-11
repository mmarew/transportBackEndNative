// ShipperRequest Validation — E2E Tests
// Converted from __tests__/shipperRequestValidation.test.js unit tests.
// Tests validation rules by hitting the ACTUAL create endpoint
// (SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST, Joi-validated):
//   1. numberOfVehicles > 100 → rejected (400)
//   2. individual_target with 10+ vehicles → rejected (400)
//
// Joi fails BEFORE the service is called, so the two seed rows below (a valid
// batch uuid + a real vehicle type uuid) are enough to exercise the intended
// rules deterministically — no DB writes happen on the rejected paths.

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { pool } = require("../../Middleware/Database.config");
const {
  SHIPPER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/shipperRequest.endpoints");
const { expectGuardRejection } = require("../Expect");

const CREATE_URL = SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST;

const futureDate = (daysFromNow) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
};

// Fetch the first real seeded vehicle type so the request passes the nested
// `vehicle.vehicleTypeUniqueId` uuid rule before reaching the cap validation.
let vehicleTypeUniqueIdCache = null;
const getVehicleTypeUniqueId = async () => {
  if (vehicleTypeUniqueIdCache) return vehicleTypeUniqueIdCache;
  const [rows] = await pool.query(
    "SELECT vehicleTypeUniqueId FROM VehicleTypes LIMIT 1",
  );
  if (!rows[0]) throw new Error("No VehicleTypes found — seed DB first");
  vehicleTypeUniqueIdCache = rows[0].vehicleTypeUniqueId;
  return vehicleTypeUniqueIdCache;
};

const buildPayload = async ({ numberOfVehicles, requestMode = "individual_target" }) => ({
  shipperRequestBatchUniqueId: uuidv4(),
  numberOfVehicles,
  requestMode,
  shippingDate: futureDate(1),
  deliveryDate: futureDate(3),
  shippingCost: 15000,
  shippableItemQtyInQuintal: 100,
  shippableItemName: "Coffee",
  originLocation: { latitude: 9.0, longitude: 38.7, description: "Addis" },
  destination: { latitude: 7.0, longitude: 38.5, description: "Hawassa" },
  vehicle: { vehicleTypeUniqueId: await getVehicleTypeUniqueId() },
});

// Assert the request is rejected with HTTP 400 (Joi BAD_REQUEST) as a DECLARED
// guard probe — the log renders the outcome as 🛡 EXPECTED and counts it as a
// pass. Any other status (401/404/500) or an accidental 2xx success is a hard
// failure: validation caps must never be silently swallowed.
const expectRejected = (loader, label) =>
  expectGuardRejection({
    label,
    allowed: [400],
    urlIncludes: "createRequest",
    run: loader,
  });

// ── Test: numberOfVehicles > 100 rejected ────────────────────────────────────
const testMaxVehicleCap = async () => {
  const token = usersData.shipper?.token || usersData.admin?.token;
  if (!token) throw new Error("shipper token not found");

  const payload = await buildPayload({ numberOfVehicles: 101 });
  await expectRejected(
    () => axios.post(backendURL + CREATE_URL, payload, authConfig(token)),
    "numberOfVehicles > 100",
  );
};

// ── Test: individual_target with 10+ vehicles rejected ───────────────────────
const testIndividualTargetCap = async () => {
  const token = usersData.shipper?.token || usersData.admin?.token;
  if (!token) throw new Error("shipper token not found");

  const payload = await buildPayload({ numberOfVehicles: 10, requestMode: "individual_target" });
  await expectRejected(
    () => axios.post(backendURL + CREATE_URL, payload, authConfig(token)),
    "individual_target with 10+ vehicles",
  );
};

// ── Full workflow ────────────────────────────────────────────────────────────
const testShipperRequestValidationWorkflow = async () => {
  console.log("\n── ShipperRequest Validation Rules ──");
  await testMaxVehicleCap();
  await testIndividualTargetCap();
  console.log("── ShipperRequest Validation complete ──\n");
};

module.exports = {
  testShipperRequestValidationWorkflow,
  testMaxVehicleCap,
  testIndividualTargetCap,
};