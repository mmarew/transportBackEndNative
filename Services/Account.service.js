const { getUserByFilterDetailed } = require("./User.service");
const { getVehicleDrivers } = require("./VehicleDriver.service");
const {
  updateUserRoleStatus,
  getUserRoleStatusCurrent,
} = require("./UserRoleStatus.service");
const {
  getRoleDocumentRequirements,
} = require("./RoleDocumentRequirements.service");
const { pool } = require("../Middleware/Database.config");
const { usersRoles } = require("../Utils/ListOfFixedData");
const {
  getDriverSubscriptionsWithFilters,
  createDriverSubscription,
  getSubscriptionData,
} = require("./DriverSubscription.service");

// Consolidated account status check for a user (documents, vehicle, ban)
const accountStatus = async ({
  ownerUserUniqueId,
  user,
  body,
  enableDocumentChecks = true,
}) => {
  // Define userVehicle at the top level so it's accessible throughout
  let userVehicle = null;

  try {
    // ========== STEP 0: RESOLVE USER CONTEXT ==========
    let effectiveUser = user;
    if (
      !effectiveUser ||
      (ownerUserUniqueId && ownerUserUniqueId !== user?.userUniqueId)
    ) {
      const userData = await getUserByFilterDetailed({
        userUniqueId: ownerUserUniqueId,
      });
      effectiveUser = userData?.data;
    }

    if (!effectiveUser) {
      return { message: "error", data: "User not found" };
    }

    const roleId = effectiveUser?.roleId ?? body?.roleId;
    const phoneNumber = effectiveUser?.phoneNumber;
    const userRoleStatusDescription = body?.userRoleStatusDescription;

    if (!roleId) {
      return { message: "error", data: "Role ID is required" };
    }

    // ========== STEP 1: FETCH USER ROLE STATUS (Once) ==========
    const userRoleStatus = await getUserRoleStatusCurrent({
      data: { roleId, search: phoneNumber },
    });

    if (!userRoleStatus || userRoleStatus?.data?.length === 0) {
      return { message: "error", data: "User role status not found" };
    }

    const { userRoleStatusUniqueId, userRoleId, statusId } =
      userRoleStatus.data[0];

    // ========== STEP 2: CHECK IF BANNED ==========
    // let isBanned = false;
    let banData = null;
    try {
      // IMPORTANT: Check if BannedUsers.service exports getBannedUsers
      // If not, you may need to check the correct export name or module
      const bannedUsersService = require("./BannedUsers.service");
      const banCheck = await bannedUsersService.getBannedUsers({
        check: true,
        phoneNumber,
        roleId,
      });
      banData = banCheck?.data;
      // isBanned = banCheck?.data?.isBanned === true;
      console.log("@banCheck", banCheck);
    } catch (e) {
      console.error("@error on checkBan", e);
      // Continue if ban check fails
    }

    if (banData?.isBanned) {
      // Update status to 6 (Banned)
      await updateUserRoleStatus({
        user: effectiveUser,
        roleId,
        userRoleStatusUniqueId,
        userRoleId,
        newStatusId: 6,
        userRoleStatusDescription,
        phoneNumber,
      });

      const latestUserData = await getUserRoleStatusCurrent({
        data: { roleId, search: phoneNumber },
      });

      return {
        message: "success",
        messageType: "accountStatus",
        vehicle: null,
        userData: latestUserData?.data?.[0] || null,
        attachedDocumentsByStatus: {},
        unAttachedDocumentTypes: [],
        requiredDocuments: [],
        subscription: {},
        status: 6,
        reason: "User is banned",
        banData: banData?.banDetails,
      };
    }

    // ========== STEP 3: PARALLELIZE INDEPENDENT CHECKS ==========
    const requiresVehicle = [
      usersRoles.driverRoleId,
      usersRoles.vehicleOwnerRoleId,
    ].includes(Number(roleId));

    // Run vehicle check and document requirements in parallel
    const [vehicleCheck, requiredDocsResult] = await Promise.allSettled([
      requiresVehicle
        ? getVehicleDrivers({
            ownerUserUniqueId,
            assignmentStatus: "active",
            limit: 1,
            page: 1,
          })
        : Promise.resolve({ data: [] }),

      enableDocumentChecks
        ? getRoleDocumentRequirements({
            roleId,
            page: 1,
            limit: 1000,
            sortBy: "documentTypeId",
            sortOrder: "ASC",
          })
        : Promise.resolve({ data: [] }),
    ]);

    // ========== STEP 4: CHECK VEHICLE (If Required) ==========
    if (requiresVehicle) {
      const vehicleResult =
        vehicleCheck.status === "fulfilled" ? vehicleCheck.value : { data: [] };
      const vehicles = vehicleResult?.data || [];

      if (vehicles.length === 0) {
        await updateUserRoleStatus({
          user: effectiveUser,
          roleId,
          userRoleStatusUniqueId,
          userRoleId,
          newStatusId: 2,
          userRoleStatusDescription,
          phoneNumber,
        });

        const latestUserData = await getUserRoleStatusCurrent({
          data: { roleId, search: phoneNumber },
        });

        return {
          message: "success",
          messageType: "accountStatus",
          vehicle: null,
          userData: latestUserData?.data?.[0] || null,
          attachedDocumentsByStatus: {},
          unAttachedDocumentTypes: [],
          requiredDocuments: [],
          subscription: {},
          status: 2,
          reason: "No vehicle registered for this role",
        };
      } else {
        // Store the vehicle for later use
        userVehicle = vehicles[0];
      }
    }

    // ========== STEP 5: CHECK DOCUMENTS (If Enabled) ==========
    let attachedDocumentsByStatus = { PENDING: [], ACCEPTED: [], REJECTED: [] };
    let unAttachedDocumentTypes = [];
    let requiredDocuments = [];

    if (enableDocumentChecks && requiredDocsResult.status === "fulfilled") {
      requiredDocuments = requiredDocsResult.value?.data || [];

      if (requiredDocuments.length > 0) {
        // Optimized single query for document status
        const sql = `
          SELECT 
            ad.*, 
            dt.*,
            rdr.*,
            CASE 
              WHEN ad.attachedDocumentId IS NULL THEN 'NOT_ATTACHED'
              ELSE ad.attachedDocumentAcceptance 
            END as doc_status
          FROM RoleDocumentRequirements rdr
          JOIN DocumentTypes dt ON rdr.documentTypeId = dt.documentTypeId
          LEFT JOIN AttachedDocuments ad ON ad.documentTypeId = dt.documentTypeId 
            AND ad.userUniqueId = ? 
            AND ad.attachedDocumentAcceptance != 'DELETED'
          WHERE rdr.roleId = ?
          ORDER BY dt.documentTypeId
        `;

        const [allDocs] = await pool.query(sql, [ownerUserUniqueId, roleId]);

        // Process documents in a single pass
        allDocs.forEach((doc) => {
          if (doc.doc_status === "NOT_ATTACHED") {
            unAttachedDocumentTypes.push(doc);
          } else if (attachedDocumentsByStatus[doc.doc_status]) {
            attachedDocumentsByStatus[doc.doc_status].push(doc);
          }
        });

        // Check for document issues in priority order
        if (attachedDocumentsByStatus.REJECTED.length > 0) {
          return await updateStatusAndReturn(
            4,
            "One or more documents have been rejected"
          );
        } else if (unAttachedDocumentTypes.length > 0) {
          return await updateStatusAndReturn(
            3,
            "Some required documents are not attached"
          );
        } else if (attachedDocumentsByStatus.PENDING.length > 0) {
          return await updateStatusAndReturn(
            5,
            "One or more documents are pending review"
          );
        }
      }
    }

    // ========== STEP 6: CHECK SUBSCRIPTION (Drivers Only) ==========
    let subscriptionInfo = {
      hasActiveSubscription: false,
      subscriptionType: null,
      subscriptionDetails: null,
    };

    if (Number(roleId) === usersRoles.driverRoleId) {
      // Optimized subscription check
      subscriptionInfo = await checkAndGrantDriverSubscription(
        ownerUserUniqueId
      );

      if (!subscriptionInfo.hasActiveSubscription) {
        return await updateStatusAndReturn(
          7,
          "Driver doesn't have an active subscription"
        );
      }
    }

    // ========== STEP 7: ALL CHECKS PASSED ==========
    if (statusId !== 1) {
      await updateUserRoleStatus({
        user: effectiveUser,
        roleId,
        userRoleStatusUniqueId,
        userRoleId,
        newStatusId: 1,
        userRoleStatusDescription,
        phoneNumber,
      });
    }

    const latestUserData = await getUserRoleStatusCurrent({
      data: { roleId, search: phoneNumber },
    });

    return {
      message: "success",
      messageType: "accountStatus",
      vehicle: userVehicle,
      userData: latestUserData?.data?.[0] || null,
      attachedDocumentsByStatus,
      unAttachedDocumentTypes: [],
      requiredDocuments,
      subscription: subscriptionInfo,
      status: 1,
      reason: "All requirements satisfied",
    };

    // ========== HELPER FUNCTION ==========
    async function updateStatusAndReturn(newStatusId, reason) {
      await updateUserRoleStatus({
        user: effectiveUser,
        roleId,
        userRoleStatusUniqueId,
        userRoleId,
        newStatusId,
        userRoleStatusDescription,
        phoneNumber,
      });

      const latestUserData = await getUserRoleStatusCurrent({
        data: { roleId, search: phoneNumber },
      });

      return {
        message: "success",
        messageType: "accountStatus",
        vehicle: userVehicle,
        userData: latestUserData?.data?.[0] || null,
        attachedDocumentsByStatus,
        unAttachedDocumentTypes,
        requiredDocuments,
        subscription: subscriptionInfo,
        status: newStatusId,
        reason,
      };
    }
  } catch (error) {
    console.error("@Account.service.accountStatus error:", error);
    return {
      message: "error",
      data: "An error occurred during account status evaluation",
      error: error.message,
    };
  }
};

