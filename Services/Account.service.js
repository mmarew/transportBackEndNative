const { getUserByFilterDetailed } = require("./User.service");
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
const { getPricingWithFilters } = require("./SubscriptionPlanPricing.service");
const {
  getFreeGiftToDriversWithFilters,
  createFreeGiftToDriver,
} = require("./FreeGiftToDriver.service");
const { currentDate } = require("../Utils/CurrentDate");

// // Consolidated account status check for a user (documents, vehicle, ban)
// const accountStatus = async ({ ownerUserUniqueId, user, body }) => {
//   try {
//     // Resolve effective user context
//     let effectiveUser = user;
//     if (
//       !effectiveUser ||
//       (ownerUserUniqueId && ownerUserUniqueId !== user?.userUniqueId)
//     ) {
//       const filters = { userUniqueId: ownerUserUniqueId };
//       // check if user exists
//       const userData = getUserByFilterDetailed(filters); // await getUserByUserUniqueId(ownerUserUniqueId);
//       effectiveUser = userData?.data;
//     }
//     console.log("@accountStatus effectiveUser", effectiveUser);
//     const roleId = effectiveUser?.roleId ?? body?.roleId;
//     const phoneNumber = effectiveUser?.phoneNumber;
//     const userRoleStatusDescription = body?.userRoleStatusDescription;

//     if (!roleId) {
//       return {
//         message: "error",
//         data: "Role ID is required to evaluate account status",
//       };
//     }

//     // Role-based rules
//     const requiresVehicle = [
//       usersRoles.driverRoleId,
//       usersRoles.vehicleOwnerRoleId,
//     ].includes(Number(roleId));

//     const enableDocumentChecks = true;

//     // 1) Fetch current user role status
//     let userRoleStatus = await getUserRoleStatusCurrent({
//       data: { roleId, search: phoneNumber },
//     });
//     console.log("@accountStatus accountStatus =======> ", userRoleStatus);
//     if (!userRoleStatus || userRoleStatus?.data?.length === 0) {
//       return { message: "error", data: "User data not found" };
//     }
//     const { userRoleStatusUniqueId, userRoleId, statusId } =
//       userRoleStatus?.data?.[0];

//     // 2) Required documents for role (if enabled)
//     let requiredDocuments = [];
//     if (enableDocumentChecks) {
//       const requiredDocsResult = await getRoleDocumentRequirements({
//         roleId,
//         page: 1,
//         limit: 1000,
//         sortBy: "documentTypeId",
//         sortOrder: "ASC",
//       });
//       requiredDocuments = requiredDocsResult?.data || [];
//     }

//     const sql = `SELECT DISTINCT AttachedDocuments.*, DocumentTypes.*, RoleDocumentRequirements.*
// FROM AttachedDocuments
// JOIN DocumentTypes
//   ON AttachedDocuments.documentTypeId = DocumentTypes.documentTypeId
// JOIN RoleDocumentRequirements
//   ON RoleDocumentRequirements.documentTypeId = DocumentTypes.documentTypeId
// WHERE AttachedDocuments.userUniqueId = ?
//   AND RoleDocumentRequirements.roleId = ?
// `;
//     const [attachedDocuments] = enableDocumentChecks
//       ? await pool.query(sql, [ownerUserUniqueId, roleId])
//       : [[]];

//     // 4) Unattached required document types
//     const unAttachedDocumentTypes = enableDocumentChecks
//       ? requiredDocuments.filter(
//           (requiredDocument) =>
//             !attachedDocuments.some(
//               (attachedDocument) =>
//                 attachedDocument.documentTypeId ===
//                 requiredDocument.documentTypeId
//             )
//         )
//       : [];
//     // 5) Group attached docs by acceptance status
//     const attachedDocumentsByStatus = {
//       PENDING: [],
//       ACCEPTED: [],
//       REJECTED: [],
//     };
//     if (enableDocumentChecks) {
//       attachedDocuments.forEach((doc) => {
//         const acceptanceStatus = doc.attachedDocumentAcceptance;
//         if (attachedDocumentsByStatus[acceptanceStatus]) {
//           attachedDocumentsByStatus[acceptanceStatus].push(doc);
//         }
//       });
//     }
//     // 6) Vehicle assignment check
//     let userVehicle = [];
//     let vehicleRegistered = true; // default true if not required
//     if (requiresVehicle) {
//       const vehicleDriverResult = await getVehicleDrivers({
//         ownerUserUniqueId,
//         assignmentStatus: "active",
//         limit: 1,
//         page: 1,
//       });
//       userVehicle = vehicleDriverResult?.data || [];
//       vehicleRegistered = userVehicle.length > 0;
//     }

