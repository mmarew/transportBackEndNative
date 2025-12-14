// const { getUserByFilterDetailed } = require("./User.service");
// const { getVehicleDrivers } = require("./VehicleDriver.service");
// const {
//   updateUserRoleStatus,
//   getUserRoleStatusCurrent,
// } = require("./UserRoleStatus.service");
// const {
//   getRoleDocumentRequirements,
// } = require("./RoleDocumentRequirements.service");
// const { pool } = require("../Middleware/Database.config");
// const { usersRoles } = require("../Utils/ListOfFixedData");
// const {
//   getDriverSubscriptionsWithFilters,
//   createDriverSubscription,
//   getSubscriptionData,
// } = require("./DriverSubscription.service");

// // Consolidated account status check for a user (documents, vehicle, ban)
// const accountStatus = async ({
//   ownerUserUniqueId,
//   user,
//   body,
//   enableDocumentChecks = true,
// }) => {
//   try {
//     // Resolve effective user context
//     let effectiveUser = user;
//     if (
//       !effectiveUser ||
//       (ownerUserUniqueId && ownerUserUniqueId !== user?.userUniqueId)
//     ) {
//       const filters = { userUniqueId: ownerUserUniqueId };
//       // check if user exists
//       const userData = await getUserByFilterDetailed(filters);
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

//     // ========== STEP 1: CHECK VEHICLE ==========
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

//     if (requiresVehicle && !vehicleRegistered) {
//       // Update status to 2 (No vehicle registered)
//       await updateUserRoleStatus({
//         user: effectiveUser,
//         roleId,
//         userRoleStatusUniqueId,
//         userRoleId,
//         newStatusId: 2,
//         userRoleStatusDescription,
//         phoneNumber,
//       });

//       const latestUserData = await getUserRoleStatusCurrent({
//         data: { roleId, search: phoneNumber },
//       });

//       return {
//         message: "success",
//         messageType: "accountStatus",
//         vehicle: null,
//         userData: latestUserData?.data?.[0] || null,
//         attachedDocumentsByStatus: {},
//         unAttachedDocumentTypes: [],
//         requiredDocuments: [],
//         subscription: {},
//         status: 2,
//         reason: "No vehicle registered for this role",
//       };
//     }

//     // ========== STEP 2: CHECK DOCUMENTS ==========
//     let requiredDocuments = [];
//     let attachedDocuments = [];
//     let unAttachedDocumentTypes = [];
//     let attachedDocumentsByStatus = {
//       PENDING: [],
//       ACCEPTED: [],
//       REJECTED: [],
//     };

//     if (enableDocumentChecks) {
//       // Fetch required documents for role
//       const requiredDocsResult = await getRoleDocumentRequirements({
//         roleId,
//         page: 1,
//         limit: 1000,
//         sortBy: "documentTypeId",
//         sortOrder: "ASC",
//       });
//       requiredDocuments = requiredDocsResult?.data || [];

//       // Fetch attached documents
//       const sql = `SELECT DISTINCT AttachedDocuments.*, DocumentTypes.*, RoleDocumentRequirements.*
//         FROM AttachedDocuments
//         JOIN DocumentTypes
//           ON AttachedDocuments.documentTypeId = DocumentTypes.documentTypeId
//         JOIN RoleDocumentRequirements
//           ON RoleDocumentRequirements.documentTypeId = DocumentTypes.documentTypeId
//         WHERE AttachedDocuments.userUniqueId = ?
//           AND RoleDocumentRequirements.roleId = ?`;
//       const [attachedDocs] = await pool.query(sql, [ownerUserUniqueId, roleId]);
//       attachedDocuments = attachedDocs;

//       // Find unattached required document types
//       unAttachedDocumentTypes = requiredDocuments.filter(
//         (requiredDocument) =>
//           !attachedDocs.some(
//             (attachedDocument) =>
//               attachedDocument.documentTypeId ===
//               requiredDocument.documentTypeId
//           )
//       );

//       // Group attached docs by acceptance status
//       attachedDocs.forEach((doc) => {
//         const acceptanceStatus = doc.attachedDocumentAcceptance;
//         if (attachedDocumentsByStatus[acceptanceStatus]) {
//           attachedDocumentsByStatus[acceptanceStatus].push(doc);
//         }
//       });

