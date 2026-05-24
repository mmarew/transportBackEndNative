"use strict";

const {
  getData
} = require("../CRUD/Read/ReadData");
const {
  getVehicleDrivers
} = require("./VehicleDriver.service");
const {
  pool
} = require("../Middleware/Database.config");
const {
  v4: uuidv4
} = require("uuid");
const {
  updateUserRoleStatus,
  getUserRoleStatusCurrent
} = require("./UserRoleStatus.service");
const {
  findStatusByVehicleAndDocuments
} = require("../Utils/StatusOfUsersByVehiclesAndDocs");
const AppError = require("../Utils/AppError");
const {
  currentDate
} = require("../Utils/CurrentDate");
const {
  usersRoles
} = require("../Utils/ListOfSeedData");
const {
  transactionStorage
} = require("../Utils/TransactionContext");
// Create a new mapping

// Removed getAllMappings in favor of consolidated getter with pagination
const driversDocumentVehicleRequirement = async body => {
  try {
    const ownerUserUniqueId = body.ownerUserUniqueId;
    const user = body?.user;
    const roleId = usersRoles.driverRoleId;
    const phoneNumber = user?.phoneNumber;
    const userRoleStatusDescription = body?.userRoleStatusDescription;
    const {
      userRoleStatusUniqueId,
      userRoleId,
      statusId
    } = user;

    // Fetch required documents for the user's role via consolidated getter
    const requiredDocsResult = await getRoleDocumentRequirements({
      roleId,
      page: 1,
      limit: 1000,
      sortBy: "documentTypeId",
      sortOrder: "ASC"
    });
    const requiredDocuments = requiredDocsResult?.data || [];

    // If no documents are required, return success with empty data instead of error
    // This allows the verification to proceed even if no documents are configured
    if (!requiredDocuments || requiredDocuments.length === 0) {
      // Return structure matching the normal response format
      return {
        message: "success",
        messageType: "driversDocumentVehicleRequirement",
        data: "No documents required for this role",
        vehicle: null,
        userData: null,
        unAttachedDocumentTypes: [],
        attachedDocumentsByStatus: {
          PENDING: [],
          ACCEPTED: [],
          REJECTED: []
        }
      };
    }
    //Get attached documents — driver personal docs (ownerType='user')
    const driverDocSql = `
SELECT DISTINCT ad.*, dt.*, rdr.*
FROM AttachedDocuments ad
JOIN DocumentTypes dt ON ad.documentTypeId = dt.documentTypeId
JOIN RoleDocumentRequirements rdr ON rdr.documentTypeId = dt.documentTypeId
WHERE ad.ownerType = 'user'
  AND ad.ownerUniqueId = ?
  AND rdr.roleId = ?
`;
    const executor = transactionStorage.getStore() || pool;
    const [driverAttachedDocuments] = await executor.query(driverDocSql, [ownerUserUniqueId, roleId]);

    // Also check vehicle requirements (roleId=9) for the driver's assigned vehicle
    const vehicleRequirementsResult = await getRoleDocumentRequirements({
      roleId: usersRoles.vehicleRoleId,
      // 9
      page: 1,
      limit: 1000,
      sortBy: "documentTypeId",
      sortOrder: "ASC"
    });
    const vehicleRequiredDocuments = vehicleRequirementsResult?.data || [];
    let vehicleAttachedDocuments = [];
    if (vehicleRequiredDocuments.length > 0) {
      // Get the driver's active vehicle assignment
      const [vehicleRows] = await executor.query(`SELECT vehicleUniqueId FROM VehicleDriver
         WHERE driverUserUniqueId = ? AND assignmentStatus = 'active'
         LIMIT 1`, [ownerUserUniqueId]);
      const vehicleUniqueId = vehicleRows[0]?.vehicleUniqueId;
      if (vehicleUniqueId) {
        const vehicleDocSql = `
SELECT DISTINCT ad.*, dt.*, rdr.*
FROM AttachedDocuments ad
JOIN DocumentTypes dt ON ad.documentTypeId = dt.documentTypeId
JOIN RoleDocumentRequirements rdr ON rdr.documentTypeId = dt.documentTypeId
WHERE ad.ownerType = 'vehicle'
  AND ad.ownerUniqueId = ?
  AND rdr.roleId = ?
`;
        [vehicleAttachedDocuments] = await executor.query(vehicleDocSql, [vehicleUniqueId, usersRoles.vehicleRoleId]);
      }
    }

    // Merge: all attached documents across driver + vehicle
    const attachedDocuments = [...driverAttachedDocuments, ...vehicleAttachedDocuments];

    // All required documents across both roles
    const allRequiredDocuments = [...requiredDocuments, ...vehicleRequiredDocuments];

    // Find unattached document types (driver docs + vehicle docs combined)
    const unAttachedDocumentTypes = allRequiredDocuments.filter(requiredDocument => !attachedDocuments.some(attachedDocument => attachedDocument.documentTypeId === requiredDocument.documentTypeId));

    // Group attached documents by their status (PENDING, ACCEPTED, REJECTED)
    const attachedDocumentsByStatus = {
      PENDING: [],
      ACCEPTED: [],
      REJECTED: []
    };
    attachedDocuments.forEach(attachedDocument => {
      //
      const acceptanceStatus = attachedDocument.attachedDocumentAcceptance;
      if (attachedDocumentsByStatus[acceptanceStatus]) {
        //
        attachedDocumentsByStatus[acceptanceStatus].push(attachedDocument);
      }
      //
    });

    // Check if the user has a registered vehicle via VehicleDriver service
    const vehicleDriverResult = await getVehicleDrivers({
      driverUserUniqueId: ownerUserUniqueId,
      assignmentStatus: "active",
      limit: 1,
      page: 1
    });
    const userVehicle = vehicleDriverResult?.data || [];
    const vehicleRegistered = userVehicle.length > 0;

    // ========== SUBSCRIPTION CHECK ==========
    let hasActiveSubscription = false;
    try {
      const {
        getUserSubscriptionsWithFilters
      } = require("./UserSubscription.service");
      const activeSubscriptions = await getUserSubscriptionsWithFilters({
        driverUniqueId: ownerUserUniqueId,
        isActive: true
      });
      hasActiveSubscription = activeSubscriptions?.data?.length > 0;
    } catch (e) {
      const logger = require("../Utils/logger");
      logger.error("Error checking active subscription", {
        error: e.message,
        stack: e.stack
      });
      hasActiveSubscription = false;
    }

    // check if user is banned based on its userUniqueId,
    // Prefer checking by phoneNumber (available in this scope)
    let isBanned = false;
    try {
      const {
        getBannedUsers
      } = require("./BannedUsers.service");
      const banCheck = await getBannedUsers({
        check: true,
        phoneNumber,
        roleId
      });
      isBanned = banCheck?.data?.isBanned === true;
    } catch (e) {
      const logger = require("../Utils/logger");
      logger.error("Error checking ban status", {
        error: e.message,
        stack: e.stack
      });
      // If ban check fails, treat as not banned but do not crash the flow
      isBanned = false;
    }

    // Determine the final status
    let finalStatusId;
    if (isBanned) {
      // 6 => banned (as per updated status list)
      finalStatusId = 6;
    } else {
      // Based on documents and vehicle status
      const resultOfStatus = findStatusByVehicleAndDocuments({
        attachedDocuments,
        attachedDocumentsByStatus,
        requiredDocuments: allRequiredDocuments,
        // driver + vehicle requirements
        vehicleRegistered,
        unAttachedDocumentTypes,
        hasActiveSubscription
      });
      if (resultOfStatus?.message === "error") {
        throw new AppError(resultOfStatus?.data || "Error determining status", 400);
      }
      finalStatusId = resultOfStatus?.finalStatusId;
    }

    // return {
    //   message: "success",
    //   finalStatusId,requiredDocsResult
    // };
    if (statusId !== finalStatusId) {
      // Update role status if its current status is different from saved one
      const userRoleStatusData = {
        user,
        roleId,
        userRoleStatusUniqueId,
        userRoleId,
        newStatusId: finalStatusId,
        userRoleStatusDescription,
        phoneNumber
      };
      await updateUserRoleStatus(userRoleStatusData);
    }
    //get latest user role status

    const userData = await getUserRoleStatusCurrent({
      data: {
        roleId,
        search: phoneNumber
      }
    });
    return {
      message: "success",
      messageType: "driversDocumentVehicleRequirement",
      vehicle: userVehicle?.[0] || null,
      userData: userData?.data?.[0] || null,
      attachedDocumentsByStatus,
      unAttachedDocumentTypes // Documents that are required but not attached
    };
  } catch (error) {
    throw new AppError(error.message || "An error occurred during driver document vehicle requirement", error.statusCode || 500);
  }
};