//     // 7) Ban check
//     let isBanned = false;
//     try {
//       const banCheckData = {
//         check: true,
//         phoneNumber,
//         roleId,
//       };
//       const { getBannedUsers } = require("./BannedUsers.service");

//       const banCheck = await getBannedUsers(banCheckData);
//       isBanned = banCheck?.data?.isBanned === true;
//       console.log("@accountStatus  isBanned", isBanned);
//     } catch (e) {
//       console.error("@error on checkBan e", e);
//       isBanned = false; // don't fail the flow on ban check error
//     }

//     // 8) Compute final status
//     let finalStatusId;
//     // if driver dosen't have subscription set finalStatusId=7.

//     if (isBanned) {
//       finalStatusId = 6; // banned status
//     } else {
//       // Check active subscription for drivers; if none, set to 7 (no subscription)
//       let hasActiveSubscription = true;
//       if (Number(roleId) === usersRoles.driverRoleId) {
//         try {
//           console.log(
//             "@usersRoles.driverRoleId",
//             usersRoles.driverRoleId,
//             "@roleId",
//             roleId
//           );
//           const subs = await getDriverSubscriptionsWithFilters({
//             driverUniqueId: ownerUserUniqueId,
//             isActive: true,
//           });
//           console.log("@accountStatus subs", subs);
//           hasActiveSubscription = (subs?.data?.length || 0) > 0;
//         } catch (e) {
//           console.error("@checkActiveSubscriptions error e is", e);
//           hasActiveSubscription = false; // default to no active subscription on error
//         }
//       }

//       if (
//         Number(roleId) === usersRoles.driverRoleId &&
//         !hasActiveSubscription
//       ) {
//         finalStatusId = 7; // inactive - Driver doesn't have a subscription

//         //1)First get subscription plan data with pricings (these are free and non-free)
//         const pricingPlanResult = await getPricingWithFilters({});
//         const message = pricingPlanResult?.message;
//         if (message == "success") {
//           const pricingPlanData = pricingPlanResult?.data;
//           console.log(
//             "@pricingPlanData",
//             pricingPlanData,
//             "pricingPlanResult",
//             pricingPlanResult
//           );
//           // if Pricing Plan Data have data find free plan
//           const freePlan = pricingPlanData?.find((data) => data.isFree == true);
//           console.log("@freePlanfreePlan", freePlan);
//           const driverUniqueId = ownerUserUniqueId,
//             subscriptionPlanUniqueId = freePlan?.subscriptionPlanUniqueId;
//           // check if this free plan is already given to driver
//           const freeGift = await getFreeGiftToDriversWithFilters({
//             driverUniqueId,
//             subscriptionPlanUniqueId,
//           });
//           console.log("@freeGiftfreeGift", freeGift);
//           if (freeGift.message == "success") {
//             const data = freeGift?.data;
//             // if there is no data create this free gift
//             if (!data?.length) {
//               const giftStartDate = currentDate();
//               const newGiftData = await createFreeGiftToDriver({
//                 driverUniqueId,
//                 subscriptionPlanUniqueId,
//                 giftStartDate,
//               });
//               console.log("@newGiftData", newGiftData);
//               if (newGiftData.message == "success") {
//                 if (newGiftData?.data) {
//                   finalStatusId = 1;
//                 }
//               }
//             }
//             // else if there is free data set finalStatusId to 1
//             else {
//               finalStatusId = 1;
//             }
//           }
//         } else {
//           finalStatusId = 7;
//         }
//       } else if (enableDocumentChecks || requiresVehicle) {
//         const resultOfStatus = findStatusByVehicleAndDocuments({
//           attachedDocuments,
//           attachedDocumentsByStatus,
//           requiredDocuments,
//           vehicleRegistered,
//           unAttachedDocumentTypes,
//         });
//         if (resultOfStatus?.message === "error") return resultOfStatus;
//         finalStatusId = resultOfStatus?.finalStatusId;
//       } else {
//         // Roles without doc/vehicle checks retain current status
//         finalStatusId = statusId;
//       }
//     }
//     console.log("@statusId", statusId, "@finalStatusId", finalStatusId);
//     // 9) Update role status if changed
//     if (statusId !== finalStatusId) {
//       const userRoleStatusData = {
//         user: effectiveUser,
//         roleId,
//         userRoleStatusUniqueId,
//         userRoleId,
//         newStatusId: finalStatusId,
//         userRoleStatusDescription,
//         phoneNumber,
//       };
//       await updateUserRoleStatus(userRoleStatusData);
//     }