//       // Check for rejected documents
//       if (attachedDocumentsByStatus.REJECTED.length > 0) {
//         await updateUserRoleStatus({
//           user: effectiveUser,
//           roleId,
//           userRoleStatusUniqueId,
//           userRoleId,
//           newStatusId: 4,
//           userRoleStatusDescription,
//           phoneNumber,
//         });

//         const latestUserData = await getUserRoleStatusCurrent({
//           data: { roleId, search: phoneNumber },
//         });

//         return {
//           message: "success",
//           messageType: "accountStatus",
//           vehicle: userVehicle?.[0] || null,
//           userData: latestUserData?.data?.[0] || null,
//           attachedDocumentsByStatus,
//           unAttachedDocumentTypes,
//           requiredDocuments,
//           subscription: {},
//           status: 4,
//           reason: "One or more documents have been rejected",
//         };
//       }

//       // Check for missing documents
//       if (unAttachedDocumentTypes.length > 0) {
//         await updateUserRoleStatus({
//           user: effectiveUser,
//           roleId,
//           userRoleStatusUniqueId,
//           userRoleId,
//           newStatusId: 3,
//           userRoleStatusDescription,
//           phoneNumber,
//         });

//         const latestUserData = await getUserRoleStatusCurrent({
//           data: { roleId, search: phoneNumber },
//         });

//         return {
//           message: "success",
//           messageType: "accountStatus",
//           vehicle: userVehicle?.[0] || null,
//           userData: latestUserData?.data?.[0] || null,
//           attachedDocumentsByStatus,
//           unAttachedDocumentTypes,
//           requiredDocuments,
//           subscription: {},
//           status: 3,
//           reason: "Some required documents are not attached",
//         };
//       }

//       // Check for pending documents
//       if (attachedDocumentsByStatus.PENDING.length > 0) {
//         await updateUserRoleStatus({
//           user: effectiveUser,
//           roleId,
//           userRoleStatusUniqueId,
//           userRoleId,
//           newStatusId: 5,
//           userRoleStatusDescription,
//           phoneNumber,
//         });

//         const latestUserData = await getUserRoleStatusCurrent({
//           data: { roleId, search: phoneNumber },
//         });

//         return {
//           message: "success",
//           messageType: "accountStatus",
//           vehicle: userVehicle?.[0] || null,
//           userData: latestUserData?.data?.[0] || null,
//           attachedDocumentsByStatus,
//           unAttachedDocumentTypes: [],
//           requiredDocuments,
//           subscription: {},
//           status: 5,
//           reason: "One or more documents are pending review",
//         };
//       }
//     }

//     // ========== STEP 3: CHECK AND GRANT FREE PLANS ==========
//     let subscriptionInfo = {
//       hasActiveSubscription: false,
//       subscriptionType: null,
//       subscriptionDetails: null,
//     };

//     if (Number(roleId) === usersRoles.driverRoleId) {
//       try {
//         console.log("@Checking driver subscription for:", ownerUserUniqueId);

//         // ===== PART 1: CHECK FOR UNASSIGNED FREE PLANS AND GRANT =====

//         // first check if there is free gift plan but not given to driver
//         const unassignedFreePlans = await getSubscriptionData({
//           dataType: "freePlans",
//           driverUniqueId: ownerUserUniqueId, // optional
//           // planName: "basic",
//           page: 1,
//           // set limit to many if necessary
//           limit: 1,
//         });
//         //give these free plan to driver now
//         const unassignedFreePlansData = unassignedFreePlans?.data;
//         if (unassignedFreePlansData?.length > 0)
//           await Promise.all([
//             unassignedFreePlansData?.map(async (plan) => {
//               const data = await createDriverSubscription({
//                 driverUniqueId: ownerUserUniqueId,
//                 subscriptionPlanUniqueId: plan.subscriptionPlanUniqueId,
//               });
//             }),
//           ]);

//         // ===== PART 2: NOW CHECK FOR ACTIVE SUBSCRIPTIONS =====
//         const activeSubscriptions = await getDriverSubscriptionsWithFilters({
//           driverUniqueId: ownerUserUniqueId,
//           isActive: true, // Only check ACTIVE subscriptions
//           page: 1,
//           limit: 1,
//         });

//         if (activeSubscriptions?.data?.length > 0) {
//           const subscription = activeSubscriptions.data[0];
//           subscriptionInfo = {
//             hasActiveSubscription: true,
//             subscriptionType: subscription.isFree ? "free" : "paid",
//             subscriptionDetails: subscription,
//             wasRecentlyGranted: unassignedFreePlans?.length > 0, // Flag if we just granted
//           };
//         } else {
//           // No active subscription even after granting free plan
//           subscriptionInfo = {
//             hasActiveSubscription: false,
//             subscriptionType: "none",
//             subscriptionDetails: null,
//           };