/**
 * entityDocumentRequirement
 * ─────────────────────────
 * General document compliance check for ANY owner type: 'user', 'company', 'vehicle'.
 *
 * Maps ownerType → roleId to pull the correct RoleDocumentRequirements rows:
 *   ownerType='company' → roleId 8
 *   ownerType='vehicle' → roleId 9
 *   ownerType='user'    → caller must pass roleId explicitly (default: driver=2)
 *
 * Returns:
 *   - requiredDocuments      — all docs mapped to this entity type
 *   - attachedDocumentsByStatus { PENDING, ACCEPTED, REJECTED }
 *   - unAttachedDocumentTypes  — required but not yet uploaded
 *   - isCompliant              — true when all mandatory docs are ACCEPTED
 *
 * @param {Object} opts
 * @param {'user'|'company'|'vehicle'} opts.ownerType
 * @param {string}  opts.ownerUniqueId  — UUID of the entity
 * @param {number}  [opts.roleId]       — override roleId (user path only)
 */

/**
 * entityDocumentRequirement
 * ─────────────────────────
 * General document compliance check for ANY owner type: 'user', 'company', 'vehicle'.
 *
 * Maps ownerType → roleId to pull the correct RoleDocumentRequirements rows:
 *   ownerType='company' → roleId 8
 *   ownerType='vehicle' → roleId 9
 *   ownerType='user'    → caller must pass roleId explicitly (default: driver=2)
 *
 * Returns:
 *   - requiredDocuments      — all docs mapped to this entity type
 *   - attachedDocumentsByStatus { PENDING, ACCEPTED, REJECTED }
 *   - unAttachedDocumentTypes  — required but not yet uploaded
 *   - isCompliant              — true when all mandatory docs are ACCEPTED
 *
 * @param {Object} opts
 * @param {'user'|'company'|'vehicle'} opts.ownerType
 * @param {string}  opts.ownerUniqueId  — UUID of the entity
 * @param {number}  [opts.roleId]       — override roleId (user path only)
 */
