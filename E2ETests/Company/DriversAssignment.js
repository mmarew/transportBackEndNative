const { usersData, backendURL } = require("../constants");
const axios = require("axios");
const {
  COMPANY_ASSIGNMENT_ENDPOINTS,
} = require("../../Routes/EndPoints/companyAssignment.endpoints");
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
  testDeleteAssignment,
  testDriversAssignmentWorkflow,
  testGetCompanyAssignments,
};