//           // Update status to 6 (Banned)
//           await updateUserRoleStatus({
//             user: effectiveUser,
//             roleId,
//             userRoleStatusUniqueId,
//             userRoleId,
//             newStatusId: 7,
//             userRoleStatusDescription,
//             phoneNumber,
//           });

//           const latestUserData = await getUserRoleStatusCurrent({
//             data: { roleId, search: phoneNumber },
//           });

//           return {
//             message: "success",
//             messageType: "accountStatus",
//             vehicle: userVehicle?.[0] || null,
//             userData: latestUserData?.data?.[0] || null,
//             attachedDocumentsByStatus,
//             unAttachedDocumentTypes: [],
//             requiredDocuments,
//             subscription: subscriptionInfo,
//             status: 7,
//             reason: "User is banned",
//           };
//         }
//       } catch (e) {
//         console.error("@Subscription check error:", e);
//         subscriptionInfo = {
//           hasActiveSubscription: false,
//           subscriptionType: "error",
//           subscriptionDetails: null,
//           error: "Failed to check subscription status",
//         };
//       }
//     }
//     // ========== STEP 4: CHECK IF BANNED ==========
//     let isBanned = false;
//     try {
//       const { getBannedUsers } = require("./BannedUsers.service");
//       const banCheckData = {
//         check: true,
//         phoneNumber,
//         roleId,
//       };
//       const banCheck = await getBannedUsers(banCheckData);
//       isBanned = banCheck?.data?.isBanned === true;
//       console.log("@accountStatus  isBanned", isBanned);
//     } catch (e) {
//       console.error("@error on checkBan e", e);
//       isBanned = false;
//     }

//     if (isBanned) {
//       // Update status to 6 (Banned)
//       await updateUserRoleStatus({
//         user: effectiveUser,
//         roleId,
//         userRoleStatusUniqueId,
//         userRoleId,
//         newStatusId: 6,
//         userRoleStatusDescription,
//         phoneNumber,
//       });

//       const latestUserData = await getUserRoleStatusCurrent({
//         data: { roleId, search: phoneNumber },
//       });

//       return {
//         message: "success",
//         messageType: "accountStatus",
//         vehicle: userVehicle?.[0] || null,
//         userData: latestUserData?.data?.[0] || null,
//         attachedDocumentsByStatus,
//         unAttachedDocumentTypes: [],
//         requiredDocuments,
//         subscription: subscriptionInfo,
//         status: 6,
//         reason: "User is banned",
//       };
//     }

//     // ========== ALL CHECKS PASSED: STATUS 1 (ACTIVE) ==========
//     // Only update if status changed
//     if (statusId !== 1) {
//       await updateUserRoleStatus({
//         user: effectiveUser,
//         roleId,
//         userRoleStatusUniqueId,
//         userRoleId,
//         newStatusId: 1,
//         userRoleStatusDescription,
//         phoneNumber,
//       });
//     }

//     // Get latest status (whether updated or not)
//     const latestUserData = await getUserRoleStatusCurrent({
//       data: { roleId, search: phoneNumber },
//     });

//     return {
//       message: "success",
//       messageType: "accountStatus",
//       vehicle: userVehicle?.[0] || null,
//       userData: latestUserData?.data?.[0] || null,
//       attachedDocumentsByStatus,
//       unAttachedDocumentTypes: [],
//       requiredDocuments,
//       subscription: subscriptionInfo,
//       status: 1,
//       reason: "All requirements satisfied",
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
    let isBanned = false;
    try {
      // IMPORTANT: Check if BannedUsers.service exports getBannedUsers
      // If not, you may need to check the correct export name or module
      const bannedUsersService = require("./BannedUsers.service");
      const banCheck = await bannedUsersService.getBannedUsers({
        check: true,
        phoneNumber,
        roleId,
      });
      isBanned = banCheck?.data?.isBanned === true;
    } catch (e) {
      console.error("@error on checkBan", e);
      // Continue if ban check fails
    }

    if (isBanned) {
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
      page: 1,
      limit: 1,
    });

    if (activeSubscriptions?.data?.length > 0) {
      const subscription = activeSubscriptions.data[0];
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
