// const { getUserByFilterDetailed } = require("./User.service");
// const { getVehicleDrivers } = require("./VehicleDriver.service");
// const {
//   updateUserRoleStatus,
//   getUserRoleStatusCurrent,
// } = require("./UserRoleStatus.service");
// const {
//   getRoleDocumentRequirements,
// } = require("./RoleDocumentRequirements.service");
// const {
//   findStatusByVehicleAndDocuments,
// } = require("../Utils/StatusOfUsersByVehiclesAndDocs");
// const { pool } = require("../Middleware/Database.config");
// const { usersRoles } = require("../Utils/ListOfFixedData");
// const {
//   getDriverSubscriptionsWithFilters,
//   getSubscriptionData,
//   createDriverSubscription,
// } = require("./DriverSubscription.service");
// const { getPricingWithFilters } = require("./SubscriptionPlanPricing.service");
// const {
//   getFreeGiftToDriversWithFilters,
//   createFreeGiftToDriver,
// } = require("./FreeGiftToDriver.service");
// const { currentDate } = require("../Utils/CurrentDate");

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

//     // ========== STEP 3: CHECK SUBSCRIPTION (DRIVERS ONLY) ==========
//     let subscriptionInfo = {
//       hasActiveSubscription: false,
//       subscriptionType: null,
//       subscriptionDetails: null,
//       freeGiftUsed: false,
//       freeGiftDetails: null,
//     };

//     if (Number(roleId) === usersRoles.driverRoleId) {
//       let hasActiveSubscription = false;
//       let subscriptionType = null;
//       let subscriptionDetails = null;
//       let freeGiftUsed = false;
//       let freeGiftDetails = null;

//       try {
//         console.log(
//           "@usersRoles.driverRoleId",
//           usersRoles.driverRoleId,
//           "@roleId",
//           roleId
//         );
//         // first check if there is free gift plan but not given to driver
//         const unassignedFreePlans = await getSubscriptionData({
//           dataType: "freePlans",
//           driverUniqueId: ownerUserUniqueId, // optional
//           // planName: "basic",
//           page: 1,
//           limit: 10,
//         });
//         console.log("@unassignedFreePlans", unassignedFreePlans);
//         //give these free plan to driver now
//         unassignedFreePlans?.data?.map(async (plan) => {
//           console.log("plan", plan);
//           const data = await createDriverSubscription({
//             driverUniqueId: ownerUserUniqueId,
//             subscriptionPlanUniqueId: plan.subscriptionPlanUniqueId,
//           });
//           console.log("newlyCreatedData data", data);
//         });

//         const paidSubscriptions = await getDriverSubscriptionsWithFilters({
//           driverUniqueId: ownerUserUniqueId,
//           isActive: true,
//         });
//         console.log("@accountStatus paid subscriptions", paidSubscriptions);

//         hasActiveSubscription = (paidSubscriptions?.data?.length || 0) > 0;

//         if (hasActiveSubscription) {
//           subscriptionType = "paid";
//           subscriptionDetails = paidSubscriptions?.data?.[0] || null;
//           subscriptionInfo = {
//             hasActiveSubscription: true,
//             subscriptionType,
//             subscriptionDetails,
//             freeGiftUsed: false,
//             freeGiftDetails: null,
//           };
//         } else {
//           // If no paid subscription, try to give free gift
//           const pricingPlanResult = await getPricingWithFilters({});
//           const message = pricingPlanResult?.message;
//           if (message == "success") {
//             const pricingPlanData = pricingPlanResult?.data;
//             console.log("@pricingPlanData", pricingPlanData);

//             // Find free plan
//             const freePlan = pricingPlanData?.find(
//               (data) => data.isFree == true
//             );
//             console.log("@freePlan", freePlan);

//             if (freePlan) {
//               const driverUniqueId = ownerUserUniqueId;
//               const subscriptionPlanUniqueId =
//                 freePlan?.subscriptionPlanUniqueId;

//               // Check if this free plan is already given to driver
//               const freeGift = await getFreeGiftToDriversWithFilters({
//                 driverUniqueId,
//                 subscriptionPlanUniqueId,
//               });
//               console.log("@freeGift", freeGift);

//               if (freeGift.message == "success") {
//                 const data = freeGift?.data;

//                 // If there is no data, create this free gift
//                 if (!data?.length) {
//                   const giftStartDate = currentDate();
//                   const newGiftData = await createFreeGiftToDriver({
//                     driverUniqueId,
//                     subscriptionPlanUniqueId,
//                     giftStartDate,
//                   });
//                   console.log("@newGiftData", newGiftData);

