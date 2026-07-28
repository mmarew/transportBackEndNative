"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { usersRoles, companyRoles } = require("../Utils/ListOfSeedData");
const { db, paginate } = require("./CompanyHelper.service");
const { getData } = require("../CRUD/Read/ReadData");
const { addMember } = require("./CompanyMembership.service");
const {
  recordStatusChange,
  recordProfileChanges,
} = require("../Utils/CompanyProfileHistory");

/**
 * Creates a new transport company and auto-assigns the creator as owner.
 *
 * @param {Object} data - Company data
 * @param {string} data.companyName - Legal name of the company
 * @param {string} [data.companyRegistrationNumber] - Business registration ID
 * @param {string} [data.companyPhone] - Contact phone
 * @param {string} [data.companyEmail] - Contact email
 * @param {string} [data.companyAddress] - Physical address
 * @param {string} data.createdByUserUniqueId - Unique ID of the creator
 * @param {Object} [data.user] - Authenticated user object for role check
 * @returns {Promise<Object>} Success message and new companyUniqueId
 * @throws {AppError} 409 if company name/phone/email already exists
 */
exports.createCompany = async (data) => {
  const {
    companyName,
    companyRegistrationNumber,
    companyPhone,
    companyEmail,
    companyAddress,
    createdByUserUniqueId,
  } = data;

  // Duplicate check for critical fields
  const dupCheckFields = {
    companyName: "name",
    companyRegistrationNumber: "registration number",
    companyPhone: "phone number",
    companyEmail: "email address",
  };

  const checks = [];
  const checkParams = [];

  for (const field in dupCheckFields) {
    if (data[field]) {
      checks.push(`${field} = ?`);
      checkParams.push(data[field]);
    }
  }

  if (checks.length > 0) {
    const [existing] = await db().query(
      `SELECT companyName, companyRegistrationNumber, companyPhone, companyEmail 
       FROM TransportCompany 
       WHERE (${checks.join(" OR ")}) AND isDeleted = 0`,
      checkParams,
    );

    if (existing.length > 0) {
      for (const field in dupCheckFields) {
        if (data[field] && existing.some((e) => e[field] === data[field])) {
          throw new AppError(
            `A company with this ${dupCheckFields[field]} already exists`,
            409,
          );
        }
      }
    }
  }

  const companyUniqueId = uuidv4();
  const values = [
    companyUniqueId,
    companyName,
    companyRegistrationNumber || null,
    companyPhone || null,
    companyEmail || null,
    companyAddress || null,
    createdByUserUniqueId,
    currentDate(),
  ];
  await db().query(
    `INSERT INTO TransportCompany
      (companyUniqueId, companyName, companyRegistrationNumber, companyPhone,
       companyEmail, companyAddress, approvalStatus,
       companyCreatedBy, companyCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    values,
  );

  // Auto-link creator as owner if they are not system admins (3 or 6)
  const user = data.user;
  if (
    user &&
    user.roleId !== usersRoles.adminRoleId &&
    user.roleId !== usersRoles.supperAdminRoleId
  ) {
    const ownerRoleUniqueId = companyRoles.ownerUniqueId;

    await addMember({
      companyUniqueId,
      userUniqueId: user.userUniqueId,
      companyRoleUniqueId: ownerRoleUniqueId,
      membershipStartDate: currentDate(),
      createdByUserUniqueId: createdByUserUniqueId,
      skipApprovalCheck: true,
    });
  }

  return { message: "Company created successfully", data: { companyUniqueId } };
};

/**
 * Retrieves a list of transport companies with data segregation for non-admins.
 * For admins/superAdmins, each company includes a `documentCompliance` summary
 * so the admin dashboard can show doc status without extra API calls.
 *
 * @param {Object} [filters={}] - Query filters (companyName, approvalStatus, etc.)
 * @param {Object} [user={}] - Authenticated user object for access control
 * @returns {Promise<Object>} Paginated list of companies
 */
exports.getCompanies = async (filters = {}, user = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["TransportCompany.isDeleted = 0"];
  const params = [];

  const isAdmin =
    user.roleId === usersRoles.adminRoleId ||
    user.roleId === usersRoles.supperAdminRoleId;

  // Company owners/admins also get the full compliance picture for their own companies.
  // They can only ever see their own companies (membership filter below), so this is safe.
  const isCompanyAdmin = user.roleId === usersRoles.companyAdminRoleId;
  const showCompliance = isAdmin || isCompanyAdmin;

  // Data Segregation:
  // - Admins/SuperAdmins: see all companies
  // - Drivers: see all APPROVED companies (needed to pick a company when registering a vehicle)
  // - Other non-admins (shippers, companyAdmin, etc.): only see companies they belong to
  if (!isAdmin) {
    if (user.roleId === usersRoles.driverRoleId) {
      clauses.push("TransportCompany.approvalStatus = 'approved'");
    } else {
      clauses.push(
        `TransportCompany.companyUniqueId IN (
          SELECT companyUniqueId FROM CompanyMembership
          WHERE userUniqueId = ? AND membershipDeletedAt IS NULL
        )`,
      );
      params.push(user.userUniqueId);
    }
  }

  if (filters.companyUniqueId) {
    clauses.push("TransportCompany.companyUniqueId = ?");
    params.push(filters.companyUniqueId);
  }
  if (filters.companyName) {
    clauses.push("TransportCompany.companyName LIKE ?");
    params.push(`%${filters.companyName}%`);
  }
  if (filters.approvalStatus) {
    clauses.push("TransportCompany.approvalStatus = ?");
    params.push(filters.approvalStatus);
  }
  if (filters.isDeleted !== undefined) {
    clauses[0] = `TransportCompany.isDeleted = ${filters.isDeleted ? 1 : 0}`;
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  const executor = db();

  // ── 1. Paginated list of companies with creator profile ────────────────────
  const [companies] = await executor.query(
    `SELECT TransportCompany.*,
            owner.userUniqueId AS ownerUserUniqueId,
            owner.fullName   AS ownerFullName,
            owner.email      AS ownerEmail,
            owner.phoneNumber AS ownerPhoneNumber
     FROM TransportCompany
     LEFT JOIN Users owner ON TransportCompany.companyCreatedBy = owner.userUniqueId
     ${where}
     ORDER BY TransportCompany.companyCreatedAt DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await executor.query(
    `SELECT COUNT(*) AS total FROM TransportCompany ${where}`,
    params,
  );

  // ── 2. Batch document compliance — for admins AND company owners/admins
  // Returns EVERY required doc per company so they know exactly which to upload/chase.
  let complianceMap = {};
  if (showCompliance && companies.length > 0) {
    const companyIds = companies.map((c) => c.companyUniqueId);
    const placeholders = companyIds.map(() => "?").join(", ");

    // One query: every company × every required doc (mandatory + optional),
    // LEFT JOINed to actual uploads. Companies with zero uploads still appear.
    const [docRows] = await executor.query(
      `SELECT
         c.companyUniqueId,
         rdr.documentTypeId,
         rdr.isDocumentMandatory,
         rdr.isExpirationDateRequired,
         rdr.isFileNumberRequired,
         dt.documentTypeName,
         dt.documentTypeDescription,
         ad.attachedDocumentUniqueId,
         ad.attachedDocumentName,
         ad.attachedDocumentAcceptance,
         ad.attachedDocumentAcceptanceReason,
         ad.documentExpirationDate,
         ad.attachedDocumentFileNumber,
         ad.attachedDocumentCreatedAt,
         CASE
           WHEN ad.attachedDocumentId IS NULL          THEN 'NOT_ATTACHED'
           ELSE ad.attachedDocumentAcceptance
         END AS docStatus
       FROM TransportCompany c
       JOIN RoleDocumentRequirements rdr
         ON rdr.roleId = 8
         AND rdr.roleDocumentRequirementDeletedAt IS NULL
       JOIN DocumentTypes dt ON dt.documentTypeId = rdr.documentTypeId
       LEFT JOIN AttachedDocuments ad
         ON ad.documentTypeId = rdr.documentTypeId
         AND ad.ownerType = 'company'
         AND ad.ownerUniqueId = c.companyUniqueId
         AND ad.attachedDocumentAcceptance != 'DELETED'
       WHERE c.companyUniqueId IN (${placeholders})
       ORDER BY c.companyUniqueId, rdr.isDocumentMandatory DESC, dt.documentTypeId`,
      companyIds,
    );

    // Group rows per company in JS — zero extra queries
    for (const row of docRows) {
      if (!complianceMap[row.companyUniqueId]) {
        complianceMap[row.companyUniqueId] = {
          accepted: [],
          pending: [],
          rejected: [],
          notAttached: [],
          isCompliant: false,
        };
      }
      const entry = complianceMap[row.companyUniqueId];
      const doc = {
        documentTypeId: row.documentTypeId,
        documentTypeName: row.documentTypeName,
        documentTypeDescription: row.documentTypeDescription,
        isDocumentMandatory: Boolean(row.isDocumentMandatory),
        isExpirationDateRequired: Boolean(row.isExpirationDateRequired),
        isFileNumberRequired: Boolean(row.isFileNumberRequired),
        attachedDocumentUniqueId: row.attachedDocumentUniqueId ?? null,
        attachedDocumentName: row.attachedDocumentName ?? null,
        attachedDocumentAcceptance: row.attachedDocumentAcceptance ?? null,
        acceptanceReason: row.attachedDocumentAcceptanceReason ?? null,
        documentExpirationDate: row.documentExpirationDate ?? null,
        fileNumber: row.attachedDocumentFileNumber ?? null,
        uploadedAt: row.attachedDocumentCreatedAt ?? null,
      };

      if (row.docStatus === "ACCEPTED") {
        entry.accepted.push(doc);
      } else if (row.docStatus === "PENDING") {
        entry.pending.push(doc);
      } else if (row.docStatus === "REJECTED") {
        entry.rejected.push(doc);
      } else {
        entry.notAttached.push(doc);
      }
    }

    // isCompliant = all mandatory docs are in ACCEPTED list
    for (const id of companyIds) {
      if (!complianceMap[id]) {
        continue;
      }
      const e = complianceMap[id];
      const mandatoryNotDone = [
        ...e.pending,
        ...e.rejected,
        ...e.notAttached,
      ].filter((d) => d.isDocumentMandatory);
      e.isCompliant = mandatoryNotDone.length === 0 && e.accepted.length > 0;
      // handy counts
      e.counts = {
        accepted: e.accepted.length,
        pending: e.pending.length,
        rejected: e.rejected.length,
        notAttached: e.notAttached.length,
      };
    }
  }

  // ── 3. Merge compliance + owner profile into each company row ─────────────
  const data = companies.map((c) => {
    const { ownerUserUniqueId, ownerFullName, ownerEmail, ownerPhoneNumber, ...rest } = c;
    const ownerProfile = ownerFullName
      ? { userUniqueId: ownerUserUniqueId, fullName: ownerFullName, email: ownerEmail, phoneNumber: ownerPhoneNumber }
      : null;
    return {
      ...rest,
      documentCompliance: complianceMap[c.companyUniqueId] ?? null,
      ownerProfile,
    };
  });

  return {
    message: "Companies fetched successfully",
    data,
    pagination: {
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Updates an existing transport company's profile.
 * NOTE: Company Logo is now managed via the Documents system (Profile Photo ID 4).
 *
 * @param {string} companyUniqueId - ID of the company to update
 * @param {Object} data - Fields to update
 * @param {string} updatedBy - ID of the user performing the update
 * @returns {Promise<Object>} Success message
 * @throws {AppError} 404 if not found, 409 on duplicate fields
 */
exports.updateCompany = async (companyUniqueId, data, updatedBy) => {
  const allowed = [
    "companyName",
    "companyRegistrationNumber",
    "companyPhone",
    "companyEmail",
    "companyAddress",
  ];
  // Duplicate check for critical fields
  const dupCheckFields = {
    companyName: "name",
    companyRegistrationNumber: "registration number",
    companyPhone: "phone number",
    companyEmail: "email address",
  };

  const checks = [];
  const checkParams = [];

  for (const field in dupCheckFields) {
    if (data[field]) {
      checks.push(`${field} = ?`);
      checkParams.push(data[field]);
    }
  }

  if (checks.length > 0) {
    const [existing] = await db().query(
      `SELECT companyName, companyRegistrationNumber, companyPhone, companyEmail 
       FROM TransportCompany 
       WHERE (${checks.join(" OR ")}) AND companyUniqueId != ? AND isDeleted = 0`,
      [...checkParams, companyUniqueId],
    );

    if (existing.length > 0) {
      for (const field in dupCheckFields) {
        if (data[field] && existing.some((e) => e[field] === data[field])) {
          throw new AppError(
            `A company with this ${dupCheckFields[field]} already exists`,
            409,
          );
        }
      }
    }
  }

  const setParts = [];
  const vals = [];

  for (const k of allowed) {
    if (data[k] !== undefined) {
      setParts.push(`${k} = ?`);
      vals.push(data[k]);
    }
  }
  if (setParts.length === 0) {
    throw new AppError("No fields to update", 400);
  }

  // Fetch current values BEFORE the update so we can diff them for history
  const [[currentRow]] = await db().query(
    `SELECT companyName, companyRegistrationNumber, companyPhone, companyEmail, companyAddress
     FROM TransportCompany WHERE companyUniqueId = ? AND isDeleted = 0 LIMIT 1`,
    [companyUniqueId],
  );
  if (!currentRow) {
    throw new AppError("Company not found", 404);
  }

  setParts.push("companyUpdatedBy = ?", "companyUpdatedAt = ?");
  vals.push(updatedBy, currentDate(), companyUniqueId);

  const [res] = await db().query(
    `UPDATE TransportCompany SET ${setParts.join(", ")} WHERE companyUniqueId = ? AND isDeleted = 0`,
    vals,
  );
  if (res.affectedRows === 0) {
    throw new AppError("Company not found", 404);
  }

  // Write one history row per field that actually changed
  await recordProfileChanges({
    companyUniqueId,
    oldData: currentRow,
    newData: data,
    changedBy: updatedBy,
  });

  return { message: "Company updated successfully", data: null };
};

exports.approveCompany = async (
  companyUniqueId,
  approvalStatus,
  approvalReason,
  approvedBy,
) => {
  // ── Guard 1: Company must exist ───────────────────────────────────────────
  const [companyRow] = await getData({
    tableName: "TransportCompany",
    conditions: { companyUniqueId, isDeleted: 0 },
  });
  if (!companyRow) throw new AppError("Company not found", 404);
  const company = companyRow;

  // ── Guard 2: Valid status transitions ─────────────────────────────────────
  // pending   → approved | rejected
  // approved  → suspended | rejected
  // suspended → approved | rejected
  // rejected  → pending (re-submission flow only)
  const current = company.approvalStatus;

  // if (!validTransitions[current]?.includes(approvalStatus)) {
  //   throw new AppError(
  //     `Cannot change approval status from '${current}' to '${approvalStatus}'`,
  //     422,
  //   );
  // }

  // ── Guard 3: Rejection must include a reason ──────────────────────────────
  if (approvalStatus === "rejected" && !approvalReason?.trim()) {
    throw new AppError("A reason is required when rejecting a company", 422);
  }

  // ── Guard 4: Document compliance — only when approving ───────────────────
  // All mandatory company documents (roleId=8) must be ACCEPTED before approval.
  if (approvalStatus === "approved") {
    // Also look for documents under the company owner's userUniqueId as a fallback.
    // Documents uploaded before the auto-company-detection fix may be stored
    // with ownerType='user' instead of ownerType='company'.
    const [[ownerRow]] = await db().query(
      `SELECT userUniqueId FROM CompanyMembership
       WHERE companyUniqueId = ? AND isActive = 1 AND membershipDeletedAt IS NULL
       ORDER BY membershipStartDate ASC LIMIT 1`,
      [companyUniqueId],
    );
    const ownerUserUniqueId = ownerRow?.userUniqueId ?? null;

    const [docRows] = await db().query(
      `SELECT
         rdr.documentTypeId,
         rdr.isDocumentMandatory,
         dt.documentTypeName,
         ad.attachedDocumentAcceptance
       FROM RoleDocumentRequirements rdr
       JOIN DocumentTypes dt ON dt.documentTypeId = rdr.documentTypeId
       LEFT JOIN AttachedDocuments ad
         ON ad.documentTypeId = rdr.documentTypeId
         AND (
               (ad.ownerType = 'company' AND ad.ownerUniqueId = ?)
            OR (ad.ownerType = 'user'    AND ad.ownerUniqueId = ?)
         )
         AND ad.attachedDocumentAcceptance != 'DELETED'
       WHERE rdr.roleId = 8
         AND rdr.roleDocumentRequirementDeletedAt IS NULL`,
      [companyUniqueId, ownerUserUniqueId ?? ""],
    );

    const missingMandatory = docRows.filter(
      (d) =>
        Number(d.isDocumentMandatory) === 1 &&
        d.attachedDocumentAcceptance !== "ACCEPTED",
    );

    if (missingMandatory.length > 0) {
      const names = missingMandatory
        .map(
          (d) =>
            `"${d.documentTypeName}" (${d.attachedDocumentAcceptance ?? "NOT_ATTACHED"})`,
        )
        .join(", ");
      throw new AppError(
        `Cannot approve: the following mandatory documents are not yet accepted — ${names}`,
        422,
      );
    }

    // ── Guard 5: Company must have at least one active member ───────────────
    const [[{ memberCount }]] = await db().query(
      `SELECT COUNT(*) AS memberCount
       FROM CompanyMembership
       WHERE companyUniqueId = ? AND membershipDeletedAt IS NULL`,
      [companyUniqueId],
    );
    if (Number(memberCount) === 0) {
      throw new AppError(
        "Cannot approve a company with no members. At least one member (owner/admin) must be registered.",
        422,
      );
    }
  }

  // ── All guards passed — execute status change ─────────────────────────────
  const [res] = await db().query(
    `UPDATE TransportCompany
     SET approvalStatus = ?, approvalReason = ?, approvedBy = ?, approvedAt = ?,
         companyUpdatedBy = ?, companyUpdatedAt = ?
     WHERE companyUniqueId = ? AND isDeleted = 0`,
    [
      approvalStatus,
      approvalReason || null,
      approvedBy,
      currentDate(),
      approvedBy,
      currentDate(),
      companyUniqueId,
    ],
  );
  if (res.affectedRows === 0) {
    throw new AppError("Company not found", 404);
  }

  // Record status transition in the append-only audit log
  await recordStatusChange({
    companyUniqueId,
    fromStatus: current,
    toStatus: approvalStatus,
    changedBy: approvedBy,
    source: "document_approval",
    reason: approvalReason || null,
  });

  return { message: `Company ${approvalStatus}`, data: null };
};

exports.deleteCompany = async (companyUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE TransportCompany
     SET isDeleted = 1, companyDeletedAt = ?, companyDeletedBy = ?
     WHERE companyUniqueId = ? AND isDeleted = 0`,
    [currentDate(), deletedBy, companyUniqueId],
  );
  if (res.affectedRows === 0) {
    throw new AppError("Company not found or already deleted", 404);
  }
  return { message: "Company deleted successfully", data: null };
};
