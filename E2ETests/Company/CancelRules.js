"use strict";

/**
 * E2E — Company-target cancellation business rules (TQ-42)
 *
 * R1. Driver cancels a company-target job → the slot survives (stays at
 *     acceptedByShipper=4) so the company can reassign another driver.
 * R2. Company cancels its bid → the request returns to waiting: BOTH the
 *     batch header and the slots go back to status 1 so other companies can
 *     bid again. (Regression: previously only the slots reverted and the
 *     batch header stayed at 4 — a phantom "ongoing" batch.)
 * R3. Only the shipper cancelling the batch may kill it → slots go terminal.
 *
 * Runs inside the full suite AFTER runCompanyFlow, so the core users and the
 * companyAdmin's company already exist.
 */
const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { report } = require("../Reporter");
const { pool } = require("../../Middleware/Database.config.js");

const TERMINAL_IDS = new Set([10, 11, 12, 13, 15]);

const getSlotRows = (batchUniqueId) =>
  pool.query(
    `SELECT journeyStatusId, COUNT(*) AS cnt
     FROM ShipperRequest
     WHERE shipperRequestBatchUniqueId = ? AND shipperRequestDeletedAt IS NULL
     GROUP BY journeyStatusId`,
    [batchUniqueId],
  ).then(([rows]) => rows);

const getBatchRow = (batchUniqueId) =>
  pool.query(
    `SELECT journeyStatusId FROM ShipperRequestBatch WHERE batchUniqueId = ?`,
    [batchUniqueId],
  ).then(([rows]) => rows);

const createCompanyBatch = async (companyUniqueId) => {
  const { shipper } = usersData;
  const vtRes = await axios.get(
    backendURL + "/api/admin/vehicleTypes",
    authConfig(shipper.token),
  );
  const vehicleTypeUniqueId = vtRes.data.data[0].vehicleTypeUniqueId;
  const batchUniqueId = require("uuid").v4();
  await axios.post(
    backendURL + "/api/shipperRequest/createRequest",
    {
      shipperRequestBatchUniqueId: batchUniqueId,
      numberOfVehicles: 2,
      shippingDate: "2026-09-01T10:00:00.000Z",
      deliveryDate: "2026-09-05T10:00:00.000Z",
      shippingCost: 500000,
      shippableItemQtyInQuintal: 100,
      shippableItemName: "Cancel Rule Test Cargo",
      requestMode: "company_target",
      targetCompanyUniqueId: companyUniqueId,
      originLocation: { latitude: 9.03, longitude: 38.74, description: "Addis Ababa" },
      destination: { latitude: 11.13, longitude: 39.63, description: "Dessie" },
      vehicle: { vehicleTypeUniqueId },
    },
    authConfig(shipper.token),
  );
  return batchUniqueId;
};

const submitBid = async (companyUniqueId, batchUniqueId) => {
  const res = await axios.post(
    backendURL + "/api/company/bids",
    {
      shipperRequestBatchUniqueId: batchUniqueId,
      companyUniqueId,
      proposedCostPerVehicle: "90000",
    },
    authConfig(usersData.companyAdmin.token),
  );
  return res.data?.data?.companyBidRequestUniqueId;
};

const setBidStatus = async (bidUniqueId, bidStatus, token) => {
  const res = await axios.patch(
    backendURL + "/api/company/bids/" + bidUniqueId + "/status",
    { bidStatus },
    authConfig(token),
  );
  return res.data?.message !== "error";
};

const runCancelRulesTests = async () => {
  const { shipper, companyAdmin } = usersData;
  if (!shipper?.token || !companyAdmin?.token) {
    report.skip(
      "cancelRules",
      "shipper/companyAdmin tokens missing — run full suite",
    );
    return;
  }
  const companyUniqueId = companyAdmin.companies?.[0]?.companyUniqueId;
  if (!companyUniqueId) {
    report.skip("cancelRules", "no company created for companyAdmin");
    return;
  }

  try {
    // ── A) Company cancels an ACCEPTED bid → batch + slots return to waiting ──
    const batchA = await createCompanyBatch(companyUniqueId);
    report.pass("cancelRules: batchCreated");

    const bidA = await submitBid(companyUniqueId, batchA);
    if (!bidA) throw new Error("bid submission failed");
    report.pass("cancelRules: bidSubmitted");

    if (!(await setBidStatus(bidA, "accepted_by_shipper", shipper.token))) {
      throw new Error("bid acceptance failed");
    }
    report.pass("cancelRules: bidAccepted");

    let batchRow = await getBatchRow(batchA);
    let slots = await getSlotRows(batchA);
    if (Number(batchRow[0]?.journeyStatusId) !== 4) {
      throw new Error(`batch header expected 4 after accept, got ${batchRow[0]?.journeyStatusId}`);
    }
    if (
      slots.length !== 1 ||
      Number(slots[0].journeyStatusId) !== 4 ||
      Number(slots[0].cnt) !== 2
    ) {
      throw new Error(`slots expected 2×status-4 after accept, got ${JSON.stringify(slots)}`);
    }
    report.pass("cancelRules: afterAccept batch=4 slots=4");

    if (!(await setBidStatus(bidA, "cancelled_by_company", companyAdmin.token))) {
      throw new Error("company bid cancellation failed");
    }
    report.pass("cancelRules: companyCancelledAcceptedBid");

    batchRow = await getBatchRow(batchA);
    slots = await getSlotRows(batchA);
    if (Number(batchRow[0]?.journeyStatusId) !== 1) {
      throw new Error(`batch header expected 1 after company cancel, got ${batchRow[0]?.journeyStatusId}`);
    }
    if (
      slots.length !== 1 ||
      Number(slots[0].journeyStatusId) !== 1 ||
      Number(slots[0].cnt) !== 2
    ) {
      throw new Error(`slots expected 2×status-1 after company cancel, got ${JSON.stringify(slots)}`);
    }
    report.pass("cancelRules: afterCompanyCancel batch=1 slots=1");

    // ── B) Shipper cancels the batch → slots terminal (only shipper can kill) ──
    const batchB = await createCompanyBatch(companyUniqueId);
    const bidB = await submitBid(companyUniqueId, batchB);
    if (!bidB || !(await setBidStatus(bidB, "accepted_by_shipper", shipper.token))) {
      throw new Error("batch B accept failed");
    }

    const cancelRes = await axios.put(
      backendURL + "/api/shipperRequestBatch/" + batchB + "/cancel",
      { cancellationReasonsTypeId: 12 },
      authConfig(shipper.token),
    );
    if (cancelRes.data?.message === "error") {
      throw new Error(JSON.stringify(cancelRes.data).slice(0, 300));
    }
    report.pass("cancelRules: shipperCancelledBatch");

    const batchBRow = await getBatchRow(batchB);
    const slotsB = await getSlotRows(batchB);
    if (!TERMINAL_IDS.has(Number(batchBRow[0]?.journeyStatusId))) {
      throw new Error(`batch header expected terminal after shipper cancel, got ${batchBRow[0]?.journeyStatusId}`);
    }
    if (
      slotsB.length === 0 ||
      !slotsB.every((r) => TERMINAL_IDS.has(Number(r.journeyStatusId)))
    ) {
      throw new Error(`slots expected terminal after shipper cancel, got ${JSON.stringify(slotsB)}`);
    }
    report.pass("cancelRules: afterShipperCancel slotsTerminal");
  } catch (error) {
    report.fail("cancelRules", error);
  }
};

module.exports = { runCancelRulesTests };
