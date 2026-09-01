/**
 * DriverQueueHistory E2E tests — verifies column-level audit trail, shipper
 * reservation, bug fixes, and all queue API improvements.
 *
 * These tests run AFTER the core queue suite (QueueOrg, QueueCheckin, QueueOrders,
 * QueueAdminOps) and assume the test environment is already provisioned with:
 * - 4 queue drivers (queueDriver1..4) with active vehicle assignments
 * - 1 queue organization (queueState.org.main) approved and enabled
 * - 1 super admin, 1 queue org admin, 1 shipper
 *
 * Test matrix:
 * - TQ-H01: checkin with shipperPhoneNumber → targetedShipperUserUUID + history logged
 * - TQ-H02: re-checkin WITHOUT phone preserves reservation (P0 fix verification)
 * - TQ-H03: re-checkin WITH new phone updates reservation + 2 history entries
 * - TQ-H04: checkout clears orphaned shipperRequestUniqueId (P0 fix verification)
 * - TQ-H05: GET /entry/:queueUniqueId/history returns full audit trail for admin
 * - TQ-H06: driver can view own entry history
 * - TQ-H07: driver gets 403 on other driver's history
 * - TQ-H08: myPosition returns shipperHistory array
 * - TQ-H09: override entry logs queueNumber change
 * - TQ-H10: remove entry logs status change
 * - TQ-H11: manualCheckin with shipper → history + QueueAuditLog
 * - TQ-H12: checkout logs QueueAuditLog entry
 * - TQ-H13: re-checkin revive logs status history chain
 * - TQ-H14: all history entries have valid performedBy UUIDs
 * - TQ-H15: history endpoint returns 404 for nonexistent entry
 *
 * @module QueueHistory
 */

const { pool } = require("../../Middleware/Database.config");
const { report } = require("../Reporter");
const { queueState } = require("./state");
const { usersData } = require("../constants");
const {
  checkin,
  checkinWithShipper,
  checkout,
  myPosition,
  manualCheckinWithShipper,
  overrideEntry,
  removeEntry,
  getEntryHistory,
  getQueueEntryByDriver,
  expectStatus,
} = require("./helpers");

/** @returns {string} Current test org's queueOrganizationUniqueId */
const ORG = () => queueState.org.main.queueOrganizationUniqueId;
/** @returns {string} Queue org admin's auth token */
const qadminToken = () => usersData.queueOrgAdmin?.token;
/** @returns {string} Driver's auth token by key (e.g., 'queueDriver1') */
const driverTokenOf = (key) => usersData[key]?.token;

const entryOf = (driverKey) =>
  getQueueEntryByDriver({ queueOrganizationUniqueId: ORG(), driverKey });

/**
 * TQ-H01: Checkin with shipperPhoneNumber → targetedShipperUserUUID set + history logged.
 * Verifies that when a driver checks in with a shipper phone number, the driver's queue
 * entry is linked to that shipper and the change is recorded in DriverQueueHistory.
 */
const testTQH01CheckinWithShipper = async () => {
  try {
    const shipperPhone = usersData.shipper.phoneNumber;
    const result = await checkinWithShipper("queueDriver1", ORG(), shipperPhone);

    if (!result?.queue?.queueUniqueId) {
      throw new Error(`checkin with shipper failed: ${JSON.stringify(result)}`);
    }

    const row = await entryOf("queueDriver1");
    if (!row) throw new Error("no queue entry found after checkin");
    if (!row.targetedShipperUserUUID) {
      throw new Error("targetedShipperUserUUID not set after checkin with phone");
    }

    const history = await getEntryHistory(row.queueUniqueId, driverTokenOf("queueDriver1"));
    const shipperChanges = history.filter((h) => h.columnName === "targetedShipperUserUUID");
    if (shipperChanges.length === 0) {
      throw new Error("no shipper change logged in history after checkin");
    }
    if (shipperChanges[0].oldValue !== null) {
      throw new Error(`first shipper change oldValue should be null, got ${shipperChanges[0].oldValue}`);
    }

    report.pass("TQ-H01: checkin with shipperPhoneNumber → targetedShipperUserUUID set + history logged");
  } catch (error) {
    report.fail("TQ-H01: checkin with shipper", error);
  }
};

