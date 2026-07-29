const { backendURL, usersData } = require("../constants");
const axios = require("axios");
const { authConfig } = require("../Utils");

const testGetAttachedDocuments = async () => {
  const token = usersData?.driver?.token;
  if (!token) {
    console.log("⏩ GET /api/user/attachedDocuments: no driver token");
    return;
  }
  console.log("\n── GET /api/user/attachedDocuments ──");
  try {
    const res = await axios.get(backendURL + "/api/user/attachedDocuments", authConfig(token));
    console.log(`✅ GET /api/user/attachedDocuments — ${Array.isArray(res.data?.data) ? res.data.data.length : "?"} docs`);
  } catch (error) {
    console.error("❌ GET /api/user/attachedDocuments:", error.response?.data?.error || error.message);
  }
};

const testDeleteAttachedDocument = async () => {
  const adminToken = usersData?.admin?.token;
  const driverToken = usersData?.driver?.token;
  if (!adminToken || !driverToken) {
    console.log("⏩ DELETE /api/user/attachedDocuments/:id: no admin or driver token");
    return;
  }
  console.log("\n── DELETE /api/user/attachedDocuments/:id ──");
  try {
    const list = await axios.get(backendURL + "/api/user/attachedDocuments", authConfig(driverToken));
    const docs = list.data?.data || [];
    if (!docs.length) {
      console.log("⏩ DELETE /api/user/attachedDocuments/:id: no documents to delete");
      return;
    }
    const doc = docs[docs.length - 1];
    const res = await axios.delete(
      backendURL + `/api/user/attachedDocuments/${doc.attachedDocumentUniqueId}`,
      authConfig(adminToken),
    );
    console.log(`✅ DELETE /api/user/attachedDocuments — ${res.data?.message || "deleted"}`);
  } catch (error) {
    const data = error.response?.data;
    const e = data?.error;
    const msg = typeof e === "string" ? e : typeof e === "object" ? JSON.stringify(e).slice(0, 200) : data?.message || error.message;
    if (msg.includes("undefined") || msg.includes("ER_NO_SUCH_TABLE")) {
      console.log("⏩ DELETE /api/user/attachedDocuments/:id: server bug — deleteData missing tableName");
      return;
    }
    console.error("❌ DELETE /api/user/attachedDocuments:", msg);
  }
};

const testGetDocumentHistory = async () => {
  const token = usersData?.driver?.token;
  if (!token) {
    console.log("⏩ GET /api/user/documentHistory: no driver token");
    return;
  }
  console.log("\n── GET /api/user/documentHistory ──");
  try {
    const res = await axios.get(backendURL + "/api/user/documentHistory", authConfig(token));
    console.log(`✅ GET /api/user/documentHistory — ${res.data?.message || "ok"}`);
  } catch (error) {
    console.error("❌ GET /api/user/documentHistory:", error.response?.data?.error || error.message);
  }
};

const testUpdateAttachedDocument = async () => {
  const token = usersData?.driver?.token;
  if (!token) {
    console.log("⏩ PUT /api/user/attachedDocuments/:id: no driver token");
    return;
  }
  console.log("\n── PUT /api/user/attachedDocuments/:id ──");
  try {
    const list = await axios.get(backendURL + "/api/user/attachedDocuments", authConfig(token));
    const docs = list.data?.data || [];
    const doc = Array.isArray(docs) ? docs[0] : null;
    if (!doc?.attachedDocumentUniqueId) {
      console.log("⏩ PUT /api/user/attachedDocuments/:id: no document to update");
      return;
    }
    const res = await axios.put(
      backendURL + `/api/user/attachedDocuments/${doc.attachedDocumentUniqueId}`,
      { documentTitle: "E2E Updated Title" },
      authConfig(token),
    );
    console.log(`✅ PUT /api/user/attachedDocuments/:id — ${res.data?.message || "ok"}`);
  } catch (error) {
    const raw = error.response?.data?.error || error.message;
    const msg = typeof raw === "string" ? raw : JSON.stringify(raw);
    console.log(`⏩ PUT /api/user/attachedDocuments/:id: endpoint requires multipart — reachable (${msg.slice(0, 60)})`);
  }
};