//                   if (newGiftData.message == "success" && newGiftData?.data) {
//                     hasActiveSubscription = true;
//                     freeGiftUsed = true;
//                     freeGiftDetails = newGiftData.data;
//                     subscriptionType = "free_gift";

//                     subscriptionInfo = {
//                       hasActiveSubscription: true,
//                       subscriptionType,
//                       subscriptionDetails: freeGiftDetails,
//                       freeGiftUsed: true,
//                       freeGiftDetails,
//                     };
//                   }
//                 } else {
//                   // Already has free gift
//                   hasActiveSubscription = true;
//                   freeGiftUsed = true;
//                   freeGiftDetails = data[0];
//                   subscriptionType = "free_gift";

//                   subscriptionInfo = {
//                     hasActiveSubscription: true,
//                     subscriptionType,
//                     subscriptionDetails: freeGiftDetails,
//                     freeGiftUsed: true,
//                     freeGiftDetails,
//                   };
//                 }
//               }
//             }
//           }

//           // If still no active subscription after free gift check
//           if (!hasActiveSubscription) {
//             subscriptionInfo = {
//               hasActiveSubscription: false,
//               subscriptionType: "none",
//               subscriptionDetails: null,
//               freeGiftUsed: false,
//               freeGiftDetails: null,
//             };

//             // Update status to 7 (No subscription)
//             await updateUserRoleStatus({
//               user: effectiveUser,
//               roleId,
//               userRoleStatusUniqueId,
//               userRoleId,
//               newStatusId: 7,
//               userRoleStatusDescription,
//               phoneNumber,
//             });

//             const latestUserData = await getUserRoleStatusCurrent({
//               data: { roleId, search: phoneNumber },
//             });