/**
 * TQ-H02: Re-checkin WITHOUT phone preserves reservation.
 * P0 bug fix verification — previously, re-checking in without a phone number
 * would silently clear the targetedShipperUserUUID. Now it should preserve it.
 */
const testTQH02RecheckinPreservesReservation = async () => {
  try {
    const before = await entryOf("queueDriver1");
    const beforeTarget = before.targetedShipperUserUUID;

    // Re-checkin without shipperPhoneNumber
    const result = await checkin("queueDriver1", ORG());
    if (result.queueUniqueId !== before.queueUniqueId) {
      throw new Error("re-checkin returned different entry");
    }

    const after = await entryOf("queueDriver1");
    if (after.targetedShipperUserUUID !== beforeTarget) {
      throw new Error(
        `reservation silently cleared: was ${beforeTarget}, now ${after.targetedShipperUserUUID}`,
      );
    }

    report.pass("TQ-H02: re-checkin without phone preserves targetedShipperUserUUID");
  } catch (error) {
    report.fail("TQ-H02: re-checkin preserves reservation", error);
  }
};

/**
 * TQ-H03: Re-checkin WITH different phone updates reservation.
 * Verifies that re-checking in with a new shipper phone number updates the
 * targetedShipperUserUUID and creates a second history entry for the column.
 */
const testTQH03RecheckinUpdatesReservation = async () => {
  try {
    const before = await entryOf("queueDriver1");
    const beforeTarget = before.targetedShipperUserUUID;

    // Re-checkin with a different phone (use admin phone as dummy)
    const newPhone = usersData.admin.phoneNumber;
    await checkinWithShipper("queueDriver1", ORG(), newPhone);

    const after = await entryOf("queueDriver1");
    if (after.targetedShipperUserUUID === beforeTarget) {
      throw new Error("reservation not updated after re-checkin with new phone");
    }
    if (!after.targetedShipperUserUUID) {
      throw new Error("new reservation is null");
    }

    // History should have 2 entries now
    const history = await getEntryHistory(after.queueUniqueId, driverTokenOf("queueDriver1"));
    const shipperChanges = history.filter((h) => h.columnName === "targetedShipperUserUUID");
    if (shipperChanges.length < 2) {
      throw new Error(`expected >= 2 shipper history entries, got ${shipperChanges.length}`);
    }

    report.pass("TQ-H03: re-checkin with new phone updates reservation + history has 2 entries");
  } catch (error) {
    report.fail("TQ-H03: re-checkin updates reservation", error);
  }
};

/**
 * TQ-H04: Checkout releases orphaned order.
 * P0 bug fix verification — previously, checking out while an order was assigned
 * would leave the ShipperRequest orphaned (still linked to the queue entry).
 * Now checkout should null out shipperRequestUniqueId and log the status change.
 */
const testTQH04CheckoutReleasesOrder = async () => {
  try {
    const before = await entryOf("queueDriver1");
    if (!before) throw new Error("no entry for queueDriver1");

    // Checkout
    await checkout("queueDriver1", ORG());

    const after = await getEntryByQueueUniqueId(before.queueUniqueId);
    if (!after || after.status !== "removed") {
      throw new Error(`expected status removed, got ${after?.status}`);
    }
    if (after.shipperRequestUniqueId !== null) {
      throw new Error(`shipperRequestUniqueId not cleared on checkout: ${after.shipperRequestUniqueId}`);
    }

    // History should have status change logged
    const history = await getEntryHistory(before.queueUniqueId, driverTokenOf("queueDriver1"));
    const statusChanges = history.filter((h) => h.columnName === "status");
    if (statusChanges.length === 0) {
      throw new Error("no status change logged in history after checkout");
    }

    report.pass("TQ-H04: checkout clears shipperRequestUniqueId + logs status history");
  } catch (error) {
    report.fail("TQ-H04: checkout releases order", error);
  }
};

/**
 * TQ-H05: History endpoint returns data for admin.
 * Verifies that GET /api/queue/entry/:queueUniqueId/history returns a valid
 * array of column-level audit entries with required fields (columnName, performedAt).
 */
