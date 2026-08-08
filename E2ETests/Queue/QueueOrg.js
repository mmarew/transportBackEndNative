"use strict";

// Queue Organization lifecycle — TQ-01..TQ-04, TQ-08 from the queue test plan.

const { pool } = require("../../Middleware/Database.config");
const { report } = require("../Reporter");
const { queueState } = require("./state");
const {
  createQueueOrganization,
  approveQueueOrganization,
  deleteQueueOrganization,
  getQueueOrganizations,
  getQueueStatus,
  checkin,
  superAdminToken,
  driverToken,
  dbToday,
  expectStatus,
} = require("./helpers");

const getMembershipRow = async (queueOrganizationUniqueId, roleId) => {
  const [rows] = await pool.query(
    `SELECT * FROM QueueOrganizationMembership
     WHERE queueOrganizationUniqueId = ? AND roleId = ? AND isActive = 1
       AND membershipDeletedAt IS NULL`,
    [queueOrganizationUniqueId, roleId],
  );
  return rows[0] || null;
};

// ── TQ-01 · Create queue organization (pending state) ─────────────────────────

const testTQ01CreateOrg = async () => {
  try {
    const name = `QA Dispatch Hub ${Date.now()}`;
    const org = await createQueueOrganization(name);
    if (!org?.queueOrganizationUniqueId) {
      throw new Error("No queueOrganizationUniqueId returned");
    }
    if (org.approvalStatus !== "pending") {
      throw new Error(`Expected approvalStatus "pending", got ${org.approvalStatus}`);
    }
    queueState.org.main.queueOrganizationUniqueId = org.queueOrganizationUniqueId;
    queueState.org.main.queueOrganizationName = name;
    report.pass("TQ-01: create org returns pending state");

    const membership = await getMembershipRow(org.queueOrganizationUniqueId, 11);
    if (!membership) {
      throw new Error("Creator not auto-added as role-11 member");
    }
    report.pass("TQ-01: creator auto-added as role-11 member");

    const list = await getQueueOrganizations({
      queueOrganizationUniqueId: org.queueOrganizationUniqueId,
    });
    const visible = Array.isArray(list)
      ? list.some(
          (o) =>
            o.queueOrganizationUniqueId === org.queueOrganizationUniqueId ||
            o.organization?.queueOrganizationUniqueId ===
              org.queueOrganizationUniqueId,
        )
      : list?.queueOrganizationUniqueId === org.queueOrganizationUniqueId ||
        list?.organization?.queueOrganizationUniqueId ===
          org.queueOrganizationUniqueId;
    if (!visible) {
      throw new Error("Org not visible to admin/superadmin via GET list");
    }
    report.pass("TQ-01: org visible to superadmin via GET");
  } catch (error) {
    report.fail("TQ-01: create queue organization", error);
  }
};

// ── TQ-08 · Check-in to unapproved / disabled org → 403 ───────────────────────

const testTQ08CheckinGateBeforeEnable = async () => {
  try {
    const { queueOrganizationUniqueId } = queueState.org.main;
    await expectStatus(
      checkin("queueDriver1", queueOrganizationUniqueId),
      403,
      "TQ-08 checkin-before-approve",
    );
    report.pass("TQ-08: check-in blocked (403) while org pending");
  } catch (error) {
    report.fail("TQ-08: check-in gate before enable", error);
  }
};

// ── TQ-02 · Approve + enable; check-in gate opens ─────────────────────────────