//             return {
//               message: "success",
//               messageType: "accountStatus",
//               vehicle: userVehicle?.[0] || null,
//               userData: latestUserData?.data?.[0] || null,
//               attachedDocumentsByStatus,
//               unAttachedDocumentTypes: [],
//               requiredDocuments,
//               subscription: subscriptionInfo,
//               status: 7,
//               reason: "Driver doesn't have an active subscription",
//             };
//           }
//         }
//       } catch (e) {
//         console.error("@checkActiveSubscriptions error e is", e);
//         subscriptionInfo = {
//           hasActiveSubscription: false,
//           subscriptionType: "error",
//           subscriptionDetails: null,
//           freeGiftUsed: false,
//           freeGiftDetails: null,
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
const { getPricingWithFilters } = require("./SubscriptionPlanPricing.service");

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

    // ========== STEP 1: CHECK VEHICLE ==========
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
    }

    // ========== STEP 2: CHECK DOCUMENTS ==========
    let requiredDocuments = [];
    let attachedDocuments = [];
    let unAttachedDocumentTypes = [];
    let attachedDocumentsByStatus = {
      PENDING: [],
      ACCEPTED: [],
      REJECTED: [],
    };

    if (enableDocumentChecks) {
      // Fetch required documents for role
      const requiredDocsResult = await getRoleDocumentRequirements({
        roleId,
        page: 1,
        limit: 1000,
        sortBy: "documentTypeId",
        sortOrder: "ASC",
      });
      requiredDocuments = requiredDocsResult?.data || [];

      // Fetch attached documents
      const sql = `SELECT DISTINCT AttachedDocuments.*, DocumentTypes.*, RoleDocumentRequirements.*
        FROM AttachedDocuments
        JOIN DocumentTypes
          ON AttachedDocuments.documentTypeId = DocumentTypes.documentTypeId
        JOIN RoleDocumentRequirements
          ON RoleDocumentRequirements.documentTypeId = DocumentTypes.documentTypeId
        WHERE AttachedDocuments.userUniqueId = ?
          AND RoleDocumentRequirements.roleId = ?`;
      const [attachedDocs] = await pool.query(sql, [ownerUserUniqueId, roleId]);
      attachedDocuments = attachedDocs;

      // Find unattached required document types
      unAttachedDocumentTypes = requiredDocuments.filter(
        (requiredDocument) =>
          !attachedDocs.some(
            (attachedDocument) =>
              attachedDocument.documentTypeId ===
              requiredDocument.documentTypeId
          )
      );

      // Group attached docs by acceptance status
      attachedDocs.forEach((doc) => {
        const acceptanceStatus = doc.attachedDocumentAcceptance;
        if (attachedDocumentsByStatus[acceptanceStatus]) {
          attachedDocumentsByStatus[acceptanceStatus].push(doc);
        }
      });

      // Check for rejected documents
      if (attachedDocumentsByStatus.REJECTED.length > 0) {
        await updateUserRoleStatus({
          user: effectiveUser,
          roleId,
          userRoleStatusUniqueId,
          userRoleId,
          newStatusId: 4,
          userRoleStatusDescription,
          phoneNumber,
        });

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
          subscription: {},
          status: 4,
          reason: "One or more documents have been rejected",
        };
      }

      // Check for missing documents
      if (unAttachedDocumentTypes.length > 0) {
        await updateUserRoleStatus({
          user: effectiveUser,
          roleId,
          userRoleStatusUniqueId,
          userRoleId,
          newStatusId: 3,
          userRoleStatusDescription,
          phoneNumber,
        });

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
          subscription: {},
          status: 3,
          reason: "Some required documents are not attached",
        };
      }

      // Check for pending documents
      if (attachedDocumentsByStatus.PENDING.length > 0) {
        await updateUserRoleStatus({
          user: effectiveUser,
          roleId,
          userRoleStatusUniqueId,
          userRoleId,
          newStatusId: 5,
          userRoleStatusDescription,
          phoneNumber,
        });

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
          subscription: {},
          status: 5,
          reason: "One or more documents are pending review",
        };
      }
    }

    // ========== STEP 3: CHECK SUBSCRIPTION (DRIVERS ONLY) ==========
    // let subscriptionInfo = {
    //   hasActiveSubscription: false,
    //   subscriptionType: null,
    //   subscriptionDetails: null,
    // };

    // if (Number(roleId) === usersRoles.driverRoleId) {
    //   let hasActiveSubscription = false;
    //   let subscriptionType = null;
    //   let subscriptionDetails = null;

    //   try {
    //     console.log(
    //       "@usersRoles.driverRoleId",
    //       usersRoles.driverRoleId,
    //       "@roleId",
    //       roleId
    //     );

    //     // Check for active subscriptions (both free and paid)
    //     const subscriptions = await getDriverSubscriptionsWithFilters({
    //       driverUniqueId: ownerUserUniqueId,
    //       isActive: true,
    //     });
    //     console.log("@accountStatus subscriptions", subscriptions);

    //     hasActiveSubscription = (subscriptions?.data?.length || 0) > 0;

    //     if (hasActiveSubscription) {
    //       const subscription = subscriptions?.data?.[0];
    //       // Determine subscription type based on plan's isFree flag
    //       subscriptionType = subscription?.isFree ? "free" : "paid";
    //       subscriptionDetails = subscription;

    //       subscriptionInfo = {
    //         hasActiveSubscription: true,
    //         subscriptionType,
    //         subscriptionDetails,
    //       };
    //     } else {
    //       // If no active subscription, check for free plans to assign
    //       const pricingPlanResult = await getPricingWithFilters({});
    //       const message = pricingPlanResult?.message;

    //       if (message == "success") {
    //         const pricingPlanData = pricingPlanResult?.data;
    //         console.log("@pricingPlanData", pricingPlanData);

    //         // Find free plan
    //         const freePlan = pricingPlanData?.find(
    //           (data) => data.isFree == true
    //         );
    //         console.log("@freePlan", freePlan);

    //         if (freePlan) {
    //           const driverUniqueId = ownerUserUniqueId;
    //           const subscriptionPlanUniqueId =
    //             freePlan?.subscriptionPlanUniqueId;

    //           // Check if driver already has this free plan (active or expired)
    //           const existingSubscriptions =
    //             await getDriverSubscriptionsWithFilters({
    //               driverUniqueId,
    //               subscriptionPlanUniqueId,
    //             });

    //           if (
    //             existingSubscriptions.message == "success" &&
    //             existingSubscriptions?.data?.length === 0
    //           ) {
    //             // Create new free subscription for driver
    //             const newSubscription = await createDriverSubscription({
    //               driverUniqueId,
    //               subscriptionPlanUniqueId,
    //             });
    //             console.log("@newSubscription", newSubscription);

    //             if (
    //               newSubscription.message == "success" &&
    //               newSubscription?.data
    //             ) {
    //               hasActiveSubscription = true;
    //               subscriptionType = "free";
    //               subscriptionDetails = newSubscription.data;

    //               subscriptionInfo = {
    //                 hasActiveSubscription: true,
    //                 subscriptionType,
    //                 subscriptionDetails,
    //               };
    //             }
    //           } else if (existingSubscriptions?.data?.length > 0) {
    //             // Already has this free plan
    //             // Check if any subscription is currently active
    //             const activeSubscription = existingSubscriptions.data.find(
    //               (sub) => {
    //                 const now = new Date();
    //                 const startDate = new Date(sub.startDate);
    //                 const endDate = new Date(sub.endDate);
    //                 return now >= startDate && now <= endDate;
    //               }
    //             );

    //             if (activeSubscription) {
    //               hasActiveSubscription = true;
    //               subscriptionType = "free";
    //               subscriptionDetails = activeSubscription;
    //             }
    //           }
    //         }
    //       }

    //       // If still no active subscription
    //       if (!hasActiveSubscription) {
    //         subscriptionInfo = {
    //           hasActiveSubscription: false,
    //           subscriptionType: "none",
    //           subscriptionDetails: null,
    //         };

    //         // Update status to 7 (No subscription)
    //         await updateUserRoleStatus({
    //           user: effectiveUser,
    //           roleId,
    //           userRoleStatusUniqueId,
    //           userRoleId,
    //           newStatusId: 7,
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
    //           subscription: subscriptionInfo,
    //           status: 7,
    //           reason: "Driver doesn't have an active subscription",
    //         };
    //       }
    //     }
    //   } catch (e) {
    //     console.error("@checkActiveSubscriptions error e is", e);
    //     subscriptionInfo = {
    //       hasActiveSubscription: false,
    //       subscriptionType: "error",
    //       subscriptionDetails: null,
    //       error: "Failed to check subscription status",
    //     };
    //   }
    // }
    // ========== STEP 3: CHECK AND GRANT FREE PLANS ==========
    let subscriptionInfo = {
      hasActiveSubscription: false,
      subscriptionType: null,
      subscriptionDetails: null,
    };

    if (Number(roleId) === usersRoles.driverRoleId) {
      try {
        console.log("@Checking driver subscription for:", ownerUserUniqueId);

        // ===== PART 1: CHECK FOR UNASSIGNED FREE PLANS AND GRANT =====
        // const unassignedFreePlans = await getUnassignedFreePlansForDriver({
        //   driverUniqueId: ownerUserUniqueId,
        //   limit: 1, // Get only one free plan at a time
        // });

        // first check if there is free gift plan but not given to driver
        const unassignedFreePlans = await getSubscriptionData({
          dataType: "freePlans",
          driverUniqueId: ownerUserUniqueId, // optional
          // planName: "basic",
          page: 1,
          // set limit to many if necessary
          limit: 1,
        });
        console.log("@unassignedFreePlans", unassignedFreePlans);
        //give these free plan to driver now
        const unassignedFreePlansData = unassignedFreePlans?.data;
        if (unassignedFreePlansData?.length > 0)
          await Promise.all([
            unassignedFreePlansData?.map(async (plan) => {
              console.log("plan", plan);
              const data = await createDriverSubscription({
                driverUniqueId: ownerUserUniqueId,
                subscriptionPlanUniqueId: plan.subscriptionPlanUniqueId,
              });
              console.log("newlyCreatedData data", data);
            }),
          ]);
        // return { unassignedFreePlans };

        console.log("@unassignedFreePlans found:", unassignedFreePlans?.length);

        // ===== PART 2: NOW CHECK FOR ACTIVE SUBSCRIPTIONS =====
        const activeSubscriptions = await getDriverSubscriptionsWithFilters({
          driverUniqueId: ownerUserUniqueId,
          isActive: true, // Only check ACTIVE subscriptions
          page: 1,
          limit: 1,
        });

        console.log(
          "@Active subscriptions after grant:",
          activeSubscriptions?.data?.length
        );

        if (activeSubscriptions?.data?.length > 0) {
          const subscription = activeSubscriptions.data[0];
          subscriptionInfo = {
            hasActiveSubscription: true,
            subscriptionType: subscription.isFree ? "free" : "paid",
            subscriptionDetails: subscription,
            wasRecentlyGranted: unassignedFreePlans?.length > 0, // Flag if we just granted
          };
        } else {
          // No active subscription even after granting free plan
          subscriptionInfo = {
            hasActiveSubscription: false,
            subscriptionType: "none",
            subscriptionDetails: null,
          };
        }
      } catch (e) {
        console.error("@Subscription check error:", e);
        subscriptionInfo = {
          hasActiveSubscription: false,
          subscriptionType: "error",
          subscriptionDetails: null,
          error: "Failed to check subscription status",
        };
      }
    }
    // ========== STEP 4: CHECK IF BANNED ==========
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
        status: 6,
        reason: "User is banned",
      };
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