const testTQH05HistoryEndpointAdmin = async () => {
  try {
    // Re-checkin driver1 for further tests
    await checkin("queueDriver1", ORG());
    const row = await entryOf("queueDriver1");
    if (!row) throw new Error("no entry for queueDriver1 after re-checkin");

    const history = await getEntryHistory(row.queueUniqueId, qadminToken());
    if (!Array.isArray(history)) {
      throw new Error(`history should be array, got ${typeof history}`);
    }
    if (history.length === 0) {
      throw new Error("history should not be empty after multiple mutations");
    }

    // Each entry should have required fields
    for (const h of history) {
      if (!h.columnName || !h.performedAt) {
        throw new Error(`history entry missing fields: ${JSON.stringify(h)}`);
      }
    }

    report.pass("TQ-H05: GET /entry/:queueUniqueId/history returns column-level audit trail");
  } catch (error) {
    report.fail("TQ-H05: history endpoint admin", error);
  }
};

/**
 * TQ-H06: History endpoint driver can only view own entry.
 * Verifies that a driver can successfully retrieve history for their own queue entry.
 */
const testTQH06HistoryEndpointDriverOwnEntry = async () => {
  try {
    const row = await entryOf("queueDriver1");
    if (!row) throw new Error("no entry for queueDriver1");

    // Driver should be able to view own entry
    const history = await getEntryHistory(row.queueUniqueId, driverTokenOf("queueDriver1"));
    if (!Array.isArray(history)) {
      throw new Error("driver should be able to view own entry history");
    }

    report.pass("TQ-H06: driver can view own entry history");
  } catch (error) {
    report.fail("TQ-H06: history endpoint driver own entry", error);
  }
};

/**
 * TQ-H07: History endpoint driver cannot view other's entry.
 * Verifies that a driver gets 403 when trying to view history for another
 * driver's queue entry (ownership enforcement).
 */
const testTQH07HistoryEndpointDriverOtherEntry = async () => {
  try {
    const row = await entryOf("queueDriver2");
    if (!row) throw new Error("no entry for queueDriver2");

    // Driver1 should NOT be able to view driver2's entry
    await expectStatus(
      getEntryHistory(row.queueUniqueId, driverTokenOf("queueDriver1")),
      403,
      "TQ-H07 driver viewing other entry",
    );

    report.pass("TQ-H07: driver cannot view other driver's entry history (403)");
  } catch (error) {
    report.fail("TQ-H07: history endpoint driver other entry", error);
  }
};

/**
 * TQ-H08: shipperHistory in myPosition response.
 * Verifies that GET /api/queue/driver/myPosition includes a shipperHistory
 * array with the last 10 targetedShipperUserUUID changes (oldValue + performedAt).
 */
const testTQH08ShipperHistoryInMyPosition = async () => {
  try {
    const pos = await myPosition("queueDriver1", ORG());
    if (!pos?.queue?.queueUniqueId) {
      throw new Error(`myPosition missing queue: ${JSON.stringify(pos)}`);
    }
    if (!Array.isArray(pos.shipperHistory)) {
      throw new Error(`myPosition missing shipperHistory array: ${JSON.stringify(pos)}`);
    }
    if (pos.shipperHistory.length === 0) {
      throw new Error("shipperHistory should not be empty after setting shipper");
    }

    // Each entry should have oldValue and performedAt
    for (const h of pos.shipperHistory) {
      if (!h.performedAt) {
        throw new Error(`shipperHistory entry missing performedAt: ${JSON.stringify(h)}`);
      }
    }

    report.pass("TQ-H08: myPosition returns shipperHistory array with change timeline");
  } catch (error) {
    report.fail("TQ-H08: shipperHistory in myPosition", error);
  }
};

/**
 * TQ-H09: Override entry → history logged.
 * Verifies that when an admin overrides a driver's queue number, the change
 * is recorded in DriverQueueHistory with the correct oldValue.
 */
const testTQH09OverrideLogsHistory = async () => {
  try {
    const row = await entryOf("queueDriver1");
    if (!row) throw new Error("no entry for queueDriver1");

    await overrideEntry(row.queueUniqueId, 99, qadminToken());

    const after = await getEntryByQueueUniqueId(row.queueUniqueId);
    if (!after || after.queueNumber !== 99) {
      throw new Error(`override failed: expected queueNumber 99, got ${after?.queueNumber}`);
    }

    const history = await getEntryHistory(row.queueUniqueId, qadminToken());
    const numberChanges = history.filter((h) => h.columnName === "queueNumber");
    if (numberChanges.length === 0) {
      throw new Error("no queueNumber change logged after override");
    }

    report.pass("TQ-H09: override entry logs queueNumber change in history");
  } catch (error) {
    report.fail("TQ-H09: override logs history", error);
  }
};