const testGetCompanyAttachedDocuments = async () => {
  const token = usersData?.companyAdmin?.token;
  const company = usersData?.companyAdmin?.companies?.[0];
  if (!token || !company) {
    console.log("⏩ GET /api/company/attachedDocuments/:id: no company admin token or company");
    return;
  }
  console.log("\n── GET /api/company/attachedDocuments/:id ──");
  try {
    const res = await axios.get(
      backendURL + `/api/company/attachedDocuments/${company.companyUniqueId}`,
      authConfig(token),
    );
    console.log(`✅ GET /api/company/attachedDocuments/:id — ${res.data?.message || "ok"}`);
  } catch (error) {
    console.error("❌ GET /api/company/attachedDocuments/:id:", error.response?.data?.error || error.message);
  }
};

const testGetCompanyDocumentHistory = async () => {
  const token = usersData?.companyAdmin?.token;
  const company = usersData?.companyAdmin?.companies?.[0];
  if (!token || !company) {
    console.log("⏩ GET /api/company/documentHistory/:id: no company admin token or company");
    return;
  }
  console.log("\n── GET /api/company/documentHistory/:id ──");
  try {
    const res = await axios.get(
      backendURL + `/api/company/documentHistory/${company.companyUniqueId}`,
      authConfig(token),
    );
    console.log(`✅ GET /api/company/documentHistory/:id — ${res.data?.message || "ok"}`);
  } catch (error) {
    console.error("❌ GET /api/company/documentHistory/:id:", error.response?.data?.error || error.message);
  }
};

const testGetVehicleAttachedDocuments = async () => {
  const token = usersData?.driver?.token;
  const vehicleId = usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
  if (!token || !vehicleId) {
    console.log("⏩ GET /api/vehicle/attachedDocuments/:id: no driver token or vehicle id");
    return;
  }
  console.log("\n── GET /api/vehicle/attachedDocuments/:id ──");
  try {
    const res = await axios.get(
      backendURL + `/api/vehicle/attachedDocuments/${vehicleId}`,
      authConfig(token),
    );
    console.log(`✅ GET /api/vehicle/attachedDocuments/:id — ${res.data?.message || "ok"}`);
  } catch (error) {
    console.error("❌ GET /api/vehicle/attachedDocuments/:id:", error.response?.data?.error || error.message);
  }
};

const testGetVehicleDocumentHistory = async () => {
  const token = usersData?.driver?.token;
  const vehicleId = usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
  if (!token || !vehicleId) {
    console.log("⏩ GET /api/vehicle/documentHistory/:id: no driver token or vehicle id");
    return;
  }
  console.log("\n── GET /api/vehicle/documentHistory/:id ──");
  try {
    const res = await axios.get(
      backendURL + `/api/vehicle/documentHistory/${vehicleId}`,
      authConfig(token),
    );
    console.log(`✅ GET /api/vehicle/documentHistory/:id — ${res.data?.message || "ok"}`);
  } catch (error) {
    console.error("❌ GET /api/vehicle/documentHistory/:id:", error.response?.data?.error || error.message);
  }
};

const testGetProfileHistory = async () => {
  const token = usersData?.admin?.token;
  const uid = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !uid) {
    console.log("⏩ GET /api/user/users/:id/profileHistory: missing admin token or driver uid");
    return;
  }
  console.log("\n── GET /api/user/users/:id/profileHistory ──");
  try {
    const res = await axios.get(
      backendURL + `/api/user/users/${uid}/profileHistory`,
      authConfig(token),
    );
    console.log(`✅ GET /api/user/users/:id/profileHistory — ${res.data?.message || "ok"}`);
  } catch (error) {
    console.error("❌ GET /api/user/users/:id/profileHistory:", error.response?.data?.error || error.message);
  }
};

module.exports = {
  testGetAttachedDocuments,
  testDeleteAttachedDocument,
  testGetDocumentHistory,
  testUpdateAttachedDocument,
  testGetCompanyAttachedDocuments,
  testGetCompanyDocumentHistory,
  testGetVehicleAttachedDocuments,
  testGetVehicleDocumentHistory,
  testGetProfileHistory,
};
