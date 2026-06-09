// CRUD for DocumentTypes
// Manages types of documents required for different roles (license, insurance, etc.)

const axios = require("axios");
const { backendURL, usersData } = require("../constants");

const BASE_URL = "/api/document-types";
const cache = { data: null };

// ── GET all document types ────────────────────────────────────────────────────
const testGetDocumentTypes = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const result = await axios.get(backendURL + BASE_URL, {
      headers: { Authorization: "Bearer " + token },
    });
    
    console.log("✅ Document types fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetDocumentTypes:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE document type ──────────────────────────────────────────────────────
const testCreateDocumentType = async ({ user, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    
    const defaultPayload = {
      documentTypeName: "E2E_TEST_DOCUMENT",
      documentTypeDescription: "E2E test document type",
      isRequired: false,
      ...payload,
    };
    
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, {
      headers: { Authorization: "Bearer " + token },
    });
    
    console.log("✅ Document type created:", result.data.documentTypeUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateDocumentType:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE document type ──────────────────────────────────────────────────────
const testUpdateDocumentType = async ({ user, documentTypeUniqueId, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    
    const id = documentTypeUniqueId || cache.data?.[0]?.documentTypeUniqueId;
    if (!id) throw new Error("No document type ID found to update");
    
    const defaultPayload = {
      documentTypeDescription: "Updated E2E test document type",
      ...payload,
    };
    
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, {
      headers: { Authorization: "Bearer " + token },
    });
    
    console.log("✅ Document type updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateDocumentType:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE document type ──────────────────────────────────────────────────────
const testDeleteDocumentType = async ({ user, documentTypeUniqueId }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    
    const id = documentTypeUniqueId || cache.data?.[0]?.documentTypeUniqueId;
    if (!id) throw new Error("No document type ID found to delete");
    
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, {
      headers: { Authorization: "Bearer " + token },
    });
    
    console.log("✅ Document type deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteDocumentType:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ─────────────────────────────────────────────────────────────
const testDocumentTypesWorkflow = async ({
  user = usersData.admin,
} = {}) => {
  console.log("\n── Document Types Workflow ──");

  // GET (initial state)
  await testGetDocumentTypes({ user });

  // CREATE
  const created = await testCreateDocumentType({ 
    user, 
    payload: { documentTypeName: "E2E_TEST_DOC_" + Date.now() } 
  });
  const documentTypeUniqueId = created?.documentTypeUniqueId;
  
  if (!documentTypeUniqueId) {
    console.warn("⚠️  No ID returned - cannot continue workflow");
    return { skipped: true };
  }

  // GET (after create)
  await testGetDocumentTypes({ user });

  // UPDATE
  await testUpdateDocumentType({ 
    user, 
    documentTypeUniqueId,
    payload: { documentTypeDescription: "Updated by E2E test" }
  });

  // GET (after update)
  await testGetDocumentTypes({ user });

  // DELETE
  await testDeleteDocumentType({ user, documentTypeUniqueId });

  // GET (after delete)
  await testGetDocumentTypes({ user });

  console.log("── Document Types Workflow complete ──\n");
  return { documentTypeUniqueId };
};

module.exports = {
  testDocumentTypesWorkflow,
  testGetDocumentTypes,
  testCreateDocumentType,
  testUpdateDocumentType,
  testDeleteDocumentType,
};