// ========== OPTIMIZED SUBSCRIPTION HELPER ==========
async function checkAndGrantDriverSubscription(driverUniqueId) {
  try {
    let wasGranted = false;

    // 1. Check for unassigned free plans (limit to 1)
    const unassignedFreePlans = await getSubscriptionData({
      dataType: "freePlans",
      driverUniqueId,
      page: 1,
      limit: 1,
    });
    console.log("@unassignedFreePlans", unassignedFreePlans);
    // 2. Grant if found (but only one at a time)
    if (unassignedFreePlans?.data?.length > 0) {
      const plan = unassignedFreePlans.data[0];
      await createDriverSubscription({
        driverUniqueId,
        subscriptionPlanUniqueId: plan.subscriptionPlanUniqueId,
      });
      wasGranted = true;
    }

    // 3. Check active subscriptions (single query)
    const activeSubscriptions = await getDriverSubscriptionsWithFilters({
      driverUniqueId,
      isActive: true,
    });

    if (activeSubscriptions?.data?.length > 0) {
      const subscription = activeSubscriptions.data;
      return {
        hasActiveSubscription: true,
        subscriptionType: subscription.isFree ? "free" : "paid",
        subscriptionDetails: subscription,
        wasRecentlyGranted: wasGranted,
      };
    }

    return {
      hasActiveSubscription: false,
      subscriptionType: "none",
      subscriptionDetails: null,
      wasRecentlyGranted: wasGranted,
    };
  } catch (error) {
    console.error("@checkAndGrantDriverSubscription error:", error);
    return {
      hasActiveSubscription: false,
      subscriptionType: "error",
      subscriptionDetails: null,
      error: "Failed to check subscription status",
    };
  }
}

module.exports = {
  accountStatus,
};