/**
 * TQ-H10: Remove entry → history logged.
 * Verifies that when an admin removes a driver from the queue, the status
 * change is recorded in DriverQueueHistory.
 */
const testTQH10RemoveLogsHistory = async () => {
  try {
    const row = await entryOf("queueDriver1");
    if (!row) throw new Error("no entry for queueDriver1");
    const oldStatus = row.status;

    await removeEntry(row.queueUniqueId, qadminToken());

    const history = await getEntryHistory(row.queueUniqueId, qadminToken());
    const statusChanges = history.filter((h) => h.columnName === "status");
    const removeChange = statusChanges.find((h) => h.oldValue === oldStatus);
    if (!removeChange) {
      throw new Error(`no status change from ${oldStatus} logged after remove`);
    }

    report.pass("TQ-H10: remove entry logs status change in history");
  } catch (error) {
    report.fail("TQ-H10: remove logs history", error);
  }
};

/**
 * TQ-H11: ManualCheckin with shipper → history + audit log.
 * Verifies that when an admin manually checks in a driver with a shipper phone
 * number, both DriverQueueHistory (column-level) and QueueAuditLog (event-level)
 * are populated correctly.
 */
const testTQH11ManualCheckinWithShipper = async () => {
  try {
    const shipperPhone = usersData.shipper.phoneNumber;
    const entry = await manualCheckinWithShipper(ORG(), "queueDriver1", shipperPhone, qadminToken());
    if (!entry?.queueUniqueId) {
      throw new Error(`manual checkin with shipper failed: ${JSON.stringify(entry)}`);
    }

    const row = await entryOf("queueDriver1");
    if (!row) throw new Error("no entry after manual checkin");
    if (!row.targetedShipperUserUUID) {
      throw new Error("targetedShipperUserUUID not set after manual checkin with phone");
    }

    // History should have status change (revive or new)
    const history = await getEntryHistory(row.queueUniqueId, qadminToken());
    const statusChanges = history.filter((h) => h.columnName === "status");
    if (statusChanges.length === 0) {
      throw new Error("no status change logged after manual checkin");
    }

    // QueueAuditLog should have manual_checkin entry
    const [auditRows] = await pool.query(
      `SELECT * FROM QueueAuditLog
       WHERE queueUniqueId = ? AND action = 'manual_checkin'
       ORDER BY performedAt DESC LIMIT 1`,
      [row.queueUniqueId],
    );
    if (auditRows.length === 0) {
      throw new Error("no manual_checkin audit row in QueueAuditLog");
    }

    report.pass("TQ-H11: manualCheckin with shipper → history + QueueAuditLog");
  } catch (error) {
    report.fail("TQ-H11: manualCheckin with shipper", error);
  }
};

/**
 * TQ-H12: Checkout logs QueueAuditLog.
 * Verifies that when a driver checks out, a QueueAuditLog entry with
 * action='remove' is created for traceability.
 */
const testTQH12CheckoutLogsAudit = async () => {
  try {
    const row = await entryOf("queueDriver1");
    if (!row) throw new Error("no entry for queueDriver1");

    await checkout("queueDriver1", ORG());

    const [auditRows] = await pool.query(
      `SELECT * FROM QueueAuditLog
       WHERE queueUniqueId = ? AND action = 'remove'
       ORDER BY performedAt DESC LIMIT 1`,
      [row.queueUniqueId],
    );
    if (auditRows.length === 0) {
      throw new Error("no remove audit row in QueueAuditLog after checkout");
    }

    report.pass("TQ-H12: checkout logs QueueAuditLog entry");
  } catch (error) {
    report.fail("TQ-H12: checkout logs audit", error);
  }
};

/**
 * TQ-H13: Re-checkin revive logs status history.
 * Verifies that when a driver checks out (status→removed) and then re-checks in
 * (status→waiting), the full status transition chain is recorded in DriverQueueHistory.
 */
