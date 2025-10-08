const findStatusByVehicleAndDocuments = ({
  vehicleRegistered,
  attachedDocumentsByStatus,
  requiredDocuments,
  attachedDocuments,
  unAttachedDocumentTypes,
}) => {
  // Validate essential input
  if (typeof vehicleRegistered !== "boolean") {
    return { message: "error", data: "Invalid input: vehicleRegistered." };
  }

  const requiredCount = requiredDocuments?.length || 0;
  const acc = attachedDocumentsByStatus?.ACCEPTED?.length || 0;
  const pend = attachedDocumentsByStatus?.PENDING?.length || 0;
  const rej = attachedDocumentsByStatus?.REJECTED?.length || 0;
  const missingRequired = (unAttachedDocumentTypes?.length || 0) > 0;

  // If no required documents are defined, status relies on vehicle only
  if (requiredCount === 0) {
    return {
      message: "success",
      finalStatusId: vehicleRegistered ? 1 : 2, // 1 active, 2 no vehicle
    };
  }

  // Priority order per requirements:
  // 1) active: vehicle registered AND all required docs accepted
  if (vehicleRegistered && acc === requiredCount) {
    return { message: "success", finalStatusId: 1 };
  }

  // 2) no vehicle: regardless of documents
  if (!vehicleRegistered) {
    return { message: "success", finalStatusId: 2 };
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
