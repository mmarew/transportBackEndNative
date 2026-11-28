const { insertData } = require("../CRUD/Create/CreateData");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { transactionStorage } = require("../Utils/TransactionContext");
const { PAGINATION } = require("../Utils/Constants");
const {
  usersRoles,
  VEHICLE_STATUS_TYPES,
} = require("../Utils/ListOfSeedData");
const { insertHistoryRecord } = require("./History/History.service");

// Statuses that represent an explicit admin/system hold. Document events must
// never silently clear an admin hold; an admin has to move it out explicitly.
// REJECTED is deliberately NOT in this set: it is the derived result of a
// rejected mandatory document, so re-approving that document clears it.
// INACTIVE is included, except when the row is the derived "no valid mandatory
// document" state handled below.
const MANUAL_HOLD_STATUS_TYPES = new Set([
  VEHICLE_STATUS_TYPES.SUSPENDED,
  VEHICLE_STATUS_TYPES.INACTIVE,
  VEHICLE_STATUS_TYPES.DELETED,
  VEHICLE_STATUS_TYPES.RESERVED_BY_OTHER_DRIVER,
]);

// Derived INACTIVE rows are transitionable when documents are attached. An
// admin-set INACTIVE hold uses any other description and stays sticky.
const DERIVED_INACTIVE_DESCRIPTION_PREFIXES = [
  "Mandatory vehicle documents missing:",
  "Mandatory vehicle documents expired:",
];

const isDerivedInactiveDescription = (statusDescription) =>
  DERIVED_INACTIVE_DESCRIPTION_PREFIXES.some((prefix) =>
    String(statusDescription || "").startsWith(prefix),
  );

const isManualHoldStatus = (statusTypeId, statusDescription = null) => {
  const typeId = Number(statusTypeId);
  if (!MANUAL_HOLD_STATUS_TYPES.has(typeId)) return false;
  if (
    typeId === VEHICLE_STATUS_TYPES.INACTIVE &&
    isDerivedInactiveDescription(statusDescription)
  ) {
    return false;
  }
  return true;
};

const createVehicleStatus = async (data) => {
  const {
    vehicleUniqueId,
    VehicleStatusTypeId,
    statusEndDate = null,
    statusDescription = null,
    vehicleStatusCreatedBy,
    connection = null, // Optional connection for transaction
  } = data;
  if (!vehicleUniqueId || !VehicleStatusTypeId) {
    throw new AppError(
      "VehicleUniqueId and VehicleStatusTypeId are required",
      AppError.BAD_REQUEST,
    );
  }

  // Check if the status already exists
  const existingStatus = await getData({
    tableName: "VehicleStatus",
    conditions: { vehicleUniqueId },
    connection,
  });

  if (existingStatus.length) {
    // throw new AppError("VehicleStatus already exists", AppError.BAD_REQUEST);
  }

  const vehicleStatusUniqueId = uuidv4();
  const colAndVal = {
    vehicleStatusUniqueId,
    vehicleUniqueId,
    VehicleStatusTypeId,
    statusStartDate: currentDate(),
    statusEndDate,
    statusDescription,
    vehicleStatusCreatedBy,
    vehicleStatusCreatedAt: currentDate(),
  };
  await insertData({
    tableName: "VehicleStatus",
    colAndVal,
    connection,
  });

  return { message: "Vehicle status created successfully", data: { vehicleStatusUniqueId } };
};

/**
 * Decide which status a vehicle SHOULD have based only on its own mandatory
 * documents (roleId 9 — insurance + librea). Company documents never block a
 * vehicle. Missing or expired documents mean INACTIVE; attached documents
 * awaiting admin approval mean PENDING_DOCS. Explicit admin holds
 * (suspended/inactive/deleted/reserved) are sticky: only an explicit admin
 * clearance (clearHold) can move them again.
 */