const entityDocumentRequirement = async ({
  ownerType,
  ownerUniqueId,
  roleId: explicitRoleId
}) => {
  // Map ownerType → roleId for RoleDocumentRequirements lookup
  const OWNER_ROLE_MAP = {
    company: usersRoles.companyRoleId,
    // 8
    vehicle: usersRoles.vehicleRoleId,
    // 9
    user: explicitRoleId ?? usersRoles.driverRoleId // caller-supplied or default driver
  };
  const roleId = OWNER_ROLE_MAP[ownerType];
  if (!roleId) {
    throw new AppError(`Unknown ownerType: ${ownerType}`, 400);
  }

  // 1. Fetch what documents this entity type is required to have
  const requiredDocsResult = await getRoleDocumentRequirements({
    roleId,
    page: 1,
    limit: 1000,
    sortBy: "documentTypeId",
    sortOrder: "ASC"
  });
  const requiredDocuments = requiredDocsResult?.data || [];
  if (requiredDocuments.length === 0) {
    return {
      message: "success",
      messageType: "entityDocumentRequirement",
      ownerType,
      ownerUniqueId,
      requiredDocuments: [],
      unAttachedDocumentTypes: [],
      attachedDocumentsByStatus: {
        PENDING: [],
        ACCEPTED: [],
        REJECTED: []
      },
      isCompliant: true // no requirements = compliant by default
    };
  }

  // 2. Fetch what this specific entity has actually uploaded
  const executor = transactionStorage.getStore() || pool;
  const [attachedDocuments] = await executor.query(`SELECT DISTINCT ad.*, dt.*, rdr.*
     FROM AttachedDocuments ad
     JOIN DocumentTypes dt ON ad.documentTypeId = dt.documentTypeId
     JOIN RoleDocumentRequirements rdr ON rdr.documentTypeId = dt.documentTypeId
     WHERE ad.ownerType = ? AND ad.ownerUniqueId = ? AND rdr.roleId = ?`, [ownerType, ownerUniqueId, roleId]);

  // 3. Group by acceptance status
  const attachedDocumentsByStatus = {
    PENDING: [],
    ACCEPTED: [],
    REJECTED: []
  };
  attachedDocuments.forEach(doc => {
    const status = doc.attachedDocumentAcceptance;
    if (attachedDocumentsByStatus[status]) {
      attachedDocumentsByStatus[status].push(doc);
    }
  });

  // 4. Find mandatory gaps
  const unAttachedDocumentTypes = requiredDocuments.filter(req => !attachedDocuments.some(att => att.documentTypeId === req.documentTypeId));
  const mandatoryMissing = unAttachedDocumentTypes.filter(d => Number(d.isDocumentMandatory) === 1);
  const mandatoryRejected = attachedDocumentsByStatus.REJECTED.filter(d => Number(d.isDocumentMandatory) === 1);
  const isCompliant = mandatoryMissing.length === 0 && mandatoryRejected.length === 0;
  return {
    message: "success",
    messageType: "entityDocumentRequirement",
    ownerType,
    ownerUniqueId,
    roleId,
    requiredDocuments,
    attachedDocumentsByStatus,
    unAttachedDocumentTypes,
    isCompliant
  };
};

module.exports = {
  driversDocumentVehicleRequirement,
  entityDocumentRequirement
};
