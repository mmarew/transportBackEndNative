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
  console.log("@findStatusByVehicleAndDocuments data", data);
  // Validate essential input
  if (typeof vehicleRegistered !== "boolean") {
    return { message: "error", data: "Invalid input: vehicleRegistered." };
  }
  //
  const requiredCount = requiredDocuments?.length || 0;
  const acc = attachedDocumentsByStatus?.ACCEPTED?.length || 0;
  const pend = attachedDocumentsByStatus?.PENDING?.length || 0;
  const rej = attachedDocumentsByStatus?.REJECTED?.length || 0;
  const missingRequired = (unAttachedDocumentTypes?.length || 0) > 0;
  console.log("@requiredCount", requiredCount);
  console.log("@acc", acc);
  // Global priority overrides
  // 6) banned: kept for administrative actions - overrides everything
  if (isBanned === true) {
    return { message: "success", finalStatusId: 6 };
  }

  // If no required documents are defined, status relies on vehicle only
  if (requiredCount === 0) {
    return {
      message: "success",
      // 2) no vehicle overrides when no docs logic exists
      finalStatusId: vehicleRegistered
        ? hasActiveSubscription
          ? 1 // active
          : 7 // no subscription
        : 2, // no vehicle
    };
  }

  // Priority order per requirements:
  // 1) active: vehicle registered AND all required docs accepted
  if (vehicleRegistered && acc >= requiredCount) {
    // Ensure subscription is active, otherwise override to 7
    return {
      message: "success",
      finalStatusId: hasActiveSubscription ? 1 : 7,
    };
  }

  // 2) no vehicle: regardless of documents
  if (!vehicleRegistered) {
    return { message: "success", finalStatusId: 2 };
  }

  // 7) no subscription: driver doesn't have a subscription
  if (hasActiveSubscription === false) {
    return { message: "success", finalStatusId: 7 };
  }

  // 3) not attached doc: some required docs are missing
  if (missingRequired) {
    return { message: "success", finalStatusId: 3 };
  }

  // 4) rejected: any rejected document exists
  if (rej > 0) {
    return { message: "success", finalStatusId: 4 };
  }

  // 5) pending: any pending and none rejected
  if (pend > 0) {
    return { message: "success", finalStatusId: 5 };
  }

  // Fallback: if all accepted but vehicle not registered would have matched #2 above.
  // If inputs don't fit any case, return error for visibility.
  return {
    message: "error",
    data: "Unable to determine driver's status with provided data.",
  };
};
module.exports = { findStatusByVehicleAndDocuments };