const testTQ02ApproveAndEnable = async () => {
  try {
    const { queueOrganizationUniqueId } = queueState.org.main;

    // Negative: a driver token cannot approve.
    await expectStatus(
      approveQueueOrganization({
        queueOrganizationUniqueId,
        token: driverToken("queueDriver1"),
      }),
      [401, 403],
      "TQ-02 approve-with-driver-token",
    );
    report.pass("TQ-02: driver token denied (401/403) on approve");

    // Approve but keep disabled → check-in still blocked.
    await approveQueueOrganization({
      queueOrganizationUniqueId,
      approvalStatus: "approved",
      queueEnabled: false,
    });
    await expectStatus(
      checkin("queueDriver1", queueOrganizationUniqueId),
      403,
      "TQ-02 checkin-approved-but-disabled",
    );
    report.pass("TQ-02: check-in blocked (403) while queueEnabled=0");

    // Enable → check-in succeeds (driver01 → queueNumber 1).
    await approveQueueOrganization({
      queueOrganizationUniqueId,
      approvalStatus: "approved",
      queueEnabled: true,
    });
    const status = await getQueueStatus(queueOrganizationUniqueId);
    if (status.queueOrganization.approvalStatus !== "approved") {
      throw new Error("approvalStatus not 'approved' after approve");
    }
    if (status.queueOrganization.queueEnabled !== 1 && status.queueOrganization.queueEnabled !== true) {
      throw new Error("queueEnabled not 1 after enable");
    }
    report.pass("TQ-02: org approved + enabled (DB reflects)");

    const checkinData = await checkin("queueDriver1", queueOrganizationUniqueId);
    if (checkinData.queueNumber !== 1) {
      throw new Error(`Expected queueNumber 1, got ${checkinData.queueNumber}`);
    }
    report.pass("TQ-02: check-in succeeds after enable (driver01=1)");
  } catch (error) {
    report.fail("TQ-02: approve + enable + gate", error);
  }
};

// ── TQ-03 · Suspend disables dispatch ─────────────────────────────────────────

const testTQ03SuspendDisables = async () => {
  try {
    const { queueOrganizationUniqueId } = queueState.org.main;
    await approveQueueOrganization({
      queueOrganizationUniqueId,
      approvalStatus: "suspended",
      queueEnabled: false,
    });
    const status = await getQueueStatus(queueOrganizationUniqueId);
    if (status.queueOrganization.approvalStatus !== "suspended") {
      throw new Error("approvalStatus not 'suspended' after suspend");
    }
    report.pass("TQ-03: org suspended");

    await expectStatus(
      checkin("queueDriver2", queueOrganizationUniqueId),
      403,
      "TQ-03 checkin-while-suspended",
    );
    report.pass("TQ-03: new check-in blocked (403) while suspended");

    // Restore for the rest of the suite.
    await approveQueueOrganization({
      queueOrganizationUniqueId,
      approvalStatus: "approved",
      queueEnabled: true,
    });
  } catch (error) {
    report.fail("TQ-03: suspend disables dispatch", error);
  }
};

// ── TQ-04 · Soft-delete org (cleanup, runs last) ──────────────────────────────

const testTQ04SoftDelete = async () => {
  try {
    const { queueOrganizationUniqueId } = queueState.org.main;
    await expectStatus(
      deleteQueueOrganization(queueOrganizationUniqueId, driverToken("queueDriver1")),
      [401, 403],
      "TQ-04 delete-with-driver-token",
    );
    report.pass("TQ-04: driver token denied (401/403) on delete");

    await deleteQueueOrganization(queueOrganizationUniqueId);
    await expectStatus(
      checkin("queueDriver1", queueOrganizationUniqueId),
      [403, 404],
      "TQ-04 checkin-after-delete",
    );
    report.pass("TQ-04: org soft-deleted; check-in now fails");

    const list = await getQueueOrganizations({
      queueOrganizationUniqueId,
    });
    const stillVisible = Array.isArray(list)
      ? list.some(
          (o) =>
            o.queueOrganizationUniqueId === queueOrganizationUniqueId ||
            o.organization?.queueOrganizationUniqueId ===
              queueOrganizationUniqueId,
        )
      : list?.queueOrganizationUniqueId === queueOrganizationUniqueId ||
        list?.organization?.queueOrganizationUniqueId ===
          queueOrganizationUniqueId;
    if (stillVisible) {
      throw new Error("Soft-deleted org still returned by GET list");
    }
    report.pass("TQ-04: soft-deleted org no longer listed");
  } catch (error) {
    report.fail("TQ-04: soft-delete org", error);
  }
};

// ── Entry point ───────────────────────────────────────────────────────────────

const runQueueOrgTests = async () => {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  QUEUE ORG LIFECYCLE — TQ-01..TQ-04, TQ-08");
  console.log("═══════════════════════════════════════════════════\n");

  await testTQ01CreateOrg();
  await testTQ08CheckinGateBeforeEnable();
  await testTQ02ApproveAndEnable();
  await testTQ03SuspendDisables();
};

module.exports = {
  runQueueOrgTests,
  testTQ04SoftDelete,
};