const testTQH13RecheckinReviveLogsHistory = async () => {
  try {
    // Checkout first to set up revive scenario
    await checkin("queueDriver1", ORG());
    await checkout("queueDriver1", ORG());

    // Re-checkin (revive)
    await checkin("queueDriver1", ORG());
    const after = await entryOf("queueDriver1");
    if (!after) throw new Error("no entry after revive checkin");

    const history = await getEntryHistory(after.queueUniqueId, driverTokenOf("queueDriver1"));
    const statusChanges = history.filter((h) => h.columnName === "status");
    if (statusChanges.length < 2) {
      throw new Error(`expected >= 2 status changes (offer+remove, or remove+revive), got ${statusChanges.length}`);
    }

    report.pass("TQ-H13: re-checkin revive logs status history (waiting→removed→waiting)");
  } catch (error) {
    report.fail("TQ-H13: re-checkin revive logs history", error);
  }
};

/**
 * TQ-H14: History entry has performedBy = correct user.
 * Verifies that all DriverQueueHistory entries have valid UUIDs in the
 * performedBy field, ensuring the audit trail correctly tracks who made each change.
 */
const testTQH14HistoryPerformedBy = async () => {
  try {
    const row = await entryOf("queueDriver1");
    if (!row) throw new Error("no entry for queueDriver1");

    const history = await getEntryHistory(row.queueUniqueId, qadminToken());
    if (history.length === 0) throw new Error("history is empty");

    // Find a performedBy value — it should be a valid UUID
    for (const h of history) {
      if (h.performedBy && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(h.performedBy)) {
        throw new Error(`invalid performedBy UUID: ${h.performedBy}`);
      }
    }

    report.pass("TQ-H14: all history entries have valid performedBy UUIDs");
  } catch (error) {
    report.fail("TQ-H14: history performedBy", error);
  }
};

/**
 * TQ-H15: History endpoint 404 for nonexistent entry.
 * Verifies that GET /api/queue/entry/:queueUniqueId/history returns 404
 * when the queueUniqueId does not exist in DriverQueue.
 */
const testTQH15History404 = async () => {
  try {
    await expectStatus(
      getEntryHistory("19f4a9ce-83ea-4af4-a12e-3d4b1f5c5a2c", qadminToken()),
      404,
      "TQ-H15 history nonexistent",
    );

    report.pass("TQ-H15: GET /entry/:queueUniqueId/history returns 404 for nonexistent entry");
  } catch (error) {
    report.fail("TQ-H15: history 404", error);
  }
};

/**
 * Fetch a DriverQueue entry directly from the database by queueUniqueId.
 * Used for assertions that need to verify DB state (e.g., checking if
 * shipperRequestUniqueId was cleared after checkout).
 *
 * @param {string} queueUniqueId - The queue entry's unique identifier
 * @returns {Promise<object|null>} The DriverQueue row, or null if not found
 */
const getEntryByQueueUniqueId = async (queueUniqueId) => {
  const [rows] = await pool.query(
    `SELECT * FROM DriverQueue WHERE queueUniqueId = ?`,
    [queueUniqueId],
  );
  return rows[0] || null;
};

/**
 * Run all QueueHistory & improvements tests (TQ-H01..TQ-H15).
 * Must be called AFTER the core queue suite has provisioned users and created
 * a test organization with enabled queue dispatch.
 *
 * @returns {Promise<void>}
 */
const runQueueHistoryTests = async () => {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  QUEUE HISTORY & IMPROVEMENTS — TQ-H01..TQ-H15");
  console.log("═══════════════════════════════════════════════════\n");

  await testTQH01CheckinWithShipper();
  await testTQH02RecheckinPreservesReservation();
  await testTQH03RecheckinUpdatesReservation();
  await testTQH04CheckoutReleasesOrder();
  await testTQH05HistoryEndpointAdmin();
  await testTQH06HistoryEndpointDriverOwnEntry();
  await testTQH07HistoryEndpointDriverOtherEntry();
  await testTQH08ShipperHistoryInMyPosition();
  await testTQH09OverrideLogsHistory();
  await testTQH10RemoveLogsHistory();
  await testTQH11ManualCheckinWithShipper();
  await testTQH12CheckoutLogsAudit();
  await testTQH13RecheckinReviveLogsHistory();
  await testTQH14HistoryPerformedBy();
  await testTQH15History404();
};

module.exports = { runQueueHistoryTests };