//     // 10) Return latest
//     const latestUserData = await getUserRoleStatusCurrent({
//       data: { roleId, search: phoneNumber },
//     });
//     return {
//       message: "success",
//       messageType: "accountStatus",
//       vehicle: userVehicle?.[0] || null,
//       userData: latestUserData?.data?.[0] || null,
//       attachedDocumentsByStatus,
//       unAttachedDocumentTypes,
//       requiredDocuments,
//       status: finalStatusId,
//     };
//   } catch (error) {
//     console.log("@Account.service.accountStatus error", error);
//     return {
//       message: "error",
//       data: "An error occurred during account status evaluation",
//     };
//   }
// };

// module.exports = {
//   accountStatus,
// };
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
      const userData = await getUserByFilterDetailed(filters);
      effectiveUser = userData?.data;
    }

    console.log("@accountStatus effectiveUser", effectiveUser);
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

    // Get current status first
    let userRoleStatus = await getUserRoleStatusCurrent({
      data: { roleId, search: phoneNumber },
    });

    if (!userRoleStatus || userRoleStatus?.data?.length === 0) {
      return { message: "error", data: "User data not found" };
    }

    const { userRoleStatusUniqueId, userRoleId, statusId } =
      userRoleStatus?.data?.[0];

    // ========== PRIORITY 1: CHECK BAN ==========
    let isBanned = false;
    try {
      const { getBannedUsers } = require("./BannedUsers.service");
      const banCheckData = {
        check: true,
        phoneNumber,
        roleId,
      };
      const banCheck = await getBannedUsers(banCheckData);
      isBanned = banCheck?.data?.isBanned === true;
      console.log("@accountStatus isBanned", isBanned);
    } catch (e) {
      console.error("@error on checkBan e", e);
      isBanned = false;
    }

    if (isBanned) {
      await updateStatusIfChanged(statusId, 6, {
        user: effectiveUser,
        roleId,
        userRoleStatusUniqueId,
        userRoleId,
        userRoleStatusDescription,
        phoneNumber,
      });

      return await buildResponse(6, {
        roleId,
        phoneNumber,
        reason: "User is banned",
        banned: true,
      });
    }

    // ========== PRIORITY 2: CHECK SUBSCRIPTION (DRIVERS ONLY) ==========
    if (Number(roleId) === usersRoles.driverRoleId) {
      let hasActiveSubscription = false;
      try {
        const subs = await getDriverSubscriptionsWithFilters({
          driverUniqueId: ownerUserUniqueId,
          isActive: true,
        });
        console.log("@accountStatus subscription check", subs);
        hasActiveSubscription = (subs?.data?.length || 0) > 0;

        // If no active subscription, try to give free gift
        if (!hasActiveSubscription) {
          const freeGiftResult = await handleFreeGiftForDriver(
            ownerUserUniqueId
          );

          if (freeGiftResult.hasFreeGift) {
            hasActiveSubscription = true;
            console.log("@accountStatus free gift applied");
          }
        }

        if (!hasActiveSubscription) {
          await updateStatusIfChanged(statusId, 7, {
            user: effectiveUser,
            roleId,
            userRoleStatusUniqueId,
            userRoleId,
            userRoleStatusDescription,
            phoneNumber,
          });

          return await buildResponse(7, {
            roleId,
            phoneNumber,
            reason: "No active subscription",
            subscriptionActive: false,
          });
        }
      } catch (e) {
        console.error("@checkActiveSubscriptions error e is", e);
        // Continue with other checks even if subscription check fails
      }
    }

    // ========== PRIORITY 3: CHECK VEHICLE ==========
    let userVehicle = [];
    let vehicleRegistered = true;

    if (requiresVehicle) {
      try {
        const vehicleDriverResult = await getVehicleDrivers({
          ownerUserUniqueId,
          assignmentStatus: "active",
          limit: 1,
          page: 1,
        });
        userVehicle = vehicleDriverResult?.data || [];
        vehicleRegistered = userVehicle.length > 0;

        if (!vehicleRegistered) {
          await updateStatusIfChanged(statusId, 2, {
            user: effectiveUser,
            roleId,
            userRoleStatusUniqueId,
            userRoleId,
            userRoleStatusDescription,
            phoneNumber,
          });

          return await buildResponse(2, {
            roleId,
            phoneNumber,
            reason: "No vehicle registered",
            vehicle: null,
            vehicleRegistered: false,
          });
        }
      } catch (e) {
        console.error("@vehicle check error", e);
        // Continue with other checks
      }
    }

    // ========== PRIORITY 4: CHECK DOCUMENTS ==========
    if (enableDocumentChecks) {
      try {
        // Get required documents
        const requiredDocsResult = await getRoleDocumentRequirements({
          roleId,
          page: 1,
          limit: 1000,
          sortBy: "documentTypeId",
          sortOrder: "ASC",
        });
        const requiredDocuments = requiredDocsResult?.data || [];

        // Get attached documents
        const sql = `SELECT DISTINCT AttachedDocuments.*, DocumentTypes.*, RoleDocumentRequirements.*
                     FROM AttachedDocuments
                     JOIN DocumentTypes
                       ON AttachedDocuments.documentTypeId = DocumentTypes.documentTypeId
                     JOIN RoleDocumentRequirements
                       ON RoleDocumentRequirements.documentTypeId = DocumentTypes.documentTypeId
                     WHERE AttachedDocuments.userUniqueId = ?
                       AND RoleDocumentRequirements.roleId = ?`;
        const [attachedDocuments] = await pool.query(sql, [
          ownerUserUniqueId,
          roleId,
        ]);

        // Group by status
        const attachedDocumentsByStatus = {
          PENDING: [],
          ACCEPTED: [],
          REJECTED: [],
        };

        attachedDocuments.forEach((doc) => {
          const acceptanceStatus = doc.attachedDocumentAcceptance;
          if (attachedDocumentsByStatus[acceptanceStatus]) {
            attachedDocumentsByStatus[acceptanceStatus].push(doc);
          }
        });

        // Find unattached documents
        const unAttachedDocumentTypes = requiredDocuments.filter(
          (requiredDocument) =>
            !attachedDocuments.some(
              (attachedDocument) =>
                attachedDocument.documentTypeId ===
                requiredDocument.documentTypeId
            )
        );

        // Check for rejected documents (PRIORITY: Highest in document checks)
        if (attachedDocumentsByStatus.REJECTED.length > 0) {
          await updateStatusIfChanged(statusId, 4, {
            user: effectiveUser,
            roleId,
            userRoleStatusUniqueId,
            userRoleId,
            userRoleStatusDescription,
            phoneNumber,
          });

          return await buildResponse(4, {
            roleId,
            phoneNumber,
            reason: "Documents rejected",
            attachedDocumentsByStatus,
            unAttachedDocumentTypes,
            requiredDocuments,
          });
        }

        // Check for missing documents
        if (unAttachedDocumentTypes.length > 0) {
          await updateStatusIfChanged(statusId, 3, {
            user: effectiveUser,
            roleId,
            userRoleStatusUniqueId,
            userRoleId,
            userRoleStatusDescription,
            phoneNumber,
          });

          return await buildResponse(3, {
            roleId,
            phoneNumber,
            reason: "Required documents missing",
            attachedDocumentsByStatus,
            unAttachedDocumentTypes,
            requiredDocuments,
          });
        }

        // Check for pending documents
        if (attachedDocumentsByStatus.PENDING.length > 0) {
          await updateStatusIfChanged(statusId, 5, {
            user: effectiveUser,
            roleId,
            userRoleStatusUniqueId,
            userRoleId,
            userRoleStatusDescription,
            phoneNumber,
          });

          return await buildResponse(5, {
            roleId,
            phoneNumber,
            reason: "Documents pending review",
            attachedDocumentsByStatus,
            unAttachedDocumentTypes: [],
            requiredDocuments,
          });
        }

        // ========== ALL CHECKS PASSED: STATUS 1 ==========
        await updateStatusIfChanged(statusId, 1, {
          user: effectiveUser,
          roleId,
          userRoleStatusUniqueId,
          userRoleId,
          userRoleStatusDescription,
          phoneNumber,
        });

        return await buildResponse(1, {
          roleId,
          phoneNumber,
          reason: "All requirements satisfied",
          vehicle: userVehicle?.[0] || null,
          attachedDocumentsByStatus,
          unAttachedDocumentTypes: [],
          requiredDocuments,
        });
      } catch (e) {
        console.error("@document check error", e);
        // If document check fails, use the findStatusByVehicleAndDocuments fallback
        return handleWithFallbackChecks(statusId, {
          effectiveUser,
          roleId,
          userRoleStatusUniqueId,
          userRoleId,
          userRoleStatusDescription,
          phoneNumber,
          ownerUserUniqueId,
          requiresVehicle,
          userVehicle,
        });
      }
    } else {
      // If document checks are disabled, just check vehicle
      if (requiresVehicle && !vehicleRegistered) {
        await updateStatusIfChanged(statusId, 2, {
          user: effectiveUser,
          roleId,
          userRoleStatusUniqueId,
          userRoleId,
          userRoleStatusDescription,
          phoneNumber,
        });

        return await buildResponse(2, {
          roleId,
          phoneNumber,
          reason: "No vehicle registered",
          vehicle: null,
          vehicleRegistered: false,
        });
      }

      // If no vehicle required or vehicle is registered
      await updateStatusIfChanged(statusId, 1, {
        user: effectiveUser,
        roleId,
        userRoleStatusUniqueId,
        userRoleId,
        userRoleStatusDescription,
        phoneNumber,
      });

      return await buildResponse(1, {
        roleId,
        phoneNumber,
        reason: "Active",
        vehicle: userVehicle?.[0] || null,
      });
    }
  } catch (error) {
    console.log("@Account.service.accountStatus error", error);
    return {
      message: "error",
      data: "An error occurred during account status evaluation",
    };
  }
};

