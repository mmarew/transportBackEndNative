const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

// ── DELETE /api/user/users/:userUniqueId ──────────────────────────────────────
const testDeleteUser = async () => {
  const token = usersData?.admin?.token;
  const uid =
    usersData?.driver?.userUniqueId ||
    usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !uid) {
    console.log("⏩ testDeleteUser: admin token or driver UUID not available");
    return;
  }
  console.log("\n── DELETE /api/user/users/:userUniqueId ──");
  try {
    const res = await axios.delete(
      backendURL + `/api/user/users/${uid}`,
      authConfig(token),
    );
    console.log(`✅ deleteUser: ${res.data?.message || "success"}`);
  } catch (err) {
    console.error("❌ deleteUser:", err.response?.data?.error || err.message);
    throw err;
  }
};

// ── PATCH /api/company/companies/:companyUniqueId ──────────────────────────────
const testUpdateCompany = async () => {
  const company = usersData?.companyAdmin?.companies?.[0];
  const token = usersData?.companyAdmin?.token;
  if (!company || !token) {
    console.log("⏩ testUpdateCompany: company or token not available");
    return;
  }
  console.log("\n── PATCH /api/company/companies/:companyUniqueId ──");
  try {
    const res = await axios.patch(
      backendURL + `/api/company/companies/${company.companyUniqueId}`,
      { companyAddress: "Updated E2E Address" },
      authConfig(token),
    );
    console.log(`✅ updateCompany: ${res.data?.message || "success"}`);
  } catch (err) {
    console.error("❌ updateCompany:", err.response?.data?.error || err.message);
    throw err;
  }
};

// ── DELETE /api/company/companies/:companyUniqueId ─────────────────────────────
const testDeleteCompany = async () => {
  const adminToken = usersData?.admin?.token;
  // Create a throwaway company to delete
  const companyToken = usersData?.companyAdmin?.token;
  if (!adminToken || !companyToken) {
    console.log("⏩ testDeleteCompany: tokens not available");
    return;
  }

  const tempPayload = {
    companyName: `TempDelete-${Date.now()}`,
    companyRegistrationNumber: `TEMP-${Date.now()}`,
    companyPhone: `+251${String(Date.now()).slice(-9)}`,
    companyEmail: `tempdelete${Date.now()}@test.com`,
    companyAddress: "Temp Address",
  };

  let tempCompany;
  try {
    const created = await axios.post(
      backendURL + "/api/company/companies",
      tempPayload,
      authConfig(companyToken),
    );
    tempCompany = created.data?.data || created.data;
  } catch (err) {
    console.log("⏩ testDeleteCompany: could not create temp company:", err.response?.data?.error || err.message);
    return;
  }

  const companyId = tempCompany?.companyUniqueId || tempCompany?.companyUniqueId;
  if (!companyId) {
    console.log("⏩ testDeleteCompany: no companyUniqueId from creation");
    return;
  }

  console.log("\n── DELETE /api/company/companies/:companyUniqueId ──");
  try {
    const res = await axios.delete(
      backendURL + `/api/company/companies/${companyId}`,
      authConfig(adminToken),
    );
    console.log(`✅ deleteCompany: ${res.data?.message || "success"}`);
  } catch (err) {
    console.error("❌ deleteCompany:", err.response?.data?.error || err.message);
    throw err;
  }
};

// ── PATCH /api/shipperRequestBatch/:batchUniqueId ──────────────────────────────
const testUpdateBatch = async () => {
  const token = usersData?.shipper?.token || usersData?.admin?.token;
  if (!token) {
    console.log("⏩ testUpdateBatch: token not available");
    return;
  }
  let batchId;
  try {
    const list = await axios.get(
      backendURL + "/api/shipperRequestBatch?requestMode=company_target&limit=1",
      authConfig(token),
    );
    const data = list.data?.data || list.data;
    batchId = Array.isArray(data) ? data[0]?.batchUniqueId : data?.[0]?.batchUniqueId;
  } catch (err) {
    console.log("⏩ testUpdateBatch: could not fetch batches:", err.response?.data?.error || err.message);
    return;
  }
  if (!batchId) {
    console.log("⏩ testUpdateBatch: no batch available");
    return;
  }

  console.log("\n── PATCH /api/shipperRequestBatch/:batchUniqueId ──");
  try {
    const res = await axios.patch(
      backendURL + `/api/shipperRequestBatch/${batchId}`,
      { shippableItemName: "Updated E2E Item" },
      authConfig(token),
    );
    console.log(`✅ updateBatch: ${res.data?.message || "success"}`);
  } catch (err) {
    console.error("❌ updateBatch:", err.response?.data?.error || err.message);
    throw err;
  }
};

// ── DELETE /api/shipperRequestBatch/:batchUniqueId ─────────────────────────────
const testDeleteBatch = async () => {
  const token = usersData?.shipper?.token || usersData?.admin?.token;
  if (!token) {
    console.log("⏩ testDeleteBatch: token not available");
    return;
  }

  // Create a temp batch by fetching one and cloning via the shipper
  let batchId;
  try {
    const list = await axios.get(
      backendURL + "/api/shipperRequestBatch?requestMode=company_target&limit=1",
      authConfig(token),
    );
    const data = list.data?.data || list.data;
    batchId = Array.isArray(data) ? data[0]?.batchUniqueId : data?.[0]?.batchUniqueId;
  } catch (err) {
    console.log("⏩ testDeleteBatch: could not fetch batches");
    return;
  }
  if (!batchId) {
    console.log("⏩ testDeleteBatch: no batch available");
    return;
  }

  console.log("\n── DELETE /api/shipperRequestBatch/:batchUniqueId ──");
  try {
    const res = await axios.delete(
      backendURL + `/api/shipperRequestBatch/${batchId}`,
      authConfig(token),
    );
    console.log(`✅ deleteBatch: ${res.data?.message || "success"}`);
  } catch (err) {
    console.error("❌ deleteBatch:", err.response?.data?.error || err.message);
    throw err;
  }
};

// ── POST /api/vehicle/attachDocuments/:vehicleUniqueId ─────────────────────────
const testVehicleDocumentUpload = async () => {
  const vehicleUniqueId = usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
  const token = usersData?.driver?.token;
  if (!vehicleUniqueId || !token) {
    console.log("⏩ testVehicleDocumentUpload: vehicle UUID or token not available");
    return;
  }

  console.log("\n── POST /api/vehicle/attachDocuments/:vehicleUniqueId ──");
  const dummyPng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
    0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0x60, 0x60, 0x00, 0x00,
    0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
  ]);
  const form = new FormData();

  // File fieldname = "document" → controller looks for documentTypeId, documentDescription, etc.
  const docTypeId = 10; // Vehicle Insurance or similar
  form.append("document", new Blob([dummyPng], { type: "image/png" }), "doc.png");
  form.append("documentTypeId", String(docTypeId));
  form.append("documentDescription", "E2E test vehicle document");

  try {
    const res = await axios.post(
      backendURL + `/api/vehicle/attachDocuments/${vehicleUniqueId}`,
      form,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    console.log(`✅ vehicleDocumentUpload: ${res.data?.message || "success"}`);
  } catch (err) {
    console.error("❌ vehicleDocumentUpload:", err.response?.data?.error || err.message);
    throw err;
  }
};

module.exports = {
  testDeleteUser,
  testUpdateCompany,
  testDeleteCompany,
  testUpdateBatch,
  testDeleteBatch,
  testVehicleDocumentUpload,
};
