const { usersData, backendURL, journeyStatusMap } = require("../constants");
const axios = require("axios");
const { pool } = require("../../Middleware/Database.config");
const {
  COMPANY_ASSIGNMENT_ENDPOINTS,
} = require("../../Routes/EndPoints/companyAssignment.endpoints");
const {
  DRIVER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/driverRequest.endpoints");
const { authConfig } = require("../Utils");
const { report } = require("../Reporter");
const { getBids } = require("./BidManagement");

// ─────────────────────────────────────────────────────────────────────────────
// Failure policy for this file (mirrors E2ETests/Expect.js):
//   • unmet precondition  → report.skip(...)   (declared, counted, visible)
//   • HTTP/logic failure  → throw              (counted as ❌ by the runner)
// Nothing here may swallow an error and still print ✅.
// ─────────────────────────────────────────────────────────────────────────────

const requireToken = (userType) => {
  const token = usersData?.[userType]?.token;
  if (!token) throw new Error(`${userType} token not found`);
  return token;
};

/**
 * Assignments may only be created against a bid the SHIPPER has accepted
 * (Services/CompanyAssignment/assignmentCreate.service.js enforces
 * `bidStatus === "accepted_by_shipper"`). Picking a merely-submitted bid makes
 * the create fail with 400 — a precondition problem, not a backend bug.
 */
const resolveAcceptedBid = () => {
  const buckets = usersData?.companyAdmin?.bids || {};
  const accepted = buckets["accepted_by_shipper"];
  const fromBucket = Array.isArray(accepted) ? accepted[0] : accepted;
  if (fromBucket?.companyBidRequestUniqueId) return fromBucket;

  // Fallback: scan every cached bucket for a row already in the accepted state.
  for (const rows of Object.values(buckets)) {
    const list = Array.isArray(rows) ? rows : [rows];
    const hit = list.find(
      (row) =>
        row?.bidStatus === "accepted_by_shipper" && row?.companyBidRequestUniqueId,
    );
    if (hit) return hit;
  }
  return null;
};

const resolveAssignmentInputs = () => {
  const bid = resolveAcceptedBid();
  const vehicleUniqueId = usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
  const driverUserUniqueId =
    usersData?.driver?.accountData?.userData?.userUniqueId;
  return { bid, vehicleUniqueId, driverUserUniqueId };
};

const testCreateAssignment = async ({ userType = "companyAdmin" } = {}) => {
  const token = requireToken(userType);
  const { bid, vehicleUniqueId, driverUserUniqueId } = resolveAssignmentInputs();
  const companyBidRequestUniqueId = bid?.companyBidRequestUniqueId;

  if (!companyBidRequestUniqueId || !vehicleUniqueId || !driverUserUniqueId) {
    report.skip(
      "create company assignment",
      `precondition not met (acceptedBid=${Boolean(companyBidRequestUniqueId)}, vehicle=${Boolean(vehicleUniqueId)}, driver=${Boolean(driverUserUniqueId)})`,
    );
    return null;
  }

  const url = backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.CREATE_ASSIGNMENT;
  const payload = { companyBidRequestUniqueId, vehicleUniqueId, driverUserUniqueId };

  const res = await axios.post(url, payload, authConfig(token));
  const created = res.data?.data;
  if (!created?.assignmentUniqueId) {
    throw new Error(
      `create assignment returned no assignmentUniqueId: ${JSON.stringify(res.data).slice(0, 300)}`,
    );
  }
  console.log(`✅ Assignment created: ${created.assignmentUniqueId}`);
  report.pass("create company assignment (accepted bid → slot assigned)");
  return created;
};

const testBulkAssign = async ({ userType = "companyAdmin" } = {}) => {
  const token = requireToken(userType);
  const { bid, vehicleUniqueId, driverUserUniqueId } = resolveAssignmentInputs();
  const companyBidRequestUniqueId = bid?.companyBidRequestUniqueId;

  if (!companyBidRequestUniqueId || !vehicleUniqueId || !driverUserUniqueId) {
    report.skip(
      "bulk assign company vehicles",
      "no accepted_by_shipper bid / vehicle / driver available",
    );
    return null;
  }

  const url = backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.BULK_ASSIGN;
  const payload = {
    companyBidRequestUniqueId,
    assignments: [{ vehicleUniqueId, driverUserUniqueId }],
  };

  const res = await axios.post(url, payload, authConfig(token));
  console.log("✅ Bulk assignment created");
  report.pass("bulk assign company vehicles");
  return res.data?.data;
};

const testGetAssignments = async ({ userType = "companyAdmin", queryParams = {} } = {}) => {
  const token = requireToken(userType);
  const company = usersData?.[userType]?.companies?.[0];
  if (!company) throw new Error(`No company found for ${userType}`);

  const params = new URLSearchParams({
    companyUniqueId: company.companyUniqueId,
    ...queryParams,
  });
  const url =
    backendURL +
    COMPANY_ASSIGNMENT_ENDPOINTS.GET_ASSIGNMENTS +
    "?" +
    params.toString();

  const res = await axios.get(url, authConfig(token));
  const rows = res.data?.data ?? [];
  console.log(`✅ Assignments fetched: ${rows.length}`);
  return rows;
};

const testUpdateAssignmentStatus = async ({
  userType = "companyAdmin",
  assignmentUniqueId,
  assignmentStatus = "confirmed_by_driver",
} = {}) => {
  const token = requireToken(userType);
  if (!assignmentUniqueId) {
    throw new Error("No assignmentUniqueId provided — create the assignment first");
  }

  const url =
    backendURL +
    COMPANY_ASSIGNMENT_ENDPOINTS.UPDATE_ASSIGNMENT_STATUS.replace(
      ":assignmentUniqueId",
      assignmentUniqueId,
    );

  const res = await axios.patch(
    url,
    {
      assignmentStatus,
      originLatitude: 9.0205,
      originLongitude: 38.8025,
      originPlace: "Addis Ababa, Ethiopia",
    },
    authConfig(token),
  );
  console.log(`✅ Assignment status updated to ${assignmentStatus}`);
  return res.data?.data;
};

const testVerifyAssignedDriverStatus = async ({
  assignmentUniqueId,
  driverRequestUniqueId,
} = {}) => {
  const token = usersData?.driver?.token;
  if (!token) {
    report.skip(
      "verify requested company assignment when request is inactive",
      "no driver token available",
    );
    return;
  }
  if (!assignmentUniqueId || !driverRequestUniqueId) {
    throw new Error("Assignment and DriverRequest IDs are required for status verification");
  }

  const [requestRows] = await pool.query(
    `SELECT journeyStatusId, driverRequestDeletedAt
     FROM DriverRequest
     WHERE driverRequestUniqueId = ?
     LIMIT 1`,
    [driverRequestUniqueId],
  );
  if (!requestRows[0]) {
    throw new Error("DriverRequest for the new company assignment was not found");
  }

  const previousStatus = requestRows[0].journeyStatusId;
  const previousDeletedAt = requestRows[0].driverRequestDeletedAt;
  await pool.query(
    `UPDATE DriverRequest
     SET journeyStatusId = ?, driverRequestDeletedAt = CURRENT_TIMESTAMP
     WHERE driverRequestUniqueId = ?`,
    [journeyStatusMap.replacedByCompanyAssignment, driverRequestUniqueId],
  );

  let repaired = false;
  try {
    const res = await axios.get(
      backendURL + DRIVER_REQUEST_ENDPOINTS.VERIFY_DRIVER_JOURNEY_STATUS,
      authConfig(token),
    );
    if (
      Number(res.data?.status) !== journeyStatusMap.requested ||
      res.data?.companyAssignment?.assignmentUniqueId !== assignmentUniqueId
    ) {
      throw new Error(
        `Expected requested status for active company assignment, got ${JSON.stringify({
          status: res.data?.status,
          assignmentUniqueId: res.data?.companyAssignment?.assignmentUniqueId,
        })}`,
      );
    }
    const [repairedRequests] = await pool.query(
      `SELECT journeyStatusId, driverRequestDeletedAt
       FROM DriverRequest
       WHERE driverRequestUniqueId = ?
       LIMIT 1`,
      [driverRequestUniqueId],
    );
    if (
      Number(repairedRequests[0]?.journeyStatusId) !== journeyStatusMap.requested ||
      repairedRequests[0]?.driverRequestDeletedAt
    ) {
      throw new Error(
        `Expected linked DriverRequest to be active after verification, got ${JSON.stringify({
          journeyStatusId: repairedRequests[0]?.journeyStatusId,
          deleted: Boolean(repairedRequests[0]?.driverRequestDeletedAt),
        })}`,
      );
    }
    repaired = true;
    report.pass(
      "restore active DriverRequest for requested company assignment",
    );
  } finally {
    if (!repaired) {
      await pool.query(
        `UPDATE DriverRequest
         SET journeyStatusId = ?, driverRequestDeletedAt = ?
         WHERE driverRequestUniqueId = ?`,
        [previousStatus, previousDeletedAt, driverRequestUniqueId],
      );
    }
  }
};

const testDeleteAssignment = async ({
  userType = "companyAdmin",
  assignmentUniqueId,
} = {}) => {
  const token = requireToken(userType);
  if (!assignmentUniqueId) {
    throw new Error("No assignmentUniqueId provided — create the assignment first");
  }

  const url =
    backendURL +
    COMPANY_ASSIGNMENT_ENDPOINTS.DELETE_ASSIGNMENT.replace(
      ":assignmentUniqueId",
      assignmentUniqueId,
    );

  const res = await axios.delete(url, authConfig(token));
  console.log(`✅ Assignment deleted: ${assignmentUniqueId}`);
  return res.data?.data;
};

// Full CRUD lifecycle: create → update → get → delete. The mutating steps only
// run when the create actually produced a row, so an update/delete can never be
// exercised against data that was never created.
const testDriversAssignmentWorkflow = async ({ userType = "companyAdmin" } = {}) => {
  console.log("\n── Drivers Assignment Workflow ──");

  // Refresh the accepted-bid precondition straight from the API before creating
  // anything: earlier phases (cancel rules) can cancel the bid cached in
  // usersData, and the server only allows assignments on a bid the shipper has
  // accepted. Never trust a stale cache as a create precondition.
  await getBids({ userType, bidStatus: "accepted_by_shipper" });

  const assignment = await testCreateAssignment({ userType });

  if (assignment?.assignmentUniqueId) {
    await testVerifyAssignedDriverStatus({
      assignmentUniqueId: assignment.assignmentUniqueId,
      driverRequestUniqueId: assignment.driverRequestUniqueId,
    });
    await testUpdateAssignmentStatus({
      userType,
      assignmentUniqueId: assignment.assignmentUniqueId,
    });
    await testGetAssignments({ userType });
    await testDeleteAssignment({
      userType,
      assignmentUniqueId: assignment.assignmentUniqueId,
    });
  } else {
    // Create was skipped for a declared precondition reason; still cover GET.
    await testGetAssignments({ userType });
    report.skip(
      "assignment update/delete lifecycle",
      "no assignment was created (see skip above)",
    );
  }

  console.log("── Drivers Assignment Workflow complete ──\n");
};

const testGetCompanyAssignments = async () => {
  const token = usersData?.companyAdmin?.token;
  if (!token) {
    report.skip(
      "GET /api/company/assignments",
      "no company admin token available",
    );
    return;
  }
  console.log("\n── GET /api/company/assignments ──");
  const res = await axios.get(
    backendURL + "/api/company/assignments",
    authConfig(token),
  );
  console.log(`✅ GET /api/company/assignments — ${res.data?.message || "ok"}`);
};

module.exports = {
  testCreateAssignment,
  testBulkAssign,
  testGetAssignments,
  testUpdateAssignmentStatus,
  testVerifyAssignedDriverStatus,
  testDeleteAssignment,
  testDriversAssignmentWorkflow,
  testGetCompanyAssignments,
};
