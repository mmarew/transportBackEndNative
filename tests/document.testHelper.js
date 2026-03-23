/**
 * Document Test Helper
 * ====================
 * Shared logic for seeding and approving documents in tests.
 */

"use strict";

const Config = require("../Utils/Config");

const API_KEY = Config.API_KEY || "your-super-secret-key-that-is-hard-to-guess";

/**
 * Seed a set of standard documents for a driver
 * @param {Function} request - The request helper
 * @param {string} userUniqueId - The driver's unique ID
 * @returns {Promise<void>}
 */
async function seedDriverDocuments(request, userUniqueId) {
  const requiredDocs = [
    { documentTypeId: 1, expirationDate: "2028-01-01", label: "Driver's License" },
    { documentTypeId: 2, expirationDate: null, label: "Vehicle Registration" },
    { documentTypeId: 4, expirationDate: null, label: "Profile Photo" },
  ];

  for (const doc of requiredDocs) {
    const res = await request("POST", "/api/admin/dev/seedTestDocument", {
      userUniqueId,
      documentTypeId: doc.documentTypeId,
      roleId: 2,
      documentExpirationDate: doc.expirationDate
    }, { "x-api-key": API_KEY });

    if (res.body?.message !== "success") {
      throw new Error(`Seed doc ${doc.label} failed: ${JSON.stringify(res.body)}`);
    }
  }
}

/**
 * Approve all pending documents for a user
 * @param {Function} request - The request helper
 * @param {string} adminToken - The admin's JWT token
 * @param {string} userUniqueId - The user's unique ID
 * @param {number} roleId - The user's role ID
 * @returns {Promise<void>}
 */
async function approveAllDocuments(request, adminToken, userUniqueId, roleId) {
  const resDocs = await request("GET", `/api/user/attachedDocuments?userUniqueId=${userUniqueId}&limit=20`, null, { Authorization: `Bearer ${adminToken}` });
  const docs = resDocs.body?.data?.documents || resDocs.body?.data || [];
  const uids = docs.map(d => d.attachedDocumentUniqueId).filter(Boolean);

  if (uids.length === 0) {
    throw new Error(`No documents found for user ${userUniqueId}`);
  }

  for (const uid of uids) {
    const res = await request("PUT", "/api/admin/acceptRejectAttachedDocuments", { 
      attachedDocumentUniqueId: uid, 
      action: "ACCEPTED", 
      roleId 
    }, { Authorization: `Bearer ${adminToken}` });
        
    if (res.body?.message !== "success") {
      throw new Error(`Failed to approve document ${uid}: ${JSON.stringify(res.body)}`);
    }
  }
}

module.exports = {
  seedDriverDocuments,
  approveAllDocuments
};
