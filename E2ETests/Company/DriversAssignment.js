const { usersData, backendURL } = require("../constants");
const axios = require("axios");
const {
  COMPANY_ASSIGNMENT_ENDPOINTS,
} = require("../../Routes/EndPoints/companyAssignment.endpoints");
const { authConfig } = require("../Utils");

const logError = (message, error) => {
  console.error(
    `DriversAssignmentError: ${message}`,
    error?.response?.data?.error || error?.message || error,
  );
};

const testCreateAssignment = async ({ userType = "companyAdmin" } = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) { logError("No token"); return null; }

  const bid = usersData?.companyAdmin?.bids?.submitted?.[0]?.offers?.[0]
    || usersData?.companyAdmin?.bids?.submitted?.[0];
  const companyBidRequestUniqueId = bid?.companyBidRequestUniqueId;
  const vehicleUniqueId = usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
  const driverUserUniqueId = usersData?.driver?.userUniqueId;

  if (!companyBidRequestUniqueId || !vehicleUniqueId || !driverUserUniqueId) {
    logError("Missing required IDs for assignment creation");
    return null;
  }

  const url = backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.CREATE_ASSIGNMENT;
  const payload = { companyBidRequestUniqueId, vehicleUniqueId, driverUserUniqueId };

  try {
    const res = await axios.post(url, payload, authConfig(token));
    console.log("✅ Assignment created");
    return res.data.data;
  } catch (error) {
    logError("Failed to create assignment", error);
    return null;
  }
};

const testBulkAssign = async ({ userType = "companyAdmin" } = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) { logError("No token"); return null; }

  const bid = usersData?.companyAdmin?.bids?.submitted?.[0]?.offers?.[0]
    || usersData?.companyAdmin?.bids?.submitted?.[0];
  const companyBidRequestUniqueId = bid?.companyBidRequestUniqueId;
  const vehicleUniqueId = usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
  const driverUserUniqueId = usersData?.driver?.userUniqueId;

  if (!companyBidRequestUniqueId || !vehicleUniqueId || !driverUserUniqueId) {
    logError("Missing required IDs for bulk assign");
    return null;
  }

  const url = backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.BULK_ASSIGN;
  const payload = {
    companyBidRequestUniqueId,
    assignments: [{ vehicleUniqueId, driverUserUniqueId }],
  };

  try {
    const res = await axios.post(url, payload, authConfig(token));
    console.log("✅ Bulk assignment created");
    return res.data.data;
  } catch (error) {
    logError("Failed to bulk assign", error);
    return null;
  }
};

const testGetAssignments = async ({ userType = "companyAdmin", queryParams = {} } = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) { logError("No token"); return []; }

  const company = usersData?.[userType]?.companies?.[0];
  if (!company) { logError("No company found"); return []; }

  const params = new URLSearchParams({ companyUniqueId: company.companyUniqueId, ...queryParams });
  const url = backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.GET_ASSIGNMENTS + "?" + params.toString();

  try {
    const res = await axios.get(url, authConfig(token));
    console.log(`✅ Assignments fetched: ${res.data.data?.length ?? 0}`);
    return res.data.data;
  } catch (error) {
    logError("Failed to get assignments", error);
    return [];
  }
};

const testUpdateAssignmentStatus = async ({
  userType = "companyAdmin",
  assignmentUniqueId,
  assignmentStatus = "confirmed_by_driver",
} = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) { logError("No token"); return null; }
  if (!assignmentUniqueId) { logError("No assignmentUniqueId provided"); return null; }

  const url = backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.UPDATE_ASSIGNMENT_STATUS.replace(
    ":assignmentUniqueId", assignmentUniqueId,
  );

  try {
    const res = await axios.patch(url, {
      assignmentStatus,
      originLatitude: 9.0205,
      originLongitude: 38.8025,
      originPlace: "Addis Ababa, Ethiopia",
    }, authConfig(token));
    console.log(`✅ Assignment status updated to ${assignmentStatus}`);
    return res.data.data;
  } catch (error) {
    logError("Failed to update assignment status", error);
    return null;
  }
};

const testDeleteAssignment = async ({
  userType = "companyAdmin",
  assignmentUniqueId,
} = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) { logError("No token"); return null; }
  if (!assignmentUniqueId) { logError("No assignmentUniqueId provided"); return null; }

  const url = backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.DELETE_ASSIGNMENT.replace(
    ":assignmentUniqueId", assignmentUniqueId,
  );

  try {
    const res = await axios.delete(url, authConfig(token));
    console.log("✅ Assignment deleted");
    return res.data.data;
  } catch (error) {
    logError("Failed to delete assignment", error);
    return null;
  }
};

const testDriversAssignmentWorkflow = async ({ userType = "companyAdmin" } = {}) => {
  console.log("\n── Drivers Assignment Workflow ──");
  const assignment = await testCreateAssignment({ userType });
  if (assignment?.assignmentUniqueId) {
    await testUpdateAssignmentStatus({ userType, assignmentUniqueId: assignment.assignmentUniqueId });
  }
  await testGetAssignments({ userType });
  if (assignment?.assignmentUniqueId) {
    await testDeleteAssignment({ userType, assignmentUniqueId: assignment.assignmentUniqueId });
  }
  console.log("── Drivers Assignment Workflow complete ──\n");
};

const testGetCompanyAssignments = async () => {
  const token = usersData?.companyAdmin?.token;
  if (!token) {
    console.log("⏩ GET /api/company/assignments: no company admin token");
    return;
  }
  console.log("\n── GET /api/company/assignments ──");
  try {
    const res = await axios.get(
      backendURL + "/api/company/assignments",
      authConfig(token),
    );
    console.log(`✅ GET /api/company/assignments — ${res.data?.message || "ok"}`);
  } catch (error) {
    console.error("❌ GET /api/company/assignments:", error.response?.data?.error || error.message);
  }
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