const evaluateVehicleStatus = async (vehicleUniqueId, executor) => {
  const [requirementRows] = await executor.query(
    `SELECT rdr.documentTypeId, dt.documentTypeName
     FROM RoleDocumentRequirements rdr
     LEFT JOIN DocumentTypes dt ON dt.documentTypeId = rdr.documentTypeId
     WHERE rdr.roleId = ?
       AND rdr.isDocumentMandatory = 1
       AND rdr.roleDocumentRequirementDeletedAt IS NULL
     ORDER BY rdr.documentTypeId ASC`,
    [usersRoles.vehicleRoleId],
  );

  const requirements = requirementRows.map((row) => ({
    documentTypeId: Number(row.documentTypeId),
    documentTypeName:
      row.documentTypeName || `document type ${row.documentTypeId}`,
  }));

  if (requirements.length === 0) {
    return {
      statusType: VEHICLE_STATUS_TYPES.ACTIVE,
      statusDescription: "No mandatory vehicle documents are configured",
    };
  }

  const [documentRows] = await executor.query(
    `SELECT documentTypeId, attachedDocumentAcceptance, documentExpirationDate
     FROM AttachedDocuments
     WHERE ownerType = 'vehicle' AND ownerUniqueId = ?`,
    [vehicleUniqueId],
  );

  const docsByType = new Map(
    documentRows.map((row) => [Number(row.documentTypeId), row]),
  );

  const missing = [];
  const pending = [];
  const expired = [];
  const rejected = [];

  for (const requirement of requirements) {
    const doc = docsByType.get(requirement.documentTypeId);
    if (!doc) {
      missing.push(requirement.documentTypeName);
      continue;
    }
    if (doc.attachedDocumentAcceptance === "REJECTED") {
      rejected.push(requirement.documentTypeName);
    } else if (doc.attachedDocumentAcceptance !== "ACCEPTED") {
      pending.push(requirement.documentTypeName);
    } else if (
      doc.documentExpirationDate &&
      new Date(doc.documentExpirationDate) < new Date()
    ) {
      expired.push(requirement.documentTypeName);
    }
  }

  if (rejected.length > 0) {
    return {
      statusType: VEHICLE_STATUS_TYPES.REJECTED,
      statusDescription: `Mandatory vehicle document rejected: ${rejected.join(", ")}`,
    };
  }

  const inactiveIssues = [
    ...missing.map((name) => `missing: ${name}`),
    ...expired.map((name) => `expired: ${name}`),
  ];
  if (inactiveIssues.length > 0) {
    return {
      statusType: VEHICLE_STATUS_TYPES.INACTIVE,
      statusDescription: `Mandatory vehicle documents ${inactiveIssues.join("; ")}`,
    };
  }

  if (pending.length > 0) {
    return {
      statusType: VEHICLE_STATUS_TYPES.PENDING_DOCS,
      statusDescription: `Mandatory vehicle documents pending approval: ${pending.join(", ")}`,
    };
  }

  return {
    statusType: VEHICLE_STATUS_TYPES.ACTIVE,
    statusDescription:
      "All mandatory vehicle documents accepted and unexpired; no maintenance/admin hold",
  };
};

/**
 * Central vehicle-status evaluator. Writes a new VehicleStatus row only when
 * the evaluated status actually changes, closing the previous row so history
 * is preserved. Same-status reason changes are updated in place.
 */
