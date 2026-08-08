const { USER_STATUS } = require("./ListOfSeedData");
const findStatusByVehicleAndDocuments = (data) => {
  const {
    vehicleRegistered,
    attachedDocumentsByStatus,
    requiredDocuments,
    unAttachedDocumentTypes,
    // new flags
    isBanned = false,
    hasActiveSubscription = true,
  } = data;

  // Validate essential input
  if (typeof vehicleRegistered !== "boolean") {
    const AppError = require("./AppError");
    throw new AppError("Invalid input: vehicleRegistered.", AppError.BAD_REQUEST);
  }
  //
  const requiredCount = requiredDocuments?.length || 0;

  // Fix: Count unique document types that have at least one ACCEPTED document
  // (Left commented as they aren't directly used below)
  // const acceptedDocTypes = new Set(
  //   attachedDocumentsByStatus?.ACCEPTED?.map((doc) => doc.documentTypeId) || [],
  // );
  // const acc = acceptedDocTypes.size;

  const pend = attachedDocumentsByStatus?.PENDING?.length || 0;
  const rej = attachedDocumentsByStatus?.REJECTED?.length || 0;
  const missingRequired = (unAttachedDocumentTypes?.length || 0) > 0;

  // Global priority overrides
  // 6) banned: kept for administrative actions - overrides everything
  if (isBanned === true) {
    return {
      message: "success",
      finalStatusId: USER_STATUS.INACTIVE_USER_IS_BANNED_BY_ADMIN,
    };
  }

  // If no required documents are defined, status relies on vehicle only
  if (requiredCount === 0) {
    return {
      message: "success",
      // 2) no vehicle overrides when no docs logic exists
      finalStatusId: vehicleRegistered
        ? hasActiveSubscription
          ? USER_STATUS.ACTIVE // active
          : USER_STATUS.INACTIVE_DRIVER_DOESN_T_HAVE_A_SUBSCRIPTION // no subscription
        : USER_STATUS.INACTIVE_VEHICLE_NOT_REGISTERED, // no vehicle
    };
  }

  // Priority order per requirements:

  // 2) no vehicle: regardless of documents
  if (!vehicleRegistered) {
    return {
      message: "success",
      finalStatusId: USER_STATUS.INACTIVE_VEHICLE_NOT_REGISTERED,
    };
  }

  // 7) no subscription: driver doesn't have a subscription
  if (hasActiveSubscription === false) {
    return {
      message: "success",
      finalStatusId: USER_STATUS.INACTIVE_DRIVER_DOESN_T_HAVE_A_SUBSCRIPTION,
    };
  }

  // 4) rejected: any rejected document exists
  if (rej > 0) {
    return {
      message: "success",
      finalStatusId: USER_STATUS.INACTIVE_DOCUMENTS_REJECTED,
    };
  }

  // 3) not attached doc: some required docs are missing
  if (missingRequired) {
    return {
      message: "success",
      finalStatusId: USER_STATUS.INACTIVE_REQUIRED_DOCUMENTS_MISSING,
    };
  }

  // 5) pending: any pending and none rejected
  if (pend > 0) {
    return {
      message: "success",
      finalStatusId: USER_STATUS.INACTIVE_DOCUMENTS_PENDING,
    };
  }
  // 1) active: vehicle registered AND all required docs are attached and none missing.
  // NOTE: We use !missingRequired (unAttachedDocumentTypes.length === 0) instead of
  // acc >= requiredCount because the same documentTypeId can appear in BOTH driver
  // and vehicle requirement lists (e.g. Vehicle Registration librea is required for
  // both roleId=2 and roleId=9). This causes requiredCount to be inflated while acc
  // (a Set of unique documentTypeIds) correctly deduplicates — making acc >= requiredCount
  // always false even when all documents are fully accepted.
  if (vehicleRegistered && !missingRequired) {
    return {
      message: "success",
      finalStatusId: hasActiveSubscription
        ? USER_STATUS.ACTIVE
        : USER_STATUS.INACTIVE_DRIVER_DOESN_T_HAVE_A_SUBSCRIPTION,
    };
  }

  // Fallback: all priority branches exhausted.
  // This can happen when a driver has attached documents but their
  // acceptanceStatus is null or an unexpected value (not PENDING/ACCEPTED/REJECTED).
  // Treat it as PENDING so the driver is not blocked from logging in.
  const attached = [
    ...(attachedDocumentsByStatus?.PENDING || []),
    ...(attachedDocumentsByStatus?.ACCEPTED || []),
    ...(attachedDocumentsByStatus?.REJECTED || []),
  ];
  if (vehicleRegistered && attached.length > 0) {
    return {
      message: "success",
      finalStatusId: USER_STATUS.INACTIVE_DOCUMENTS_PENDING,
    };
  }

  // Last resort — truly unresolvable state, surface it for debugging
  const AppError = require("./AppError");
  throw new AppError(
    "Unable to determine driver's status with provided data.",
    400,
  );
};
module.exports = { findStatusByVehicleAndDocuments };
