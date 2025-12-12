const {
  getUserByUserUniqueId,
  getUserByFilterDetailed,
} = require("./User.service");
const { getVehicleDrivers } = require("./VehicleDriver.service");
const {
  updateUserRoleStatus,
  getUserRoleStatusCurrent,
} = require("./UserRoleStatus.service");
const {
  getRoleDocumentRequirements,
} = require("./RoleDocumentRequirements.service");
const {
  findStatusByVehicleAndDocuments,
} = require("../Utils/StatusOfUsersByVehiclesAndDocs");
const { pool } = require("../Middleware/Database.config");
const { usersRoles } = require("../Utils/ListOfFixedData");
const {
  getDriverSubscriptionsWithFilters,
} = require("./DriverSubscription.service");

// Consolidated account status check for a user (documents, vehicle, ban)
const accountStatus = async ({ ownerUserUniqueId, user, body }) => {
  try {
    // Resolve effective user context
    let effectiveUser = user;
    if (
      !effectiveUser ||
      (ownerUserUniqueId && ownerUserUniqueId !== user?.userUniqueId)
    ) {
      const filters = { userUniqueId: ownerUserUniqueId };
      const userData = getUserByFilterDetailed(filters); // await getUserByUserUniqueId(ownerUserUniqueId);
      effectiveUser = userData?.data;
    }

    const roleId = effectiveUser?.roleId ?? body?.roleId;
    const phoneNumber = effectiveUser?.phoneNumber;
    const userRoleStatusDescription = body?.userRoleStatusDescription;

    if (!roleId) {
      return {
        message: "error",
        data: "Role ID is required to evaluate account status",
      };
    }

    // Role-based rules
    const requiresVehicle = [
      usersRoles.driverRoleId,
      usersRoles.vehicleOwnerRoleId,
    ].includes(Number(roleId));

    const enableDocumentChecks = true;

    // 1) Fetch current user role status
    let userRoleStatus = await getUserRoleStatusCurrent({
      data: { roleId, search: phoneNumber },
    });
    console.log("@userRoleStatus accountStatus =======> ", userRoleStatus);
    if (!userRoleStatus || userRoleStatus?.data?.length === 0) {
      return { message: "error", data: "User data not found" };
    }
    const { userRoleStatusUniqueId, userRoleId, statusId } =
      userRoleStatus?.data?.[0];

    // 2) Required documents for role (if enabled)
    let requiredDocuments = [];
    if (enableDocumentChecks) {
      const requiredDocsResult = await getRoleDocumentRequirements({
        roleId,
        page: 1,
        limit: 1000,
        sortBy: "documentTypeId",
        sortOrder: "ASC",
      });
      requiredDocuments = requiredDocsResult?.data || [];
    }

    const sql = `SELECT DISTINCT AttachedDocuments.*, DocumentTypes.*, RoleDocumentRequirements.*
FROM AttachedDocuments
JOIN DocumentTypes
  ON AttachedDocuments.documentTypeId = DocumentTypes.documentTypeId
JOIN RoleDocumentRequirements
  ON RoleDocumentRequirements.documentTypeId = DocumentTypes.documentTypeId
WHERE AttachedDocuments.userUniqueId = ?
  AND RoleDocumentRequirements.roleId = ?
`;
    const [attachedDocuments] = enableDocumentChecks
      ? await pool.query(sql, [ownerUserUniqueId, roleId])
      : [[]];

    // 4) Unattached required document types
    const unAttachedDocumentTypes = enableDocumentChecks
      ? requiredDocuments.filter(
          (requiredDocument) =>
            !attachedDocuments.some(
              (attachedDocument) =>
                attachedDocument.documentTypeId ===
                requiredDocument.documentTypeId
            )
        )
      : [];
    // 5) Group attached docs by acceptance status
    const attachedDocumentsByStatus = {
      PENDING: [],
      ACCEPTED: [],
      REJECTED: [],
    };
    if (enableDocumentChecks) {
      attachedDocuments.forEach((doc) => {
        const acceptanceStatus = doc.attachedDocumentAcceptance;
        if (attachedDocumentsByStatus[acceptanceStatus]) {
          attachedDocumentsByStatus[acceptanceStatus].push(doc);
        }
      });
    }
    // 6) Vehicle assignment check
    let userVehicle = [];
    let vehicleRegistered = true; // default true if not required
    if (requiresVehicle) {
      const vehicleDriverResult = await getVehicleDrivers({
        ownerUserUniqueId,
        assignmentStatus: "active",
        limit: 1,
        page: 1,
      });
      userVehicle = vehicleDriverResult?.data || [];
      vehicleRegistered = userVehicle.length > 0;
    }

    // 7) Ban check
    let isBanned = false;
    try {
      const banCheckData = {
        check: true,
        phoneNumber,
        roleId,
      };
      console.log("@Account.service.accountStatus banCheckData", banCheckData);
      const { getBannedUsers } = require("./BannedUsers.service");

      const banCheck = await getBannedUsers(banCheckData);
      isBanned = banCheck?.data?.isBanned === true;
      console.log("@Account.service.accountStatus isBanned", isBanned);
    } catch (e) {
      console.error("@error on checkBan e", e);
      isBanned = false; // don't fail the flow on ban check error
    }

    // 8) Compute final status
    let finalStatusId;
    // if driver dosen't have subscription set finalStatusId=7.

    if (isBanned) {
      finalStatusId = 6; // banned
    } else {
      // Check active subscription for drivers; if none, set to 7 (no subscription)
      let hasActiveSubscription = true;
      if (Number(roleId) === usersRoles.driverRoleId) {
        try {
          console.log(
            "@usersRoles.driverRoleId",
            usersRoles.driverRoleId,
            "@roleId",
            roleId
          );
          const subs = await getDriverSubscriptionsWithFilters({
            driverUniqueId: ownerUserUniqueId,
            isActive: true,
          });
          console.log("@account status subs", subs);
          hasActiveSubscription = (subs?.data?.length || 0) > 0;
        } catch (e) {
          console.error("@checkActiveSubscriptions error e is", e);
          hasActiveSubscription = false; // default to no active subscription on error
        }
      }

      if (
        Number(roleId) === usersRoles.driverRoleId &&
        !hasActiveSubscription
      ) {
        finalStatusId = 7; // inactive - Driver doesn't have a subscription
      } else if (enableDocumentChecks || requiresVehicle) {
        const resultOfStatus = findStatusByVehicleAndDocuments({
          attachedDocuments,
          attachedDocumentsByStatus,
          requiredDocuments,
          vehicleRegistered,
          unAttachedDocumentTypes,
        });
        if (resultOfStatus?.message === "error") return resultOfStatus;
        finalStatusId = resultOfStatus?.finalStatusId;
      } else {
        // Roles without doc/vehicle checks retain current status
        finalStatusId = statusId;
      }
    }

    // 9) Update role status if changed
    if (statusId !== finalStatusId) {
      const userRoleStatusData = {
        user: effectiveUser,
        roleId,
        userRoleStatusUniqueId,
        userRoleId,
        newStatusId: finalStatusId,
        userRoleStatusDescription,
        phoneNumber,
      };
      await updateUserRoleStatus(userRoleStatusData);
    }

    // 10) Return latest
    const latestUserData = await getUserRoleStatusCurrent({
      data: { roleId, search: phoneNumber },
    });
    return {
      message: "success",
      messageType: "accountStatus",
      vehicle: userVehicle?.[0] || null,
      userData: latestUserData?.data?.[0] || null,
      attachedDocumentsByStatus,
      unAttachedDocumentTypes,
      requiredDocuments,
      status: finalStatusId,
    };
  } catch (error) {
    console.log("@Account.service.accountStatus error", error);
    return {
      message: "error",
      data: "An error occurred during account status evaluation",
    };
  }
};

module.exports = {
  accountStatus,
};