const recalculateVehicleStatus = async (vehicleUniqueId, options = {}) => {
  if (!vehicleUniqueId) {
    return { changed: false, statusType: null, statusDescription: null };
  }

  const {
    actorUserUniqueId = null,
    clearHold = false,
    // Backwards-compatible alias used by earlier suspension-clearance code.
    ignoreSuspension = false,
    connection = null,
  } = options;
  const allowHoldOverride = clearHold || ignoreSuspension;
  const executor = transactionStorage.getStore() || connection || pool;

  const [currentRows] = await executor.query(
    `SELECT * FROM VehicleStatus
     WHERE vehicleUniqueId = ? AND vehicleStatusDeletedAt IS NULL
     ORDER BY vehicleStatusCreatedAt DESC, vehicleStatusId DESC
     LIMIT 1`,
    [vehicleUniqueId],
  );
  const current = currentRows[0] || null;

  if (
    current &&
    isManualHoldStatus(
      current.VehicleStatusTypeId,
      current.statusDescription,
    ) &&
    !allowHoldOverride
  ) {
    return {
      changed: false,
      statusType: Number(current.VehicleStatusTypeId),
      statusDescription:
        current.statusDescription || "Vehicle is held by an admin",
      vehicleStatusUniqueId: current.vehicleStatusUniqueId,
    };
  }

  const evaluation = await evaluateVehicleStatus(vehicleUniqueId, executor);
  const actor = actorUserUniqueId || current?.vehicleStatusCreatedBy || "admin";

  if (current?.VehicleStatusTypeId === evaluation.statusType) {
    if (current.statusDescription !== evaluation.statusDescription) {
      await insertHistoryRecord({
        sourceTable: "VehicleStatus",
        conditions: { vehicleStatusUniqueId: current.vehicleStatusUniqueId },
        changeType: "UPDATE",
        changedByUserId: actorUserUniqueId,
      });
      await updateData({
        tableName: "VehicleStatus",
        conditions: { vehicleStatusUniqueId: current.vehicleStatusUniqueId },
        updateValues: {
          statusDescription: evaluation.statusDescription,
          vehicleStatusUpdatedBy: actor,
          vehicleStatusUpdatedAt: currentDate(),
        },
        connection,
      });
    }
    return {
      changed: false,
      statusType: evaluation.statusType,
      statusDescription: evaluation.statusDescription,
      vehicleStatusUniqueId: current.vehicleStatusUniqueId,
    };
  }

  if (current) {
    await insertHistoryRecord({
      sourceTable: "VehicleStatus",
      conditions: { vehicleStatusUniqueId: current.vehicleStatusUniqueId },
      changeType: "UPDATE",
      changedByUserId: actorUserUniqueId,
    });
    await updateData({
      tableName: "VehicleStatus",
      conditions: { vehicleStatusUniqueId: current.vehicleStatusUniqueId },
      updateValues: {
        statusEndDate: currentDate(),
        vehicleStatusUpdatedBy: actor,
        vehicleStatusUpdatedAt: currentDate(),
      },
      connection,
    });
  }

  const created = await createVehicleStatus({
    vehicleUniqueId,
    VehicleStatusTypeId: evaluation.statusType,
    statusDescription: evaluation.statusDescription,
    vehicleStatusCreatedBy: actor,
    connection,
  });

  return {
    changed: true,
    statusType: evaluation.statusType,
    statusDescription: evaluation.statusDescription,
    vehicleStatusUniqueId: created.data.vehicleStatusUniqueId,
  };
};