// ========== HELPER FUNCTIONS ==========

async function updateStatusIfChanged(
  oldStatusId,
  newStatusId,
  userRoleStatusData
) {
  if (oldStatusId !== newStatusId) {
    const { updateUserRoleStatus } = require("./UserRoleStatus.service");
    await updateUserRoleStatus({
      ...userRoleStatusData,
      newStatusId,
    });
  }
}

async function buildResponse(statusId, additionalData = {}) {
  const statusMessages = {
    1: "Active - All requirements satisfied",
    2: "Inactive - No vehicle registered",
    3: "Inactive - Required documents missing",
    4: "Inactive - Documents rejected",
    5: "Inactive - Documents pending review",
    6: "Inactive - User is banned",
    7: "Inactive - No active subscription",
  };

  return {
    message: "success",
    messageType: "accountStatus",
    status: statusId,
    statusMessage: statusMessages[statusId] || "Unknown status",
    ...additionalData,
  };
}

async function handleFreeGiftForDriver(driverUniqueId) {
  try {
    // Get pricing plans
    const pricingPlanResult = await getPricingWithFilters({});
    if (pricingPlanResult.message !== "success") {
      return { hasFreeGift: false };
    }

    const pricingPlanData = pricingPlanResult?.data;
    const freePlan = pricingPlanData?.find((data) => data.isFree == true);

    if (!freePlan) {
      return { hasFreeGift: false };
    }

    // Check if driver already has this free gift
    const freeGift = await getFreeGiftToDriversWithFilters({
      driverUniqueId,
      subscriptionPlanUniqueId: freePlan.subscriptionPlanUniqueId,
    });

    if (freeGift.message === "success" && freeGift?.data?.length > 0) {
      return { hasFreeGift: true, isExisting: true };
    }

    // Create new free gift
    const newGiftData = await createFreeGiftToDriver({
      driverUniqueId,
      subscriptionPlanUniqueId: freePlan.subscriptionPlanUniqueId,
      giftStartDate: currentDate(),
    });

    return {
      hasFreeGift: newGiftData.message === "success" && newGiftData?.data,
      isNew: true,
    };
  } catch (e) {
    console.error("@free gift handling error", e);
    return { hasFreeGift: false };
  }
}

