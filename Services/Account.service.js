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

// Consolidated account status check for a user (documents, vehicle, ban)
const accountStatus = async ({
  ownerUserUniqueId,
  user,
  body,
  enableDocumentChecks = true,
}) => {
  try {
    // Resolve effective user context
    let effectiveUser = user;
    if (
      !effectiveUser ||
      (ownerUserUniqueId && ownerUserUniqueId !== user?.userUniqueId)
    ) {
      const filters = { userUniqueId: ownerUserUniqueId };
      // check if user exists
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

    // 1) Fetch current user role status
    let userRoleStatus = await getUserRoleStatusCurrent({
      data: { roleId, search: phoneNumber },
    });
    console.log("@accountStatus accountStatus =======> ", userRoleStatus);
    if (!userRoleStatus || userRoleStatus?.data?.length === 0) {
      return { message: "error", data: "User data not found" };
    }
    const { userRoleStatusUniqueId, userRoleId, statusId } =
      userRoleStatus?.data?.[0];

    // Initialize subscription info
    let subscriptionInfo = {
      hasActiveSubscription: false,
      subscriptionType: null,
      subscriptionDetails: null,
      freeGiftUsed: false,
      freeGiftDetails: null,
    };

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
      console.log("@accountStatus  isBanned", isBanned);
    } catch (e) {
      console.error("@error on checkBan e", e);
      isBanned = false;
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

      // Get updated status after change
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
        subscription: subscriptionInfo,
        status: 6,
        reason: "User is banned",
      };
    }

    // ========== PRIORITY 2: CHECK SUBSCRIPTION (DRIVERS ONLY) ==========
    if (Number(roleId) === usersRoles.driverRoleId) {
      let hasActiveSubscription = false;
      let subscriptionType = null;
      let subscriptionDetails = null;
      let freeGiftUsed = false;
      let freeGiftDetails = null;

      try {
        console.log(
          "@usersRoles.driverRoleId",
          usersRoles.driverRoleId,
          "@roleId",
          roleId
        );

        // First check for active paid subscriptions
        const paidSubscriptions = await getDriverSubscriptionsWithFilters({
          driverUniqueId: ownerUserUniqueId,
          isActive: true,
        });
        console.log("@accountStatus paid subscriptions", paidSubscriptions);

        hasActiveSubscription = (paidSubscriptions?.data?.length || 0) > 0;

        if (hasActiveSubscription) {
          subscriptionType = "paid";
          subscriptionDetails = paidSubscriptions?.data?.[0] || null;
          subscriptionInfo = {
            hasActiveSubscription: true,
            subscriptionType,
            subscriptionDetails,
            freeGiftUsed: false,
            freeGiftDetails: null,
          };
        } else {
          // If no paid subscription, try to give free gift
          const pricingPlanResult = await getPricingWithFilters({});
          const message = pricingPlanResult?.message;
          if (message == "success") {
            const pricingPlanData = pricingPlanResult?.data;
            console.log("@pricingPlanData", pricingPlanData);

            // Find free plan
            const freePlan = pricingPlanData?.find(
              (data) => data.isFree == true
            );
            console.log("@freePlan", freePlan);

            if (freePlan) {
              const driverUniqueId = ownerUserUniqueId;
              const subscriptionPlanUniqueId =
                freePlan?.subscriptionPlanUniqueId;

              // Check if this free plan is already given to driver
              const freeGift = await getFreeGiftToDriversWithFilters({
                driverUniqueId,
                subscriptionPlanUniqueId,
              });
              console.log("@freeGift", freeGift);

              if (freeGift.message == "success") {
                const data = freeGift?.data;

                // If there is no data, create this free gift
                if (!data?.length) {
                  const giftStartDate = currentDate();
                  const newGiftData = await createFreeGiftToDriver({
                    driverUniqueId,
                    subscriptionPlanUniqueId,
                    giftStartDate,
                  });
                  console.log("@newGiftData", newGiftData);

                  if (newGiftData.message == "success" && newGiftData?.data) {
                    hasActiveSubscription = true;
                    freeGiftUsed = true;
                    freeGiftDetails = newGiftData.data;
                    subscriptionType = "free_gift";

                    subscriptionInfo = {
                      hasActiveSubscription: true,
                      subscriptionType,
                      subscriptionDetails: freeGiftDetails,
                      freeGiftUsed: true,
                      freeGiftDetails,
                    };
                  }
                } else {
                  // Already has free gift
                  hasActiveSubscription = true;
                  freeGiftUsed = true;
                  freeGiftDetails = data[0];
                  subscriptionType = "free_gift";

                  subscriptionInfo = {
                    hasActiveSubscription: true,
                    subscriptionType,
                    subscriptionDetails: freeGiftDetails,
                    freeGiftUsed: true,
                    freeGiftDetails,
                  };
                }
              }
            }
          }

          // If still no active subscription after free gift check
          if (!hasActiveSubscription) {
            subscriptionInfo = {
              hasActiveSubscription: false,
              subscriptionType: "none",
              subscriptionDetails: null,
              freeGiftUsed: false,
              freeGiftDetails: null,
            };

            // Update status to 7 (No subscription)
            await updateUserRoleStatus({
              user: effectiveUser,
              roleId,
              userRoleStatusUniqueId,
              userRoleId,
              newStatusId: 7,
              userRoleStatusDescription,
              phoneNumber,
            });

            // Get updated status after change
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
              subscription: subscriptionInfo,
              status: 7,
              reason: "Driver doesn't have an active subscription",
            };
          }
        }
      } catch (e) {
        console.error("@checkActiveSubscriptions error e is", e);
        // Set subscription info as error
        subscriptionInfo = {
          hasActiveSubscription: false,
          subscriptionType: "error",
          subscriptionDetails: null,
          freeGiftUsed: false,
          freeGiftDetails: null,
          error: "Failed to check subscription status",
        };
        // Continue with other checks even if subscription check fails
      }
    }

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

    // ========== PRIORITY 3: CHECK VEHICLE ==========
    if (requiresVehicle && !vehicleRegistered) {
      // Update status to 2 (No vehicle registered)
      await updateUserRoleStatus({
        user: effectiveUser,
        roleId,
        userRoleStatusUniqueId,
        userRoleId,
        newStatusId: 2,
        userRoleStatusDescription,
        phoneNumber,
      });

      // Get updated status after change
      const latestUserData = await getUserRoleStatusCurrent({
        data: { roleId, search: phoneNumber },
      });

      return {
        message: "success",
        messageType: "accountStatus",
        vehicle: null,
        userData: latestUserData?.data?.[0] || null,
        attachedDocumentsByStatus,
        unAttachedDocumentTypes,
        requiredDocuments,
        subscription: subscriptionInfo,
        status: 2,
        reason: "No vehicle registered for this role",
      };
    }

    // ========== PRIORITY 4: CHECK DOCUMENTS ==========
    if (enableDocumentChecks) {
      // Check for rejected documents first (highest priority in document checks)
      if (attachedDocumentsByStatus.REJECTED.length > 0) {
        // Update status to 4 (Documents rejected)
        await updateUserRoleStatus({
          user: effectiveUser,
          roleId,
          userRoleStatusUniqueId,
          userRoleId,
          newStatusId: 4,
          userRoleStatusDescription,
          phoneNumber,
        });

        // Get updated status after change
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
          subscription: subscriptionInfo,
          status: 4,
          reason: "One or more documents have been rejected",
        };
      }

      // Check for missing documents
      if (unAttachedDocumentTypes.length > 0) {
        // Update status to 3 (Required documents missing)
        await updateUserRoleStatus({
          user: effectiveUser,
          roleId,
          userRoleStatusUniqueId,
          userRoleId,
          newStatusId: 3,
          userRoleStatusDescription,
          phoneNumber,
        });

        // Get updated status after change
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
          subscription: subscriptionInfo,
          status: 3,
          reason: "Some required documents are not attached",
        };
      }

      // Check for pending documents
      if (attachedDocumentsByStatus.PENDING.length > 0) {
        // Update status to 5 (Documents pending)
        await updateUserRoleStatus({
          user: effectiveUser,
          roleId,
          userRoleStatusUniqueId,
          userRoleId,
          newStatusId: 5,
          userRoleStatusDescription,
          phoneNumber,
        });

        // Get updated status after change
        const latestUserData = await getUserRoleStatusCurrent({
          data: { roleId, search: phoneNumber },
        });

        return {
          message: "success",
          messageType: "accountStatus",
          vehicle: userVehicle?.[0] || null,
          userData: latestUserData?.data?.[0] || null,
          attachedDocumentsByStatus,
          unAttachedDocumentTypes: [],
          requiredDocuments,
          subscription: subscriptionInfo,
          status: 5,
          reason: "One or more documents are pending review",
        };
      }
    }

    // ========== ALL CHECKS PASSED: STATUS 1 (ACTIVE) ==========
    // Only update if status changed
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

    // Get latest status (whether updated or not)
    const latestUserData = await getUserRoleStatusCurrent({
      data: { roleId, search: phoneNumber },
    });

    return {
      message: "success",
      messageType: "accountStatus",
      vehicle: userVehicle?.[0] || null,
      userData: latestUserData?.data?.[0] || null,
      attachedDocumentsByStatus,
      unAttachedDocumentTypes: [],
      requiredDocuments,
      subscription: subscriptionInfo,
      status: 1,
      reason: "All requirements satisfied",
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