const getVehicleStatuses = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    vehicleStatusUniqueId,
    vehicleUniqueId,
    VehicleStatusTypeId,
    search,
  } = filters;

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || PAGINATION.DEFAULT_PAGE_SIZE;
  const offset = (pageNum - 1) * limitNum;

  // A status read for one vehicle is also the natural place to catch an
  // accepted document that expired while nobody was uploading/approving.
  if (vehicleUniqueId && !filters.skipRecalculate) {
    try {
      await recalculateVehicleStatus(vehicleUniqueId);
    } catch (recalcError) {
      // A read must never fail just because evaluation failed; the stored
      // history remains available and the next event can retry.
      logger.warn("Vehicle status recalculation on read failed", {
        vehicleUniqueId,
        error: recalcError?.message,
      });
    }
  }

  const where = ["vs.vehicleStatusDeletedAt IS NULL"];
  const params = [];

  if (vehicleStatusUniqueId) {
    where.push("vs.vehicleStatusUniqueId = ?");
    params.push(vehicleStatusUniqueId);
  }
  if (vehicleUniqueId) {
    where.push("vs.vehicleUniqueId = ?");
    params.push(vehicleUniqueId);
  }
  if (VehicleStatusTypeId) {
    where.push("vs.VehicleStatusTypeId = ?");
    params.push(VehicleStatusTypeId);
  }
  if (search) {
    where.push(
      "(vst.VehicleStatusTypeName LIKE ? OR vst.VehicleStatusTypeDescription LIKE ? OR vs.statusDescription LIKE ?)",
    );
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT 
      vs.*,
      vst.VehicleStatusTypeName,
      vst.VehicleStatusTypeDescription
    FROM VehicleStatus vs
    LEFT JOIN VehicleStatusTypes vst ON vs.VehicleStatusTypeId = vst.VehicleStatusTypeId
    ${whereClause}
    ORDER BY vs.vehicleStatusCreatedAt DESC, vs.vehicleStatusId DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) as total 
    FROM VehicleStatus vs
    LEFT JOIN VehicleStatusTypes vst ON vs.VehicleStatusTypeId = vst.VehicleStatusTypeId
    ${whereClause}
  `;

  const executor = transactionStorage.getStore() || pool;
  const [[countRow]] = await executor.query(countSql, params);

  params.push(limitNum, offset);
  const [rows] = await executor.query(sql, params);

  return {
    message: "Vehicle statuses fetched successfully",
    data: rows,
    pagination: {
      currentPage: pageNum,
      limit: limitNum,
      totalItems: countRow?.total || 0,
      totalPages: Math.ceil((countRow?.total || 0) / limitNum) || 1,
    },
  };
};

const updateVehicleStatus = async (
  vehicleStatusUniqueId,
  data = {},
  actor = null,
) => {
  const executor = transactionStorage.getStore() || pool;
  const [existingRows] = await executor.query(
    `SELECT vehicleUniqueId, VehicleStatusTypeId, statusDescription
     FROM VehicleStatus
     WHERE vehicleStatusUniqueId = ? AND vehicleStatusDeletedAt IS NULL
     LIMIT 1`,
    [vehicleStatusUniqueId],
  );
  if (existingRows.length === 0) {
    throw new AppError("VehicleStatus not found", AppError.NOT_FOUND);
  }

  const previous = existingRows[0];
  const actorUserUniqueId =
    (typeof actor === "string" ? actor : actor?.userUniqueId) ||
    data?.user?.userUniqueId ||
    null;

  const allowedFields = [
    "VehicleStatusTypeId",
    "statusStartDate",
    "statusEndDate",
    "statusDescription",
  ];
  const updateValues = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) updateValues[field] = data[field];
  }
  updateValues.vehicleStatusUpdatedBy = actorUserUniqueId;
  updateValues.vehicleStatusUpdatedAt = currentDate();

  await insertHistoryRecord({
    sourceTable: "VehicleStatus",
    conditions: { vehicleStatusUniqueId },
    changeType: "UPDATE",
    changedByUserId: actorUserUniqueId,
  });

  const result = await updateData({
    tableName: "VehicleStatus",
    conditions: { vehicleStatusUniqueId },
    updateValues,
  });

  if (result.affectedRows === 0) {
    throw new AppError("Update failed or VehicleStatus not found", AppError.NOT_FOUND);
  }

  return {
    message: "Vehicle status updated successfully",
    data: {
      vehicleStatusUniqueId,
      vehicleUniqueId: previous.vehicleUniqueId,
      previousVehicleStatusTypeId: previous.VehicleStatusTypeId,
      previousStatusDescription: previous.statusDescription,
      currentVehicleStatusTypeId:
        updateValues.VehicleStatusTypeId ?? previous.VehicleStatusTypeId,
      currentStatusDescription:
        updateValues.statusDescription ?? previous.statusDescription,
    },
  };
};

const deleteVehicleStatus = async (vehicleStatusUniqueId) => {
  await insertHistoryRecord({
    sourceTable: "VehicleStatus",
    conditions: { vehicleStatusUniqueId },
    changeType: "DELETE",
    changedByUserId: undefined,
  });

  const result = await updateData({
    tableName: "VehicleStatus",
    conditions: { vehicleStatusUniqueId },
    updateValues: {
      vehicleStatusDeletedAt: currentDate(),
    },
  });

  if (result.affectedRows === 0) {
    throw new AppError("Delete failed or VehicleStatus not found", AppError.NOT_FOUND);
  }

  return {
    message: "Vehicle status deleted successfully",
    data: null,
  };
};

const getStatusOfVehicleByVehicleUniqueId = async (vehicleUniqueId) => {
  const result = await getVehicleStatuses({ vehicleUniqueId, limit: 1 });
  return {
    message: result.message,
    data: result.data?.[0] || null,
  };
};

module.exports = {
  createVehicleStatus,
  evaluateVehicleStatus,
  recalculateVehicleStatus,
  isManualHoldStatus,
  updateVehicleStatus,
  deleteVehicleStatus,
  getVehicleStatuses,
  getStatusOfVehicleByVehicleUniqueId,
};