async function handleWithFallbackChecks(oldStatusId, params) {
  const {
    effectiveUser,
    roleId,
    userRoleStatusUniqueId,
    userRoleId,
    userRoleStatusDescription,
    phoneNumber,
    ownerUserUniqueId,
    requiresVehicle,
    userVehicle,
  } = params;

  try {
    // Fallback: Use your existing findStatusByVehicleAndDocuments function
    const requiredDocsResult = await getRoleDocumentRequirements({
      roleId,
      page: 1,
      limit: 1000,
      sortBy: "documentTypeId",
      sortOrder: "ASC",
    });
    const requiredDocuments = requiredDocsResult?.data || [];

    const sql = `SELECT DISTINCT AttachedDocuments.*, DocumentTypes.*, RoleDocumentRequirements.*
                 FROM AttachedDocuments
                 JOIN DocumentTypes ON AttachedDocuments.documentTypeId = DocumentTypes.documentTypeId
                 JOIN RoleDocumentRequirements ON RoleDocumentRequirements.documentTypeId = DocumentTypes.documentTypeId
                 WHERE AttachedDocuments.userUniqueId = ?
                   AND RoleDocumentRequirements.roleId = ?`;
    const [attachedDocuments] = await pool.query(sql, [
      ownerUserUniqueId,
      roleId,
    ]);

    const attachedDocumentsByStatus = {
      PENDING: [],
      ACCEPTED: [],
      REJECTED: [],
    };

    attachedDocuments.forEach((doc) => {
      const status = doc.attachedDocumentAcceptance;
      if (attachedDocumentsByStatus[status]) {
        attachedDocumentsByStatus[status].push(doc);
      }
    });

    const unAttachedDocumentTypes = requiredDocuments.filter(
      (requiredDoc) =>
        !attachedDocuments.some(
          (attachedDoc) =>
            attachedDoc.documentTypeId === requiredDoc.documentTypeId
        )
    );

    const vehicleRegistered = requiresVehicle ? userVehicle.length > 0 : true;

    const resultOfStatus = findStatusByVehicleAndDocuments({
      attachedDocuments,
      attachedDocumentsByStatus,
      requiredDocuments,
      vehicleRegistered,
      unAttachedDocumentTypes,
    });

    if (resultOfStatus?.message === "error") {
      throw new Error("Fallback status check failed");
    }

    const finalStatusId = resultOfStatus?.finalStatusId;

    await updateStatusIfChanged(oldStatusId, finalStatusId, {
      user: effectiveUser,
      roleId,
      userRoleStatusUniqueId,
      userRoleId,
      userRoleStatusDescription,
      phoneNumber,
    });

    return await buildResponse(finalStatusId, {
      roleId,
      phoneNumber,
      reason: "Status determined by fallback check",
      vehicle: userVehicle?.[0] || null,
      attachedDocumentsByStatus,
      unAttachedDocumentTypes,
      requiredDocuments,
    });
  } catch (e) {
    console.error("@fallback check error", e);
    return {
      message: "error",
      data: "Could not determine account status",
    };
  }
}

module.exports = {
  accountStatus,
};
